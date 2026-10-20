import { decrypt } from "@/lib/crypto";
import { loadSubscription } from "@/lib/deps";
import { requireEligibleUser } from "@/lib/gate";
import { dailyAllowance, type Plan } from "@/lib/plans";
import { appDate } from "@/lib/time";
import { ChatClient, type UiMessage } from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const { supabase, user, profile, character } = await requireEligibleUser({ needCharacter: true });
  const now = new Date();
  const today = appDate(now);

  const [{ data: rows }, sub, { data: usage }, { data: plans }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, role, content")
      .eq("character_id", character!.id)
      .order("created_at", { ascending: false })
      .limit(50),
    loadSubscription(supabase, user.id),
    supabase.from("usage").select("messages_used").eq("user_id", user.id).eq("usage_date", today).maybeSingle(),
    supabase.from("plans").select("*").order("sort"),
  ]);

  const allowance = dailyAllowance({
    subscription: sub?.subscription ?? null,
    plan: sub?.plan ?? null,
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
      character={{ name: character!.name, gender: character!.gender }}
      initialMessages={messages}
      initialAllowance={{ tier: allowance.tier, limit: allowance.limit, remaining: Math.max(allowance.limit - used, 0) }}
      plans={(plans ?? []) as Plan[]}
    />
  );
}
