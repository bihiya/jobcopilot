import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobs = await prisma.externalJob.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 150
    });
    return Response.json({ jobs });
  } catch (error) {
    console.error("GET /api/jobs/external failed", error);
    return Response.json({ error: "Failed to load discovered jobs" }, { status: 500 });
  }
}
