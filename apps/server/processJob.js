const { prisma } = require("./db");
const { appendJobAudit } = require("./jobAudit");
const { mapFieldWithAI } = require("./mapper");
const { canAutoApply } = require("./siteAuthSession");
const { runApplyFlowWithPlaywright } = require("./applyFlow");
const { analyzeJobPageAccess } = require("./jobPageAnalysis");
const { ensureDomainCredential } = require("./domainCredentialStore");
const { suggestApplyStrategy } = require("./applyStrategyAI");
const {
  makeIdempotencyKey,
  getProcessState,
  initializeProcessState,
  setProcessStep,
  markProcessFailure
} = require("./processStateStore");

function normalizeSite(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function fieldLabelsSample(parsedFields, limit = 18) {
  if (!Array.isArray(parsedFields)) return [];
  return parsedFields
    .slice(0, limit)
    .map((f) => String(f.label || f.fieldIdentifier || f.name || f.id || "").trim())
    .filter(Boolean);
}

/** Human-readable summary for audit share / meta (what the analyzer inferred from the page). */
function buildAnalyzerNarrative(pageAccess) {
  const analyzer = pageAccess.analyzer || "unknown";
  const engine =
    analyzer === "playwright"
      ? "Playwright (live DOM)"
      : analyzer === "http_fallback"
        ? "HTTP fallback (static HTML)"
        : String(analyzer);
  const sel = pageAccess.selectors || {};
  const uiBits = [];
  if (sel.hasAuthForm) uiBits.push("login/sign-in form visible");
  if (sel.oauthButtons > 0) uiBits.push(`${sel.oauthButtons} OAuth-style control(s)`);
  if (sel.hasDisabledApplyButton) uiBits.push("apply/submit control looks disabled");
  const n = Array.isArray(pageAccess.parsedFields) ? pageAccess.parsedFields.length : 0;
  const nb =
    Array.isArray(pageAccess.buttons) ? pageAccess.buttons.length : pageAccess.buttonCount ?? 0;
  const fs = pageAccess.framesSampled != null ? ` (${pageAccess.framesSampled} frame(s) scanned)` : "";
  const accessLine = pageAccess.canApplyWithoutAuth
    ? "Inference: can likely apply without a prior employer login (public or one-click apply path)."
    : pageAccess.requiresLogin
      ? "Inference: employer login likely required before applying."
      : pageAccess.requiresSignup
        ? "Inference: account creation may be required."
        : "Inference: access pattern mixed or unclear—review the posting.";
  const sigLine =
    Array.isArray(pageAccess.signals) && pageAccess.signals.length
      ? `Signal hits: ${pageAccess.signals.map((s) => `${s.key}×${s.count}`).join(", ")}.`
      : "No strong keyword signals in page text.";
  return [
    `Analyzer engine: ${engine}.`,
    `Scanned ~${n} apply-form field(s) and ~${nb} button/link control(s)${fs}.`,
    uiBits.length ? `UI/controls: ${uiBits.join("; ")}.` : null,
    sigLine,
    accessLine
  ]
    .filter(Boolean)
    .join(" ");
}

function getValueFromProfile(profile, mappedTo) {
  if (!profile || !mappedTo) {
    return null;
  }

  if (mappedTo === "email") {
    return profile.user?.email ?? null;
  }

  if (mappedTo === "name") {
    return profile.user?.name ?? null;
  }

  if (mappedTo === "phone") {
    return profile.phone ?? null;
  }

  if (mappedTo === "experience") {
    return profile.experience ?? null;
  }

  if (mappedTo === "skills") {
    if (Array.isArray(profile.skills)) {
      return profile.skills.join(", ");
    }

    if (typeof profile.skills === "string") {
      return profile.skills;
    }
  }

  if (mappedTo === "resumeUrl") {
    return profile.resumeUrl ?? null;
  }

  if (mappedTo === "dateOfBirth") {
    if (!profile.dateOfBirth) return null;
    const d = new Date(profile.dateOfBirth);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (mappedTo === "currentLocation") return profile.currentLocation ?? null;
  if (mappedTo === "currentSalary") return profile.currentSalary ?? null;
  if (mappedTo === "expectedSalary") return profile.expectedSalary ?? null;
  if (mappedTo === "noticePeriod") return profile.noticePeriod ?? null;
  if (mappedTo === "linkedInUrl") return profile.linkedInUrl ?? null;
  if (mappedTo === "portfolioUrl") return profile.portfolioUrl ?? null;
  if (mappedTo === "headline") return profile.headline ?? null;
  if (mappedTo === "education") return profile.education ?? null;

  return null;
}

async function saveNewMapping({ userId, site, fieldIdentifier, mappedTo, confidence }) {
  if (!fieldIdentifier || !mappedTo) {
    return;
  }

  await prisma.mapping.upsert({
    where: {
      userId_site_fieldIdentifier: {
        userId,
        site,
        fieldIdentifier
      }
    },
    update: {
      mappedTo,
      confidence
    },
    create: {
      userId,
      site,
      fieldIdentifier,
      mappedTo,
      confidence
    }
  });
}

async function prepareProcessJob({ userId, jobUrl, formFields = [] }) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const idempotencyKey = makeIdempotencyKey({ userId, jobUrl });
  const existingState = await getProcessState({ idempotencyKey });
  if (
    existingState?.jobId &&
    (existingState?.step === "SUBMITTED" || existingState?.step === "COMPLETED")
  ) {
    const previousJob = await prisma.job.findUnique({
      where: { id: existingState.jobId }
    });
    if (previousJob) {
      return {
        resumed: true,
        job: previousJob,
        site: normalizeSite(jobUrl),
        jobUrl: previousJob.url || jobUrl,
        idempotencyKey,
        processState: existingState
      };
    }
  }

  const trimmedJobUrl = typeof jobUrl === "string" ? jobUrl.trim() : "";
  if (!trimmedJobUrl) {
    throw new Error("jobUrl is required");
  }

  const site = normalizeSite(trimmedJobUrl);

  const profileInclude = {
    user: {
      select: {
        email: true,
        name: true
      }
    }
  };

  let profile = await prisma.userProfile.findUnique({
    where: { userId },
    include: profileInclude
  });

  if (!profile) {
    await prisma.userProfile.create({
      data: { userId }
    });
    profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: profileInclude
    });
  }

  if (!profile) {
    throw new Error("Failed to load user profile");
  }

  const job = await prisma.job.create({
    data: {
      userId,
      url: trimmedJobUrl,
      status: "pending"
    }
  });
  await initializeProcessState({ idempotencyKey, userId, jobUrl: trimmedJobUrl, jobId: job.id });

  return {
    resumed: false,
    userId,
    job,
    profile,
    site,
    jobUrl: trimmedJobUrl,
    formFields,
    idempotencyKey
  };
}

async function runProcessJobPipeline(ctx, options = {}) {
  const { broadcastAudit } = options;
  const { userId, job, profile, site, formFields, idempotencyKey } = ctx;
  const jobUrl = ctx.jobUrl ?? job?.url;
  if (!jobUrl) {
    throw new Error("runProcessJobPipeline: jobUrl is missing from context and job.url");
  }

  const processingSteps = [];

  async function audit(step, message, meta) {
    try {
      const row = await appendJobAudit(prisma, { jobId: job.id, userId, step, message, meta });
      processingSteps.push(row);
      if (row.id && broadcastAudit) {
        broadcastAudit({
          jobId: job.id,
          userId,
          entry: {
            id: row.id,
            step: row.step,
            message: row.message,
            meta: row.meta ?? null,
            at: row.at
          }
        });
      }
    } catch (err) {
      console.error("Job audit log failed:", err);
      processingSteps.push({
        step,
        message,
        meta: meta ?? null,
        at: new Date().toISOString()
      });
    }
  }

  await audit("job_created", `Job saved (${site})`, { site, url: jobUrl });
  await audit(
    "profile_ready",
    "Profile loaded for mapping",
    {
      hasPhone: Boolean(profile.phone),
      hasExperience: Boolean(profile.experience),
      hasResume: Boolean(profile.resumeUrl),
      hasHeadline: Boolean(profile.headline),
      hasLocation: Boolean(profile.currentLocation),
      hasLinkedIn: Boolean(profile.linkedInUrl)
    }
  );

  const pageAccess = await analyzeJobPageAccess({ jobUrl });
  await setProcessStep({
    idempotencyKey,
    step: "ANALYZED",
    meta: {
      analyzer: pageAccess.analyzer,
      signals: pageAccess.signals,
      fetchOk: pageAccess.fetchOk
    }
  });
  await audit("job_page_analyzed", "Job page access analysis complete", {
    site,
    analyzed: pageAccess.analyzed,
    fetchOk: pageAccess.fetchOk,
    statusCode: pageAccess.statusCode,
    requiresLogin: pageAccess.requiresLogin,
    requiresSignup: pageAccess.requiresSignup,
    canApplyWithoutAuth: pageAccess.canApplyWithoutAuth,
    signals: pageAccess.signals,
    error: pageAccess.error || null,
    analyzer: pageAccess.analyzer,
    aiAnalyzerSummary: buildAnalyzerNarrative(pageAccess),
    parsedFieldCount: Array.isArray(pageAccess.parsedFields) ? pageAccess.parsedFields.length : 0,
    fieldLabelsSample: fieldLabelsSample(pageAccess.parsedFields, 18),
    uiSelectors: pageAccess.selectors || null,
    buttonCount: Array.isArray(pageAccess.buttons)
      ? pageAccess.buttons.length
      : pageAccess.buttonCount ?? 0,
    framesSampled: pageAccess.framesSampled,
    frameCount: pageAccess.frameCount
  });

  const pageButtons = Array.isArray(pageAccess.buttons) ? pageAccess.buttons : [];
  await audit("page_buttons_inventory", `Captured ${pageButtons.length} clickable control(s) (main page + iframes)`, {
    count: pageButtons.length,
    framesSampled: pageAccess.framesSampled,
    frameCount: pageAccess.frameCount,
    buttons: pageButtons.slice(0, 45)
  });

  const applyPlan = await suggestApplyStrategy({
    jobUrl,
    site,
    buttons: pageButtons,
    fieldCount: Array.isArray(pageAccess.parsedFields) ? pageAccess.parsedFields.length : 0,
    signals: pageAccess.signals
  });

  const strategyMsg =
    applyPlan.summary && applyPlan.summary.length > 280
      ? `${applyPlan.summary.slice(0, 277)}…`
      : applyPlan.summary || "Apply strategy recorded.";

  await audit("ai_apply_strategy", strategyMsg, {
    usedOpenAI: applyPlan.usedOpenAI,
    model: applyPlan.model || null,
    summary: applyPlan.summary,
    steps: applyPlan.steps,
    primaryApplyAction: applyPlan.primaryApplyAction,
    cautions: applyPlan.cautions
  });

  const authProbe = await canAutoApply({ userId, site, jobUrl });
  const authProbeMessage = authProbe.authenticated
    ? authProbe.hadStoredSession
      ? "Saved site session present"
      : `No saved session needed (${authProbe.probeReason || "public or open apply"})`
    : "Employer login or account required — connect this site in JobCopilot";
  await audit("auth_probe", authProbeMessage, {
    site,
    authenticated: authProbe.authenticated,
    hadStoredSession: authProbe.hadStoredSession,
    probeReason: authProbe.probeReason
  });

  const effectiveFormFields =
    Array.isArray(formFields) && formFields.length > 0
      ? formFields
      : pageAccess.parsedFields || [];
  await audit("job_fields_parsed", "Resolved candidate form fields for mapping", {
    providedByClient: Array.isArray(formFields) ? formFields.length : 0,
    parsedFromPage: Array.isArray(pageAccess.parsedFields) ? pageAccess.parsedFields.length : 0,
    effectiveCount: effectiveFormFields.length
  });

  let domainCredential = null;
  if (!pageAccess.canApplyWithoutAuth) {
    domainCredential = await ensureDomainCredential({
      userId,
      site,
      email: profile.user?.email
    });

    await audit(
      "domain_credentials",
      domainCredential.createdNow
        ? "Created domain credentials for site"
        : "Reused existing domain credentials for site",
      {
        site,
        username: domainCredential.username,
        createdNow: domainCredential.createdNow
      }
    );
    await setProcessStep({
      idempotencyKey,
      step: "CREDENTIAL_READY",
      meta: {
        site,
        status: domainCredential.status,
        failureCount: domainCredential.failureCount
      }
    });
  }

  let authState;
  if (!pageAccess.canApplyWithoutAuth && pageAccess.requiresLogin) {
    authState = {
      authenticated: authProbe.authenticated,
      hadStoredSession: authProbe.hadStoredSession
    };
    await audit("auth_check", authState.authenticated ? "Site session authenticated" : "Site session missing or expired", {
      site,
      authenticated: authState.authenticated,
      hadStoredSession: authState.hadStoredSession
    });
  } else {
    authState = { authenticated: true, hadStoredSession: authProbe.hadStoredSession };
    await audit("auth_check", "Auth session check skipped (direct apply path)", {
      site,
      authenticated: true,
      hadStoredSession: authProbe.hadStoredSession
    });
  }

  await setProcessStep({
    idempotencyKey,
    step: "AUTH_READY",
    meta: {
      authenticated: authState.authenticated,
      requiresLogin: pageAccess.requiresLogin
    }
  });

  if (!authState.authenticated) {
    await setProcessStep({
      idempotencyKey,
      step: "AUTH_REQUIRED",
      meta: {
        site
      }
    });
    const blockedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "auth_required"
      }
    });

    return {
      job: blockedJob,
      site,
      requiresAuth: true,
      connectUrl: `/api/site-auth/start`,
      blocker: {
        type: "auth_required",
        site,
        message: `This posting on ${site} looks like it needs an employer login or account. Connect this site once in JobCopilot, sign in there, then try again.`
      },
      domainCredential,
      pageAccess,
      filledFields: [],
      missingFields: [],
      reusedMappings: 0,
      newMappingsSaved: 0,
      idempotencyKey,
      processState: {
        step: "AUTH_REQUIRED"
      },
      processingSteps
    };
  }

  const existingMappings = await prisma.mapping.findMany({
    where: {
      userId,
      site
    }
  });

  await audit("mappings_loaded", `Loaded ${existingMappings.length} saved field mapping(s) for ${site}`, {
    count: existingMappings.length
  });

  const mappingByField = new Map(
    existingMappings.map((mapping) => [mapping.fieldIdentifier, mapping])
  );

  const filledFields = [];
  const missingFields = [];
  const createdMappings = [];

  for (const field of effectiveFormFields) {
    const fieldIdentifier =
      field.fieldIdentifier || field.id || field.name || field.label || "";
    const existingMapping = mappingByField.get(fieldIdentifier);

    if (existingMapping) {
      const value = getValueFromProfile(profile, existingMapping.mappedTo);

      if (value === null || value === undefined || value === "") {
        missingFields.push({
          fieldIdentifier,
          reason: `Profile value missing for mapped field "${existingMapping.mappedTo}"`
        });
        continue;
      }

      filledFields.push({
        fieldIdentifier,
        mappedTo: existingMapping.mappedTo,
        confidence: existingMapping.confidence,
        value
      });
      continue;
    }

    const mappedResult = await mapFieldWithAI({ field, profile, site });
    const mappedTo = mappedResult?.mappedTo ?? null;
    const confidence = mappedResult?.confidence ?? 0;
    const value = getValueFromProfile(profile, mappedTo);

    if (value === null || value === undefined || value === "") {
      missingFields.push({
        fieldIdentifier,
        reason: mappedTo
          ? `Profile value missing for mapped field "${mappedTo}"`
          : "Could not map field"
      });
      continue;
    }

    filledFields.push({
      fieldIdentifier,
      mappedTo,
      confidence,
      value
    });

    if (mappedTo) {
      await saveNewMapping({
        userId,
        site,
        fieldIdentifier,
        mappedTo,
        confidence
      });

      createdMappings.push({
        fieldIdentifier,
        mappedTo,
        confidence
      });
    }
  }

  const status = missingFields.length > 0 ? "pending" : "ready";
  const matchScore =
    effectiveFormFields.length === 0
      ? 0
      : Math.round((filledFields.length / effectiveFormFields.length) * 100);

  const updatedJob = await prisma.job.update({
    where: { id: job.id },
    data: {
      status,
      matchScore
    }
  });

  const preApplyStatus = status;

  await audit("fields_mapped", "Field mapping pass complete", {
    filled: filledFields.length,
    missing: missingFields.length,
    newMappings: createdMappings.length,
    jobStatus: status,
    matchScore,
    mappingSamples: filledFields.slice(0, 12).map((f) => ({
      field: f.fieldIdentifier,
      profileSlot: f.mappedTo,
      confidence:
        f.confidence != null && !Number.isNaN(Number(f.confidence))
          ? Math.round(Number(f.confidence) * 100) / 100
          : null
    })),
    missingSamples: missingFields.slice(0, 8).map((m) => ({
      field: m.fieldIdentifier,
      reason: m.reason
    }))
  });
  await setProcessStep({
    idempotencyKey,
    step: "FORM_MAPPED",
    meta: {
      filled: filledFields.length,
      missing: missingFields.length,
      matchScore
    }
  });

  await prisma.job.update({
    where: { id: job.id },
    data: { status: "applying" }
  });

  await audit("apply_flow_start", "Opening job page to verify session / apply", {
    filledFieldCount: filledFields.length,
    jobStatus: "applying"
  });

  const applyResult = await runApplyFlowWithPlaywright({
    userId,
    site,
    jobUrl,
    filledFields,
    skipAuthVerification: pageAccess.canApplyWithoutAuth,
    allowWithoutSavedSession:
      pageAccess.canApplyWithoutAuth || (authProbe.authenticated && !authProbe.hadStoredSession)
  });

  if (applyResult?.blocker) {
    const isCaptcha = applyResult.blocker.type === "captcha";
    if (isCaptcha) {
      await setProcessStep({
        idempotencyKey,
        step: "CAPTCHA_REQUIRED",
        meta: {
          message: applyResult.blocker.message || "Captcha challenge detected"
        }
      });
    } else {
      await markProcessFailure({
        idempotencyKey,
        error: applyResult.blocker.message || "Apply blocked"
      });
    }
    const blockedMessage = applyResult?.manualPrefill?.fields?.length
      ? `${applyResult.blocker.message} Manual prefill bundle generated.`
      : applyResult.blocker.message || "Apply flow blocked";
    await audit("apply_blocked", blockedMessage, {
      type: applyResult.blocker.type,
      fillSummary: applyResult.fillSummary ?? null
    });
    return {
      job: updatedJob,
      site,
      requiresAuth: false,
      blocker: applyResult.blocker,
      applyResult,
      fillSummary: applyResult.fillSummary ?? null,
      filledFields,
      missingFields,
      reusedMappings: existingMappings.length,
      newMappingsSaved: createdMappings.length,
      pageAccess,
      domainCredential,
      idempotencyKey,
      processState: {
        step: isCaptcha ? "CAPTCHA_REQUIRED" : "FAILED"
      },
      processingSteps
    };
  }

  if (applyResult?.applied) {
    const appliedJob = await prisma.job.update({
      where: { id: updatedJob.id },
      data: { status: "applied" }
    });

    await audit("applied", "Marked as applied after automated flow", {});
    await setProcessStep({
      idempotencyKey,
      step: "COMPLETED",
      meta: {
        jobId: appliedJob.id,
        submittedAt: applyResult.submittedAt || new Date().toISOString()
      }
    });
    await audit("completed", "Application process completed automatically", {
      jobId: appliedJob.id
    });
    return {
      job: appliedJob,
      site,
      requiresAuth: false,
      applyResult,
      filledFields,
      missingFields,
      reusedMappings: existingMappings.length,
      newMappingsSaved: createdMappings.length,
      pageAccess,
      domainCredential,
      idempotencyKey,
      processState: {
        step: "COMPLETED"
      },
      processingSteps
    };
  }

  await audit(
    "apply_flow_complete",
    applyResult?.note || "Apply flow finished (no auto-submit)",
    { fillSummary: applyResult.fillSummary ?? null }
  );

  const afterApplyJob = await prisma.job.update({
    where: { id: job.id },
    data: { status: preApplyStatus, matchScore }
  });

  return {
    job: afterApplyJob,
    site,
    requiresAuth: false,
    applyResult,
    fillSummary: applyResult.fillSummary ?? null,
    applyNote: applyResult?.note ?? null,
    filledFields,
    missingFields,
    reusedMappings: existingMappings.length,
    newMappingsSaved: createdMappings.length,
    pageAccess,
    domainCredential,
    idempotencyKey,
    processState: {
      step: "APPLY_ATTEMPTED"
    },
    processingSteps
  };
}

async function processJob(body, options = {}) {
  const prep = await prepareProcessJob(body);
  if (prep.resumed) {
    return {
      job: prep.job,
      site: prep.site,
      resumed: true,
      idempotencyKey: prep.idempotencyKey,
      processState: prep.processState
    };
  }
  return runProcessJobPipeline(prep, options);
}

module.exports = {
  processJob,
  prepareProcessJob,
  runProcessJobPipeline
};
