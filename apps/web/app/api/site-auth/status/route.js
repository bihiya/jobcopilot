import { auth } from "@/lib/auth";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const response = await fetch(`${SERVER_URL}/site-auth/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        userId: session.user.id,
      }),
    });

    const payload = await response.json();
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to check site auth",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
