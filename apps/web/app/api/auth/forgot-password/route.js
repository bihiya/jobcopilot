import prisma from "@/lib/prisma";
import { issueResetPasswordToken } from "@/lib/tokens";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    });

    // Do not leak whether user exists.
    if (!user) {
      return Response.json({
        ok: true,
        message: "If the email exists, a reset link has been generated."
      });
    }

    const tokenRecord = await issueResetPasswordToken(user.id);
    const resetUrl = `/login?mode=reset&token=${encodeURIComponent(tokenRecord.token)}`;

    return Response.json({
      ok: true,
      message: "Reset link generated.",
      resetUrl
    });
  } catch (error) {
    console.error("POST /api/auth/forgot-password failed", error);
    return Response.json({ error: "Failed to generate reset link" }, { status: 500 });
  }
}
