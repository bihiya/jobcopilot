const { prisma } = require("./db");
const { mapFieldWithAI } = require("./mapper");

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

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          email: true,
          name: true
        }
      }
    }
  });

  if (!profile) {
    throw new Error("User profile not found for this user");
  }

  const job = await prisma.job.create({
    data: {
      userId,
      url: jobUrl,
      status: "pending"
    }
  });

  const existingMappings = await prisma.mapping.findMany({
    where: {
      userId,
      site
    }
  });

  const mappingByField = new Map(
    existingMappings.map((mapping) => [mapping.fieldIdentifier, mapping])
  );

  const filledFields = [];
  const missingFields = [];
  const createdMappings = [];

  for (const field of formFields) {
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
    formFields.length === 0
      ? 0
      : Math.round((filledFields.length / formFields.length) * 100);

  const updatedJob = await prisma.job.update({
    where: { id: job.id },
    data: {
      status,
      matchScore
    }
  });

  return {
    job: updatedJob,
    site,
    filledFields,
    missingFields,
    reusedMappings: existingMappings.length,
    newMappingsSaved: createdMappings.length
  };
}

module.exports = {
  processJob
};
