import { shopDeps } from "@/lib/deps";
import { saveAvatar } from "@/lib/shop/shop";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { config } = await req.json().catch(() => ({}));
  const r = await saveAvatar(shopDeps(supabaseAdmin()), user.id, config);
  return r.ok ? Response.json({ config: r.config }) : Response.json({ error: r.error }, { status: r.status });
}
