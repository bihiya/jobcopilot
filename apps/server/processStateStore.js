const crypto = require("crypto");
const { prisma } = require("./db");

const COLLECTION_NAME = "job_process_state";
let ensured = false;

async function ensureIndexes() {
  if (ensured) return;
  try {
    await prisma.$runCommandRaw({
      createIndexes: COLLECTION_NAME,
      indexes: [
        {
          key: { idempotencyKey: 1 },
          name: "idempotency_unique",
          unique: true
        }
      ]
    });
  } catch {
    // ignore if already created
  }
  ensured = true;
}

function makeIdempotencyKey({ userId, jobUrl }) {
  return crypto
    .createHash("sha256")
    .update(`${userId}::${String(jobUrl || "").trim().toLowerCase()}`)
    .digest("hex");
}

async function getProcessState({ idempotencyKey }) {
  const result = await prisma.$runCommandRaw({
    find: COLLECTION_NAME,
    filter: { idempotencyKey },
    limit: 1
  });
  return result?.cursor?.firstBatch?.[0] || null;
}

async function initializeProcessState({ idempotencyKey, userId, jobUrl, jobId }) {
  await ensureIndexes();
  const now = new Date();

  await prisma.$runCommandRaw({
    findAndModify: COLLECTION_NAME,
    query: { idempotencyKey },
    update: {
      $setOnInsert: {
        idempotencyKey,
        userId,
        jobUrl,
        createdAt: now
      },
      $set: {
        jobId,
        step: "ANALYZED",
        updatedAt: now,
        lastError: null
      }
    },
    new: true,
    upsert: true
  });
}

async function setProcessStep({ idempotencyKey, step, meta = null }) {
  await ensureIndexes();
  await prisma.$runCommandRaw({
    update: COLLECTION_NAME,
    updates: [
      {
        q: { idempotencyKey },
        u: {
          $set: {
            step,
            updatedAt: new Date(),
            ...(meta ? { meta } : {})
          }
        },
        upsert: true
      }
    ]
  });
}

async function markProcessFailure({ idempotencyKey, error }) {
  await setProcessStep({
    idempotencyKey,
    step: "FAILED",
    meta: {
      error: error || "unknown"
    }
  });
}

async function setProcessOutcome({ idempotencyKey, outcome }) {
  await ensureIndexes();
  await prisma.$runCommandRaw({
    update: COLLECTION_NAME,
    updates: [
      {
        q: { idempotencyKey },
        u: {
          $set: {
            outcome,
            outcomeReady: true,
            updatedAt: new Date()
          }
        },
        upsert: false
      }
    ]
  });
}

async function getProcessOutcome({ idempotencyKey }) {
  const state = await getProcessState({ idempotencyKey });
  if (!state?.outcomeReady) {
    return null;
  }
  return state.outcome ?? null;
}

module.exports = {
  makeIdempotencyKey,
  getProcessState,
  initializeProcessState,
  setProcessStep,
  markProcessFailure,
  setProcessOutcome,
  getProcessOutcome
};
