import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

/**
 * Load monorepo root `.env`. Prefer `process.cwd()` (reliable under Next/Turbopack);
 * fall back to paths from this file.
 */
function loadRootEnv() {
  const fromThisFile = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
    path.resolve(fromThisFile, "..", "..", "..", ".env"),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
      return envPath;
    }
  }
  return null;
}

loadRootEnv();

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const globalForPrisma = globalThis;

const prevUrl = globalForPrisma.__prismaDatabaseUrl;
if (globalForPrisma.prisma && prevUrl !== databaseUrl) {
  const stale = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  globalForPrisma.__prismaDatabaseUrl = undefined;
  stale.$disconnect().catch(() => {});
}

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error"],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.__prismaDatabaseUrl = databaseUrl;
}

export { prisma };
export default prisma;
