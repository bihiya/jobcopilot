/**
 * Persist and shape entries for job apply / process flows (MongoDB via Prisma).
 */
async function appendJobAudit(prisma, { jobId, userId, step, message, meta }) {
  const row = await prisma.jobApplyAuditLog.create({
    data: {
      jobId,
      userId,
      step,
      message,
      ...(meta !== undefined && meta !== null ? { meta } : {})
    }
  });
  return {
    id: row.id,
    step,
    message,
    meta: row.meta ?? null,
    at: row.createdAt.toISOString()
  };
}

module.exports = { appendJobAudit };
