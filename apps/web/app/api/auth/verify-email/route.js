import prisma from "@/lib/prisma";

export async function POST(request) {
  try {
    const body = await request.json();
    const token = String(body?.token || "");

    if (!token) {
      return Response.json({ error: "Verification token is required" }, { status: 400 });
    }

    const verification = await prisma.emailVerificationToken.findUnique({
      where: { token }
    });

    if (!verification) {
      return Response.json({ error: "Invalid verification token" }, { status: 400 });
    }

    if (verification.expiresAt < new Date()) {
      await prisma.emailVerificationToken.delete({ where: { token } });
      return Response.json({ error: "Verification token has expired" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: verification.userId },
      data: { emailVerifiedAt: new Date() }
    });

    await prisma.emailVerificationToken.delete({ where: { token } });

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/auth/verify-email failed", error);
    return Response.json({ error: "Failed to verify email" }, { status: 500 });
  }
}
