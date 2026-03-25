import { auth } from "@/lib/auth";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const response = await fetch(`${SERVER_URL}/connect/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: session.user.id,
        site: body?.site
      })
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      { error: "Failed to start site auth session", details: error?.message },
      { status: 500 }
    );
  }
}
