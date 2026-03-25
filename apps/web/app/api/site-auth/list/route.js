import { auth } from "@/lib/auth";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${SERVER_URL}/auth/connect/list?userId=${encodeURIComponent(session.user.id)}`,
      {
        method: "GET"
      }
    );

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to list connected sites",
        details: error?.message
      },
      { status: 500 }
    );
  }
}
