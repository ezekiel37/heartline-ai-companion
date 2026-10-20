import { requireUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { giftId } = await req.json().catch(() => ({}));
  if (typeof giftId !== "string") return Response.json({ error: "giftId required" }, { status: 400 });
  // RLS limits this to the user's own gifts; only `opened` is updatable.
  const { error } = await supabase.from("gifts").update({ opened: true }).eq("id", giftId).eq("user_id", user.id);
  if (error) return Response.json({ error: "Could not open gift" }, { status: 400 });
  return Response.json({ ok: true });
}
