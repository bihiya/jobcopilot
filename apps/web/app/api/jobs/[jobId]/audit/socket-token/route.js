import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const DEFAULT_SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function POST(_request, context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const secret = process.env.AUDIT_SOCKET_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: session.user.id },
      select: { id: true }
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const payloadObj = {
      userId: session.user.id,
      jobId,
      exp: Date.now() + 20 * 60 * 1000
    };
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
    const token = `${payloadB64}.${sig}`;

    return NextResponse.json({
      token,
      socketUrl: process.env.NEXT_PUBLIC_SERVER_URL || DEFAULT_SERVER_URL
    });
  } catch (error) {
    console.error("audit socket-token failed", error);
    return NextResponse.json({ error: "Failed to issue token" }, { status: 500 });
  }
}
