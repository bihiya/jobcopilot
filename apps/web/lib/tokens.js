import { randomBytes, createHash } from "crypto";

export function generatePlainToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function generateToken() {
  return generatePlainToken();
}

export function createTokenHash(token) {
  return hashToken(token);
}

export async function issueResetPasswordToken({ userId, expiresAt, prisma }) {
  const plainToken = generatePlainToken();
  const tokenHash = hashToken(plainToken);

  const token = await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt
    }
  });

  return { token, plainToken };
}

export async function consumeToken({ prisma, model, token, whereExtra = {}, updateData = {} }) {
  const tokenHash = hashToken(token);

  const existing = await prisma[model].findFirst({
    where: {
      tokenHash,
      consumedAt: null,
      ...whereExtra
    }
  });

  if (!existing) {
    return null;
  }

  await prisma[model].update({
    where: { id: existing.id },
    data: {
      consumedAt: new Date(),
      ...updateData
    }
  });

  return existing;
}
