import { loadPartnerState } from "@/lib/access";
import { decrypt } from "@/lib/crypto";
import { giftDeps } from "@/lib/deps";
import { runGiftTriggers } from "@/lib/gifts/triggers";
import { dailyAllowance, renewalNotice, type Plan } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/server";
import { appDate } from "@/lib/time";
import { ChatClient, type UiGift, type UiMessage } from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const s = await loadPartnerState();
  const { supabase, user, profile, character } = s;
  const now = new Date();
  const today = appDate(now);

  // Birthday and anniversary gifts should be waiting when the user opens the app.
  if (s.features.has("gifts")) {
    await runGiftTriggers(giftDeps(supabaseAdmin()), user.id).catch((e) => console.error("gift triggers failed", e));
  }

  const [{ data: rows }, { data: usage }, { data: plans }, { data: gifts }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, role, content")
      .eq("character_id", character.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("usage").select("messages_used").eq("user_id", user.id).eq("usage_date", today).maybeSingle(),
    supabase.from("plans").select("*").order("sort"),
    supabase.from("gifts").select("id, kind, item_id, coins, message, sent_at, opened").eq("user_id", user.id).order("sent_at", { ascending: false }).limit(20),
  ]);

  const allowance = dailyAllowance({
    subscription: s.subscription?.subscription ?? null,
    plan: s.subscription?.plan ?? null,
    accountCreatedDate: appDate(new Date(profile!.created_at)),
    today,
    now,
  });
  const used = usage?.messages_used ?? 0;

  const messages: UiMessage[] = (rows ?? [])
    .reverse()
    .map((m) => ({ id: m.id, role: m.role, content: decrypt(m.content) }));

  return (
    <ChatClient
      character={{ name: character.name, gender: s.gender }}
      avatar={s.avatar}
      initialMessages={messages}
      initialAllowance={{ tier: allowance.tier, limit: allowance.limit, remaining: Math.max(allowance.limit - used, 0) }}
      plans={(plans ?? []) as Plan[]}
      gifts={(gifts ?? []) as UiGift[]}
      coachAvailable={s.features.has("coach")}
      renewal={renewalNotice(s.subscription?.subscription ?? null, s.subscription?.plan ?? null, now)}
    />
  );
}
