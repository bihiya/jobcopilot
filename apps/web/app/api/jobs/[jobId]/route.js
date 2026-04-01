import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(_request, context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    const result = await prisma.job.deleteMany({
      where: {
        id: jobId,
        userId: session.user.id
      }
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/jobs/[jobId] failed", error);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
