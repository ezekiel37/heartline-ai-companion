import "server-only";
import { normaliseAvatar } from "./avatar/config";
import { STARTER_ITEM_IDS } from "./avatar/catalog";
import { loadSubscription } from "./deps";
import { featuresFor } from "./features";
import { requireEligibleUser } from "./gate";

// Everything the studio/shop/chat pages need about the signed-in user's partner.
export async function loadPartnerState() {
  const gate = await requireEligibleUser({ needCharacter: true });
  const { supabase, user } = gate;

  const [{ data: character }, sub, { data: inventory }, { data: wallet }] = await Promise.all([
    supabase.from("characters").select("id, name, gender, personality, avatar_config, created_at").eq("user_id", user.id).single(),
    loadSubscription(supabase, user.id),
    supabase.from("inventory").select("item_id").eq("user_id", user.id),
    supabase.from("wallets").select("coin_balance").eq("user_id", user.id).maybeSingle(),
  ]);

  const gender = character!.gender as "male" | "female";
  return {
    ...gate,
    character: character!,
    gender,
    avatar: normaliseAvatar(character!.avatar_config, gender),
    subscription: sub,
    features: featuresFor(sub?.subscription ?? null, sub?.plan ?? null, new Date()),
    owned: [...new Set([...STARTER_ITEM_IDS, ...(inventory ?? []).map((i) => i.item_id as string)])],
    coins: wallet?.coin_balance ?? 0,
  };
}
