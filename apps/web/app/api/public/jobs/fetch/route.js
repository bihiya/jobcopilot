const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function POST(request) {
  try {
    const body = await request.json();
    const response = await fetch(`${SERVER_URL}/public/jobs/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to fetch jobs",
        details: error?.message
      },
      { status: 500 }
    );
  }
}
