const { prisma } = require("./db");
const { appendJobAudit } = require("./jobAudit");
const { mapFieldWithAI } = require("./mapper");
const { canAutoApply } = require("./siteAuthSession");
const { runApplyFlowWithPlaywright } = require("./applyFlow");
const { analyzeJobPageAccess } = require("./jobPageAnalysis");
const { ensureDomainCredential } = require("./domainCredentialStore");

function normalizeSite(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
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

async function processJob({ userId, jobUrl, formFields = [] }) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const site = normalizeSite(jobUrl);

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
      url: jobUrl,
      status: "pending"
    }
  });

  const processingSteps = [];

  async function audit(step, message, meta) {
    try {
      const row = await appendJobAudit(prisma, { jobId: job.id, userId, step, message, meta });
      processingSteps.push(row);
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
      hasResume: Boolean(profile.resumeUrl)
    }
  );

  const pageAccess = await analyzeJobPageAccess({ jobUrl });
  await audit("job_page_analyzed", "Job page access analysis complete", {
    site,
    analyzed: pageAccess.analyzed,
    fetchOk: pageAccess.fetchOk,
    statusCode: pageAccess.statusCode,
    requiresLogin: pageAccess.requiresLogin,
    requiresSignup: pageAccess.requiresSignup,
    canApplyWithoutAuth: pageAccess.canApplyWithoutAuth,
    signals: pageAccess.signals,
    error: pageAccess.error || null
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
  }

  let authState = { authenticated: true };
  if (!pageAccess.canApplyWithoutAuth && pageAccess.requiresLogin) {
    authState = await canAutoApply({ userId, site });
    await audit("auth_check", authState.authenticated ? "Site session authenticated" : "Site session missing or expired", {
      site,
      authenticated: authState.authenticated
    });
  } else {
    await audit("auth_check", "Auth session check skipped (direct apply path)", {
      site,
      authenticated: true
    });
  }

  if (!authState.authenticated) {
    const blockedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "pending"
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
        message: `Login required for ${site}. Connect this site once to continue.`
      },
      domainCredential,
      pageAccess,
      filledFields: [],
      missingFields: [],
      reusedMappings: 0,
      newMappingsSaved: 0,
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

  await audit("fields_mapped", "Field mapping pass complete", {
    filled: filledFields.length,
    missing: missingFields.length,
    newMappings: createdMappings.length,
    jobStatus: status,
    matchScore
  });

  await audit("apply_flow_start", "Opening job page to verify session / apply", {
    filledFieldCount: filledFields.length
  });

  const applyResult = await runApplyFlowWithPlaywright({
    userId,
    site,
    jobUrl,
    filledFields,
    skipAuthVerification: pageAccess.canApplyWithoutAuth
  });

  if (applyResult?.blocker) {
    await audit("apply_blocked", applyResult.blocker.message || "Apply flow blocked", {
      type: applyResult.blocker.type
    });
    return {
      job: updatedJob,
      site,
      requiresAuth: false,
      blocker: applyResult.blocker,
      filledFields,
      missingFields,
      reusedMappings: existingMappings.length,
      newMappingsSaved: createdMappings.length,
      pageAccess,
      domainCredential,
      processingSteps
    };
  }

  if (applyResult?.applied) {
    const appliedJob = await prisma.job.update({
      where: { id: updatedJob.id },
      data: { status: "applied" }
    });

    await audit("applied", "Marked as applied after automated flow", {});
    return {
      job: appliedJob,
      site,
      requiresAuth: false,
      filledFields,
      missingFields,
      reusedMappings: existingMappings.length,
      newMappingsSaved: createdMappings.length,
      pageAccess,
      domainCredential,
      processingSteps
    };
  }

  await audit(
    "apply_flow_complete",
    applyResult?.note || "Apply flow finished (no auto-submit)",
    {}
  );

  return {
    job: updatedJob,
    site,
    requiresAuth: false,
    filledFields,
    missingFields,
    reusedMappings: existingMappings.length,
    newMappingsSaved: createdMappings.length,
    pageAccess,
    domainCredential,
    processingSteps
  };
}

module.exports = {
  processJob
};
