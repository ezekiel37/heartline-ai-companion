import { after } from "next/server";
import { handleChat } from "@/lib/chat/handleChat";
import { chatDeps } from "@/lib/deps";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Streams newline-delimited JSON events (see ChatEvent). All limits are
// enforced inside handleChat; nothing from the client is trusted except the text.
export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "coach" ? "coach" : "chat";
  const result = await handleChat(chatDeps(supabaseAdmin()), user.id, body?.text, { mode });

  if (!result.ok) {
    return Response.json(
      { error: result.error, paywall: result.paywall ?? false, tier: result.tier, limit: result.limit },
      { status: result.status },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of result.events) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }
      controller.close();
    },
  });

  // Memory extraction and gift triggers run once the reply has been sent.
  after(() => result.runBackground());

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
