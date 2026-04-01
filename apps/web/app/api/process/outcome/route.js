import { auth } from "@/lib/auth";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idempotencyKey = searchParams.get("idempotencyKey");
  if (!idempotencyKey) {
    return Response.json({ error: "idempotencyKey is required" }, { status: 400 });
  }

  try {
    const url = new URL("/process/outcome", SERVER_URL);
    url.searchParams.set("idempotencyKey", idempotencyKey);
    url.searchParams.set("userId", session.user.id);

    const response = await fetch(url.toString(), { method: "GET" });
    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json(
      { error: "Failed to load process outcome", details: error.message },
      { status: 500 }
    );
  }
}
