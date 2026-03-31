/** True when Prisma cannot open a connection (network, DNS, Atlas firewall, etc.). */
function isDatabaseUnavailableError(error) {
  const name = String(error?.name || "");
  const msg = String(error?.message || "");
  return (
    name === "PrismaClientInitializationError" ||
    msg.includes("DNS resolution") ||
    msg.includes("No route to host") ||
    msg.includes("Can't reach database server") ||
    msg.includes("Error creating a database connection") ||
    msg.includes("P1001") ||
    msg.includes("P1017") ||
    msg.includes("Server selection timeout") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ETIMEDOUT")
  );
}

function databaseUnavailableResponse() {
  return {
    error: "DATABASE_UNAVAILABLE",
    message:
      "Cannot reach MongoDB (network/DNS/firewall). Check VPN and Wi‑Fi, Atlas → Network Access (your IP or 0.0.0.0/0 for dev), and DATABASE_URL. For offline dev use: npm run db:up and mongodb://localhost:27017/jobcopilot"
  };
}

module.exports = {
  isDatabaseUnavailableError,
  databaseUnavailableResponse
};
