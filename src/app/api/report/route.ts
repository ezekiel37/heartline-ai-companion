import { requireUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { messageId, reason } = await req.json().catch(() => ({}));
  if (typeof messageId !== "string") return Response.json({ error: "messageId required" }, { status: 400 });

  // RLS ensures the message belongs to this user and is an AI message.
  const { error } = await supabase.from("message_reports").upsert(
    { user_id: user.id, message_id: messageId, reason: String(reason ?? "unspecified").slice(0, 500) },
    { onConflict: "user_id,message_id" },
  );
  if (error) return Response.json({ error: "Could not report message" }, { status: 400 });
  return Response.json({ ok: true });
}
