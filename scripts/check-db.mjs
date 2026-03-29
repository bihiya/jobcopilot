#!/usr/bin/env node
/**
 * Quick Prisma connectivity check before dev. Prints status; always exits 0
 * so `npm run dev` still starts if the DB is down.
 */
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONNECT_TIMEOUT_MS = 12_000;

try {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
} catch {
  /* optional */
}

const dim = "\x1b[90m";
const grn = "\x1b[32m";
const yel = "\x1b[33m";
const rst = "\x1b[0m";
const tag = `${dim}[jobcopilot]${rst}`;

if (!process.env.DATABASE_URL?.trim()) {
  console.log(`${tag} Database: ${yel}not configured${rst} (set DATABASE_URL in .env)`);
  process.exit(0);
}

let PrismaClient;
try {
  ({ PrismaClient } = await import("@prisma/client"));
} catch {
  console.log(
    `${tag} Database: ${yel}skipped${rst} (run ${dim}npm run prisma:generate${rst} from repo root)`
  );
  process.exit(0);
}

const url = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  log: [],
  datasources: { db: { url } }
});

const label = url.includes("mongodb+srv")
  ? "MongoDB Atlas"
  : url.startsWith("mongodb://")
    ? "MongoDB"
    : "database";

try {
  await Promise.race([
    prisma.$connect(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`No response within ${CONNECT_TIMEOUT_MS / 1000}s`)),
        CONNECT_TIMEOUT_MS
      )
    )
  ]);
  console.log(`${tag} Database: ${grn}connected${rst} (${label})`);
} catch (e) {
  const msg = String(e?.message || e).replace(/\s+/g, " ").trim();
  console.log(`${tag} Database: ${yel}not connected${rst} — ${msg}`);
  console.log(
    `${tag} ${dim}Dev servers will still start. Check Atlas Network Access, VPN, and DNS if you need the DB.${rst}`
  );
} finally {
  await prisma.$disconnect().catch(() => {});
}
