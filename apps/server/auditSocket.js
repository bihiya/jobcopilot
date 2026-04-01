const crypto = require("crypto");
const { Server } = require("socket.io");

function getSocketSecret() {
  return process.env.AUDIT_SOCKET_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function verifyAuditSocketToken(token) {
  const secret = getSocketSecret();
  if (!secret || !token || typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (expected !== sig) {
    return null;
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (data.exp < Date.now()) {
    return null;
  }
  if (!data.userId || !data.jobId) {
    return null;
  }
  return data;
}

/**
 * @param {import("http").Server} httpServer
 */
function attachAuditSocket(httpServer) {
  const allowedOrigins = [
    process.env.APP_BASE_URL,
    process.env.NEXTAUTH_URL,
    "http://localhost:3000"
  ].filter(Boolean);

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      methods: ["GET", "POST"]
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const data = verifyAuditSocketToken(token);
    if (!data) {
      return next(new Error("unauthorized"));
    }
    socket.userId = data.userId;
    socket.jobId = data.jobId;
    next();
  });

  io.on("connection", (socket) => {
    socket.join(`audit:${socket.userId}:${socket.jobId}`);
  });

  function broadcastAudit({ jobId, userId, entry }) {
    io.to(`audit:${userId}:${jobId}`).emit("audit:entry", entry);
  }

  return { io, broadcastAudit };
}

module.exports = { attachAuditSocket, verifyAuditSocketToken };
