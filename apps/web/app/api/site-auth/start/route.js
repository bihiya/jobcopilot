import { auth } from "@/lib/auth";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const siteUrl = body?.siteUrl ?? body?.jobUrl ?? null;
    const response = await fetch(`${SERVER_URL}/auth/connect/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: session.user.id,
        site: body?.site,
        siteUrl
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

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const siteUrl = body?.siteUrl ?? body?.jobUrl ?? null;
    const response = await fetch(`${SERVER_URL}/auth/connect/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: session.user.id,
        site: body?.site,
        siteUrl
      })
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      { error: "Failed to validate site auth session", details: error?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const response = await fetch(`${SERVER_URL}/auth/connect/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: session.user.id,
        site: body?.site,
        siteUrl: body?.siteUrl ?? body?.jobUrl ?? null
      })
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      { error: "Failed to disconnect site auth session", details: error?.message },
      { status: 500 }
    );
  }
}
