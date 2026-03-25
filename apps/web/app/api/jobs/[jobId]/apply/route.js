import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

    return NextResponse.json({ job: updated }, { status: 200 });
  } catch (error) {
    console.error("POST /api/jobs/[jobId]/apply failed", error);
    return NextResponse.json({ error: "Failed to update job status" }, { status: 500 });
  }
}
