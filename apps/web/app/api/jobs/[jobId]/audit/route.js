import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_request, context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: session.user.id },
      select: { id: true }
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const logs = await prisma.jobApplyAuditLog.findMany({
      where: { jobId, userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        step: true,
        message: true,
        meta: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      logs: logs.map((row) => ({
        id: row.id,
        step: row.step,
        message: row.message,
        meta: row.meta,
        at: row.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error("GET /api/jobs/[jobId]/audit failed", error);
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}
