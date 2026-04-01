/**
 * Build a plain-text report for sharing (clipboard, Slack, etc.) from audit rows + job URL.
 */

function pickMeta(rows, step) {
  const row = rows.find((r) => r.step === step);
  return row?.meta && typeof row.meta === "object" ? row.meta : null;
}

function lines(...parts) {
  return parts.filter((p) => p != null && String(p).trim() !== "").join("\n");
}

export function buildAuditShareText({ jobUrl, site, auditRows }) {
  const rows = Array.isArray(auditRows) ? auditRows : [];
  const url = String(jobUrl || "").trim() || "(no URL)";
  const host = site || (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  const analyzed = pickMeta(rows, "job_page_analyzed");
  const buttonsInv = pickMeta(rows, "page_buttons_inventory");
  const aiStrategy = pickMeta(rows, "ai_apply_strategy");
  const fieldsParsed = pickMeta(rows, "job_fields_parsed");
  const mapped = pickMeta(rows, "fields_mapped");
  const applyStart = pickMeta(rows, "apply_flow_start");
  const completed = pickMeta(rows, "completed");
  const authProbe = pickMeta(rows, "auth_probe");

  const header = lines(
    "JobCopilot — apply audit",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `Job link: ${url}`,
    host ? `Site: ${host}` : null,
    ""
  );

  const analyzerSection = analyzed
    ? lines(
        "PAGE ANALYZER (what we saw on the posting)",
        "—",
        analyzed.aiAnalyzerSummary ||
          [
            analyzed.analyzer ? `Engine: ${analyzed.analyzer}` : null,
            analyzed.parsedFieldCount != null
              ? `Form fields detected on page: ${analyzed.parsedFieldCount}`
              : null,
            Array.isArray(analyzed.signals) && analyzed.signals.length
              ? `Signals: ${analyzed.signals.map((s) => `${s.key}×${s.count}`).join(", ")}`
              : null,
            analyzed.requiresLogin != null
              ? `Requires login (inferred): ${analyzed.requiresLogin ? "yes" : "no"}`
              : null,
            analyzed.canApplyWithoutAuth != null
              ? `Can apply without auth (inferred): ${analyzed.canApplyWithoutAuth ? "yes" : "no"}`
              : null
          ]
            .filter(Boolean)
            .join(" "),
        analyzed.fetchOk === false ? "Note: page fetch may have been partial." : null,
        analyzed.statusCode != null ? `HTTP status: ${analyzed.statusCode}` : null,
        analyzed.uiSelectors
          ? lines(
              "",
              "Buttons / UI hints:",
              analyzed.uiSelectors.hasAuthForm ? "  • Login/sign-in form visible" : null,
              analyzed.uiSelectors.oauthButtons > 0
                ? `  • OAuth-style controls: ${analyzed.uiSelectors.oauthButtons}`
                : null,
              analyzed.uiSelectors.hasDisabledApplyButton ? "  • Apply control appears disabled" : null
            )
          : null,
        Array.isArray(analyzed.fieldLabelsSample) && analyzed.fieldLabelsSample.length
          ? lines(
              "",
              `Sample field labels detected (${analyzed.fieldLabelsSample.length} shown, first up to 18):`,
              analyzed.fieldLabelsSample.map((t) => `  • ${t}`).join("\n")
            )
          : null,
        ""
      )
    : lines("(No job_page_analyzed step in this log — run may be older.)", "");

  const countSection = fieldsParsed
    ? lines(
        "FIELD COUNTS (for mapping)",
        "—",
        `  • Effective fields used for mapping: ${fieldsParsed.effectiveCount ?? "?"}`,
        `  • From your client: ${fieldsParsed.providedByClient ?? 0}`,
        `  • Parsed from page: ${fieldsParsed.parsedFromPage ?? "?"}`,
        ""
      )
    : "";

  const mappingSection = mapped
    ? lines(
        "AI / PROFILE MAPPING",
        "—",
        `  • Filled from profile: ${mapped.filled ?? "?"}`,
        `  • Missing / could not fill: ${mapped.missing ?? "?"}`,
        `  • New mappings saved: ${mapped.newMappings ?? "?"}`,
        mapped.matchScore != null ? `  • Match score: ${mapped.matchScore}%` : null,
        mapped.jobStatus ? `  • Job status after map: ${mapped.jobStatus}` : null,
        Array.isArray(mapped.mappingSamples) && mapped.mappingSamples.length
          ? lines(
              "",
              "Sample mappings (field → profile slot, confidence):",
              mapped.mappingSamples
                .map((s) => {
                  const c =
                    s.confidence != null && !Number.isNaN(Number(s.confidence))
                      ? ` (${s.confidence})`
                      : "";
                  return `  • ${s.field || "?"} → ${s.profileSlot || "?"}${c}`;
                })
                .join("\n")
            )
          : null,
        Array.isArray(mapped.missingSamples) && mapped.missingSamples.length
          ? lines(
              "",
              "Sample gaps:",
              mapped.missingSamples.map((m) => `  • ${m.field || "?"}: ${m.reason || ""}`).join("\n")
            )
          : null,
        ""
      )
    : "";

  const authBit = authProbe
    ? lines(
        "SESSION / AUTH",
        "—",
        `  • Authenticated for site: ${authProbe.authenticated ? "yes" : "no"}`,
        authProbe.hadStoredSession != null
          ? `  • Had saved session: ${authProbe.hadStoredSession ? "yes" : "no"}`
          : null,
        ""
      )
    : "";

  const applyBlockedRow = rows.find((r) => r.step === "apply_blocked");
  const applySection = lines(
    applyStart
      ? `APPLY BROWSER STEP: opened job page with ${applyStart.filledFieldCount ?? "?"} mapped field(s) to fill.`
      : null,
    applyBlockedRow
      ? lines("", "APPLY OUTCOME (needs you or blocked)", "—", `  ${applyBlockedRow.message || ""}`)
      : null,
    completed ? lines("", "Apply completed automatically (submitted).", "") : null,
    ""
  );

  const tail = lines(
    "FULL STEP LOG (summary)",
    "—",
    ...rows.map((r) => `[${r.step}] ${r.message || ""}`),
    "",
    `Exported ${new Date().toISOString()}`
  );

  return lines(
    header,
    analyzerSection,
    buttonsSection,
    strategySection,
    countSection,
    mappingSection,
    authBit,
    applySection,
    tail
  ).trim();
}
