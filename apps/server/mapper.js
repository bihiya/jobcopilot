const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const VALID_PROFILE_KEYS = [
  "name",
  "email",
  "phone",
  "dateOfBirth",
  "currentLocation",
  "currentSalary",
  "expectedSalary",
  "noticePeriod",
  "linkedInUrl",
  "portfolioUrl",
  "headline",
  "education",
  "experience",
  "skills",
  "resumeUrl"
];

function normalizeConfidence(value, fallback = 0.5) {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return fallback;
  return Math.max(0, Math.min(numberValue, 1));
}

function pickFieldIdentifier(field) {
  return field.fieldIdentifier || field.id || field.name || field.label || "";
}

function heuristicMapField(field) {
  const source = `${field?.name || ""} ${field?.id || ""} ${field?.label || ""}`.toLowerCase();

  if (source.includes("email")) return { mappedTo: "email", confidence: 0.95 };
  if (source.includes("linkedin")) return { mappedTo: "linkedInUrl", confidence: 0.9 };
  if (source.includes("phone") || source.includes("mobile") || source.includes("tel")) {
    return { mappedTo: "phone", confidence: 0.9 };
  }
  if (source.includes("resume") || source.includes("cv") || source.includes("upload")) {
    return { mappedTo: "resumeUrl", confidence: 0.88 };
  }
  if (source.includes("portfolio") || source.includes("website") || source.includes("github")) {
    return { mappedTo: "portfolioUrl", confidence: 0.82 };
  }
  if (source.includes("birth") || source.includes("dob") || source.includes("date of birth")) {
    return { mappedTo: "dateOfBirth", confidence: 0.88 };
  }
  if (source.includes("current salary") || source.includes("present salary")) {
    return { mappedTo: "currentSalary", confidence: 0.85 };
  }
  if (source.includes("expected") && source.includes("salary")) {
    return { mappedTo: "expectedSalary", confidence: 0.85 };
  }
  if (source.includes("salary") || source.includes("compensation") || source.includes("ctc")) {
    return { mappedTo: "expectedSalary", confidence: 0.72 };
  }
  if (source.includes("location") || source.includes("city") || source.includes("address")) {
    return { mappedTo: "currentLocation", confidence: 0.8 };
  }
  if (source.includes("notice")) return { mappedTo: "noticePeriod", confidence: 0.85 };
  if (source.includes("headline") || source.includes("title") || source.includes("position desired")) {
    return { mappedTo: "headline", confidence: 0.78 };
  }
  if (source.includes("education") || source.includes("degree") || source.includes("university")) {
    return { mappedTo: "education", confidence: 0.8 };
  }
  if (source.includes("experience") || source.includes("years")) {
    return { mappedTo: "experience", confidence: 0.85 };
  }
  if (source.includes("skill")) return { mappedTo: "skills", confidence: 0.85 };
  if (source.includes("name") || source.includes("full name")) return { mappedTo: "name", confidence: 0.86 };

  return { mappedTo: null, confidence: 0 };
}

async function mapFieldWithAI({ field, profile }) {
  const fieldIdentifier = pickFieldIdentifier(field);
  if (!fieldIdentifier) {
    return { mappedTo: null, confidence: 0 };
  }

  if (!process.env.OPENAI_API_KEY) {
    return heuristicMapField(field);
  }

  const promptPayload = {
    field: {
      id: field.id ?? null,
      name: field.name ?? null,
      label: field.label ?? null,
      placeholder: field.placeholder ?? null
    },
    availableProfileKeys: VALID_PROFILE_KEYS,
    profilePreview: {
      hasName: Boolean(profile?.user?.name),
      hasEmail: Boolean(profile?.user?.email),
      hasPhone: Boolean(profile?.phone),
      hasDateOfBirth: Boolean(profile?.dateOfBirth),
      hasCurrentLocation: Boolean(profile?.currentLocation),
      hasCurrentSalary: Boolean(profile?.currentSalary),
      hasExpectedSalary: Boolean(profile?.expectedSalary),
      hasNoticePeriod: Boolean(profile?.noticePeriod),
      hasLinkedInUrl: Boolean(profile?.linkedInUrl),
      hasPortfolioUrl: Boolean(profile?.portfolioUrl),
      hasHeadline: Boolean(profile?.headline),
      hasEducation: Boolean(profile?.education),
      hasExperience: Boolean(profile?.experience),
      hasSkills: Boolean(profile?.skills),
      hasResumeUrl: Boolean(profile?.resumeUrl)
    }
  };

  const keysList = VALID_PROFILE_KEYS.join(",");

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Map one job application form field to a single user profile key. Return JSON only with shape: { mappedTo: string|null, confidence: number } using one of: ${keysList}.`
        },
        {
          role: "user",
          content: JSON.stringify(promptPayload)
        }
      ]
    })
  });

  if (!response.ok) {
    return heuristicMapField(field);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    return heuristicMapField(field);
  }

  try {
    const parsed = JSON.parse(content);
    const mappedTo = VALID_PROFILE_KEYS.includes(parsed?.mappedTo) ? parsed.mappedTo : null;
    const confidence = normalizeConfidence(parsed?.confidence, mappedTo ? 0.6 : 0);
    return { mappedTo, confidence };
  } catch {
    return heuristicMapField(field);
  }
}

module.exports = {
  mapFieldWithAI
};
