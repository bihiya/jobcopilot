import { auth } from "@/lib/auth";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

function toQuery(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  return searchParams.toString();
}

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = toQuery({
      userId: session.user.id,
      site: searchParams.get("site"),
      siteUrl: searchParams.get("siteUrl")
    });

    const response = await fetch(`${SERVER_URL}/auth/connect/status?${query}`);
    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to check site auth",
        details: error.message
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const query = toQuery({
      userId: session.user.id,
      site: body?.site,
      siteUrl: body?.siteUrl ?? body?.jobUrl
    });
    const response = await fetch(`${SERVER_URL}/auth/connect/status?${query}`);
    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to check site auth",
        details: error.message
      },
      { status: 500 }
    );
  }
}
