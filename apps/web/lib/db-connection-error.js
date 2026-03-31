/** True when Prisma failed to open a connection (network, DNS, Atlas IP block, etc.). */
export function isDatabaseUnreachableError(error) {
  const msg = String(error?.message || "");
  return (
    msg.includes("DNS resolution") ||
    msg.includes("No route to host") ||
    msg.includes("Can't reach database server") ||
    msg.includes("Error creating a database connection") ||
    msg.includes("P1001") ||
    msg.includes("P1017") ||
    msg.includes("Server selection timeout") ||
    msg.includes("connection timed out")
  );
}

export function databaseUnavailableMessage() {
  return "Cannot reach the database. If you use MongoDB Atlas, check Network Access (your IP / VPN), DNS, and that DATABASE_URL in .env is correct. For local dev, run `npm run db:up` and set DATABASE_URL to mongodb://localhost:27017/jobcopilot.";
}
