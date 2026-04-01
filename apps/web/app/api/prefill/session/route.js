import { auth } from "@/lib/auth";
import { createPrefillSession, MAX_SCRIPT_CHARS } from "@/lib/prefill-session-store";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const script = typeof body?.script === "string" ? body.script : "";
  if (!script.trim()) {
    return Response.json({ error: "script is required" }, { status: 400 });
  }

  const key = createPrefillSession(session.user.id, script);
  if (!key) {
    return Response.json(
      { error: `Prefill script too large (max ${MAX_SCRIPT_CHARS} characters)` },
      { status: 400 }
    );
  }

  return Response.json({ key });
}
