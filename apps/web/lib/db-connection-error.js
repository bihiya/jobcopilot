/** True when Prisma failed to open a connection (network, DNS, Atlas IP block, etc.). */
export function isDatabaseUnreachableError(error) {
  const msg = String(error?.message || "");
  return (
    msg.includes("DNS resolution") ||
    msg.includes("Can't reach database server") ||
    msg.includes("Error creating a database connection") ||
    msg.includes("P1001") ||
    msg.includes("P1017") ||
    msg.includes("Server selection timeout") ||
    msg.includes("connection timed out")
  );
}

export function databaseUnavailableMessage() {
  return "Cannot reach the database. Check your network or VPN, DNS, and MongoDB Atlas → Network Access (allow your IP or 0.0.0.0/0 for local dev).";
}
