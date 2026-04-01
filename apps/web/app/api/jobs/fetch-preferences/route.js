import { auth } from "@/lib/auth";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(`${SERVER_URL}/jobs/fetch-from-preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ userId: session.user.id })
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to fetch jobs from preferences",
        details: error?.message
      },
      { status: 500 }
    );
  }
}
