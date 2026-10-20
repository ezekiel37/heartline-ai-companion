import { shopDeps } from "@/lib/deps";
import { buyItem } from "@/lib/shop/shop";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { itemId } = await req.json().catch(() => ({}));
  const r = await buyItem(shopDeps(supabaseAdmin()), user.id, itemId);
  return r.ok ? Response.json({ balance: r.balance }) : Response.json({ error: r.error }, { status: r.status });
}
