import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatDeps } from "./chat/handleChat";
import type { WebhookDeps } from "./billing/handleWebhook";
import { decrypt, encrypt } from "./crypto";
import { featuresFor } from "./features";
import { runGiftTriggers, type GiftDeps } from "./gifts/triggers";
import { getLlm, getUtilityLlm } from "./llm";
import { MAX_MEMORIES_PER_CHARACTER, type Memory } from "./memory/extract";
import type { Plan, Subscription } from "./plans";
import type { ShopDeps } from "./shop/shop";
import { appDate } from "./time";

// Real Supabase-backed implementations of the core logic's dependencies.
// All use the service-role client: callers must have authenticated the user.

export function chatDeps(db: SupabaseClient): ChatDeps {
  return {
    now: () => new Date(),
    llm: getLlm(),
    utilityLlm: getUtilityLlm(),
    newId: () => randomUUID(),

    async getProfile(userId) {
      const { data } = await db
        .from("profiles")
        .select("dob, blocked, language, display_name, created_at")
        .eq("id", userId)
        .maybeSingle();
      return data;
    },

    async getCharacter(userId) {
      const { data } = await db.from("characters").select("id, name, gender, personality").eq("user_id", userId).maybeSingle();
      return data;
    },

    getSubscription: (userId) => loadSubscription(db, userId),

    async consumeMessage(userId, date, limit) {
      const { data, error } = await db.rpc("consume_message", { p_user_id: userId, p_date: date, p_limit: limit });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { allowed: Boolean(row?.allowed), used: Number(row?.used ?? 0) };
    },

    async refundMessage(userId, date) {
      await db.rpc("refund_message", { p_user_id: userId, p_date: date });
    },

    async recentMessages(characterId, limit) {
      const { data, error } = await db
        .from("messages")
        .select("role, content")
        .eq("character_id", characterId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).reverse().map((m) => ({ role: m.role, content: decrypt(m.content) }));
    },

    async saveMessage(m) {
      const { data, error } = await db
        .from("messages")
        .insert({
          ...(m.id ? { id: m.id } : {}),
          user_id: m.userId,
          character_id: m.characterId,
          role: m.role,
          content: encrypt(m.content),
          model: m.usage?.model,
          input_tokens: m.usage?.inputTokens,
          output_tokens: m.usage?.outputTokens,
          cache_read_tokens: m.usage?.cacheReadTokens,
          cost_usd: m.costUsd,
          flagged: m.flagged ?? false,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    async logSafetyEvent(userId, type) {
      await db.from("safety_events").insert({ user_id: userId, type });
    },

    getMemories: (characterId) => loadMemories(db, characterId),

    async saveMemories(userId, characterId, result) {
      if (result.replaceIds.length) {
        await db.from("memories").delete().eq("character_id", characterId).in("id", result.replaceIds);
      }
      if (result.add.length) {
        const { error } = await db.from("memories").insert(
          result.add.map((m) => ({ user_id: userId, character_id: characterId, fact: encrypt(m.fact), category: m.category })),
        );
        if (error) throw error;
      }
      // Keep the memory file bounded: drop the oldest non-identity facts.
      const { data: all } = await db
        .from("memories")
        .select("id, category")
        .eq("character_id", characterId)
        .order("updated_at", { ascending: false });
      const overflow = (all ?? []).length - MAX_MEMORIES_PER_CHARACTER;
      if (overflow > 0) {
        const drop = (all ?? []).filter((m) => m.category !== "identity").slice(-overflow).map((m) => m.id);
        if (drop.length) await db.from("memories").delete().in("id", drop);
      }
    },

    async recordUtilityUsage(userId, purpose, usage, cost) {
      await db.from("llm_usage").insert({
        user_id: userId,
        purpose,
        model: usage.model,
        input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
        output_tokens: usage.outputTokens,
        cost_usd: cost,
      });
    },

    async recentGifts(userId, since) {
      const { data } = await db
        .from("gifts")
        .select("kind, message")
        .eq("user_id", userId)
        .gte("sent_at", since.toISOString())
        .order("sent_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },

    runGifts: (userId) => runGiftTriggers(giftDeps(db), userId).then(() => undefined),
  };
}

export async function loadMemories(db: SupabaseClient, characterId: string): Promise<Memory[]> {
  const { data, error } = await db
    .from("memories")
    .select("id, fact, category, updated_at")
    .eq("character_id", characterId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m) => ({ ...m, fact: decrypt(m.fact) }));
}

// Plan features + character for the feature-gated APIs.
export async function loadAccess(db: SupabaseClient, userId: string) {
  const { data: character } = await db.from("characters").select("id, gender").eq("user_id", userId).maybeSingle();
  if (!character) return null;
  const sub = await loadSubscription(db, userId);
  return {
    characterId: character.id as string,
    gender: character.gender as "male" | "female",
    features: featuresFor(sub?.subscription ?? null, sub?.plan ?? null, new Date()),
  };
}

export function shopDeps(db: SupabaseClient): ShopDeps {
  return {
    getAccess: (userId) => loadAccess(db, userId),
    async ownedItems(userId) {
      const { data } = await db.from("inventory").select("item_id").eq("user_id", userId);
      return new Set((data ?? []).map((r) => r.item_id as string));
    },
    async purchaseItem(userId, itemId) {
      const { data, error } = await db.rpc("purchase_item", { p_user_id: userId, p_item_id: itemId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: Boolean(row?.ok), reason: String(row?.reason ?? "error"), balance: row?.balance ?? null };
    },
    async saveAvatarConfig(characterId, config) {
      const { error } = await db.from("characters").update({ avatar_config: config }).eq("id", characterId);
      if (error) throw error;
    },
  };
}

async function creditCoins(db: SupabaseClient, userId: string, amount: number, reason: string, ref: string) {
  const { error } = await db.rpc("credit_coins", { p_user_id: userId, p_amount: amount, p_reason: reason, p_ref: ref });
  if (error) throw error;
}

export function giftDeps(db: SupabaseClient): GiftDeps {
  return {
    now: () => new Date(),
    async loadContext(userId) {
      const [{ data: profile }, { data: character }] = await Promise.all([
        db.from("profiles").select("dob, language, display_name").eq("id", userId).single(),
        db.from("characters").select("id, name, gender, created_at").eq("user_id", userId).maybeSingle(),
      ]);
      if (!profile || !character) return null;
      const since = appDate(new Date(Date.now() - 60 * 86_400_000));
      const [{ data: days }, { count }, { data: gifts }, { data: inventory }] = await Promise.all([
        db.from("usage").select("usage_date").eq("user_id", userId).gt("messages_used", 0).gte("usage_date", since),
        db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user"),
        db.from("gifts").select("trigger_key").eq("user_id", userId),
        db.from("inventory").select("item_id").eq("user_id", userId),
      ]);
      return {
        characterId: character.id,
        dob: profile.dob,
        language: profile.language,
        displayName: profile.display_name,
        characterName: character.name,
        gender: character.gender,
        characterCreatedAt: character.created_at,
        activeDates: (days ?? []).map((d) => d.usage_date as string),
        totalUserMessages: count ?? 0,
        existingKeys: new Set((gifts ?? []).map((g) => g.trigger_key as string)),
        ownedItems: new Set((inventory ?? []).map((i) => i.item_id as string)),
      };
    },
    async insertGift({ userId, characterId, spec }) {
      const { error } = await db.from("gifts").insert({
        user_id: userId,
        character_id: characterId,
        kind: spec.kind,
        item_id: spec.itemId ?? null,
        coins: spec.coins ?? null,
        message: spec.message,
        trigger_key: spec.key,
      });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw error;
    },
    async grantItem(userId, itemId) {
      const { error } = await db
        .from("inventory")
        .upsert({ user_id: userId, item_id: itemId, acquired_via: "gift" }, { onConflict: "user_id,item_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    creditCoins: (userId, amount, reason, ref) => creditCoins(db, userId, amount, reason, ref),
  };
}

export async function loadSubscription(db: SupabaseClient, userId: string) {
  const { data } = await db.from("subscriptions").select("*, plan:plans(*)").eq("user_id", userId).maybeSingle();
  if (!data?.plan) return null;
  const { plan, ...subscription } = data as Subscription & { plan: Plan };
  return { subscription, plan };
}

export function webhookDeps(db: SupabaseClient): WebhookDeps {
  return {
    now: () => new Date(),
    async getPlanById(id) {
      const { data } = await db.from("plans").select("*").eq("id", id).maybeSingle();
      return data;
    },
    async getPlanByCode(code) {
      const { data } = await db.from("plans").select("*").eq("paystack_plan_code", code).maybeSingle();
      return data;
    },
    async getSubscription(userId) {
      const { data } = await db.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
      return data;
    },
    async findUserByCustomerCode(code) {
      const { data } = await db.from("subscriptions").select("user_id").eq("paystack_customer_code", code).maybeSingle();
      return data?.user_id ?? null;
    },
    async findUserBySubscriptionCode(code) {
      const { data } = await db.from("subscriptions").select("user_id").eq("paystack_subscription_code", code).maybeSingle();
      return data?.user_id ?? null;
    },
    async upsertSubscription(sub) {
      const { error } = await db.from("subscriptions").upsert({ ...sub, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async claimEvent(key, event) {
      const { error } = await db.from("payment_events").insert({ event_key: key, event });
      if (!error) return true;
      if (error.code === "23505") return false; // unique violation: already processed
      throw error;
    },
    async releaseEvent(key) {
      await db.from("payment_events").delete().eq("event_key", key);
    },
    async getCoinPack(id) {
      const { data } = await db.from("coin_packs").select("*").eq("id", id).maybeSingle();
      return data;
    },
    creditCoins: (userId, amount, reason, ref) => creditCoins(db, userId, amount, reason, ref),
    async recordPayment(p) {
      const { error } = await db.from("payments").upsert(
        { user_id: p.userId, reference: p.reference, kind: p.kind, item_id: p.itemId, amount_kobo: p.amountKobo },
        { onConflict: "reference", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
  };
}
