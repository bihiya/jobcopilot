import { takePrefillScript } from "@/lib/prefill-session-store";

export async function GET(_request, context) {
  const { key } = await context.params;
  if (!key) {
    return new Response("// JobCopilot: missing key", {
      status: 400,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  const script = takePrefillScript(key);
  if (!script) {
    return new Response(
      "// JobCopilot: this prefill link expired or was already used. Create a new one from the dashboard.",
      {
        status: 404,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
