const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Ask OpenAI how a candidate should interact with this job posting given visible controls.
 */
async function suggestApplyStrategy({
  jobUrl,
  site,
  buttons = [],
  fieldCount = 0,
  signals = []
}) {
  const noKey = {
    usedOpenAI: false,
    model: null,
    summary:
      "Add OPENAI_API_KEY to your server environment to generate an AI apply plan. Until then: open the posting, use Apply / Sign in to apply if shown, then complete any forms.",
    steps: [
      "Open the job URL in a browser.",
      "Look for Apply, Easy Apply, or Sign in to apply.",
      "If the apply form is inside another panel or iframe, interact with that control first.",
      "Fill required fields and submit; upload resume if asked."
    ],
    primaryApplyAction: null,
    cautions: ["Automated listing of buttons may miss controls inside cross-origin iframes."]
  };

  if (!process.env.OPENAI_API_KEY) {
    return noKey;
  }

  const controlLines = (Array.isArray(buttons) ? buttons : [])
    .slice(0, 48)
    .map((b, i) => {
      const parts = [
        `${i + 1}. [${b.tag || "?"}]`,
        b.text ? `"${String(b.text).slice(0, 120)}"` : null,
        b.ariaLabel ? `aria="${String(b.ariaLabel).slice(0, 80)}"` : null,
        b.dataAutomationId ? `data-automation-id="${String(b.dataAutomationId).slice(0, 80)}"` : null,
        b.href ? `href=${String(b.href).slice(0, 80)}` : null,
        b.disabled ? "(disabled)" : null
      ].filter(Boolean);
      return parts.join(" ");
    })
    .join("\n");

  const payload = {
    jobUrl,
    site,
    approximateVisibleFormFields: fieldCount,
    signalSummary: Array.isArray(signals) ? signals : [],
    buttonsAndClickables: controlLines || "(none captured — page may use iframes or shadow DOM)"
  };

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You help job seekers understand employer ATS pages (Greenhouse, Workday, LinkedIn, etc.). " +
              "Given a URL and a list of visible buttons/links/controls (may be incomplete), return JSON only: " +
              '{ "summary": string (2-4 sentences), "steps": string[] (ordered, concrete, mention which control text to use when possible), ' +
              '"primaryApplyAction": string|null (e.g. the best Apply button to click first), "cautions": string[] (login, multi-step, iframe caveats) }'
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        ...noKey,
        summary: `${noKey.summary} (OpenAI error: ${response.status} ${errText.slice(0, 200)})`,
        usedOpenAI: false
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return { ...noKey, usedOpenAI: false };
    }

    const parsed = JSON.parse(content);
    return {
      usedOpenAI: true,
      model: "gpt-4o-mini",
      summary: String(parsed.summary || "").trim() || "See steps below.",
      steps: Array.isArray(parsed.steps) ? parsed.steps.map((s) => String(s)) : [],
      primaryApplyAction: parsed.primaryApplyAction != null ? String(parsed.primaryApplyAction) : null,
      cautions: Array.isArray(parsed.cautions) ? parsed.cautions.map((s) => String(s)) : []
    };
  } catch (e) {
    return {
      ...noKey,
      summary: `${noKey.summary} (${e?.message || "OpenAI request failed"})`,
      usedOpenAI: false
    };
  }
}

module.exports = { suggestApplyStrategy };
