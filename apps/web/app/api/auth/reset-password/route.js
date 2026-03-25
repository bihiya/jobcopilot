import prisma from "@/lib/prisma";
import { consumeToken } from "@/lib/tokens";
import { hashPassword } from "@/lib/password";

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");
    const confirmPassword = String(body?.confirmPassword || "");

    if (!token) {
      return Response.json({ error: "Token is required" }, { status: 400 });
    }

    if (!validatePassword(password)) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return Response.json({ error: "Passwords do not match" }, { status: 400 });
    }

    const verificationToken = await consumeToken({
      identifier: "password-reset",
      token
    });

    if (!verificationToken) {
      return Response.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: verificationToken.tokenPayload.email },
      select: { id: true }
    });

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/reset-password failed", error);
    return Response.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
