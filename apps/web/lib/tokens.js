import { randomBytes, createHash } from "crypto";

export function generatePlainToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}
