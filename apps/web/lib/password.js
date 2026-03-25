import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${Buffer.from(derivedKey).toString("hex")}`;
}

export async function verifyPassword(password, encodedHash) {
  if (!encodedHash) {
    return false;
  }

  const normalized = encodedHash.startsWith("scrypt:")
    ? encodedHash.slice("scrypt:".length)
    : encodedHash;

  if (!normalized.includes(":")) {
    return false;
  }

  const [salt, hashHex] = normalized.split(":");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  const storedKey = Buffer.from(hashHex, "hex");
  const computedKey = Buffer.from(derivedKey);

  if (storedKey.length !== computedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKey, computedKey);
}
