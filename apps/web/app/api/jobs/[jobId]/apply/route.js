import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function markApplied(session, jobId) {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      userId: session.user.id
    }
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { status: "applied" }
  });

  await prisma.jobApplyAuditLog.create({
    data: {
      jobId,
      userId: session.user.id,
      step: "manual_mark_applied",
      message: "User marked job as applied from dashboard",
      meta: { source: "dashboard" }
    }
  });

  return NextResponse.json({ job: updated }, { status: 200 });
}

export async function POST(_request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = params?.jobId;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    return await markApplied(session, jobId);
  } catch (error) {
    console.error("POST /api/jobs/[jobId]/apply failed", error);
    return NextResponse.json({ error: "Failed to update job status" }, { status: 500 });
  }
}

export async function PATCH(_request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = params?.jobId;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    return await markApplied(session, jobId);
  } catch (error) {
    console.error("PATCH /api/jobs/[jobId]/apply failed", error);
    return NextResponse.json({ error: "Failed to update job status" }, { status: 500 });
  }
}
