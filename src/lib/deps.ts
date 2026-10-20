import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatDeps } from "./chat/handleChat";
import type { WebhookDeps } from "./billing/handleWebhook";
import { decrypt, encrypt } from "./crypto";
import { getLlm } from "./llm";
import type { Plan, Subscription } from "./plans";

// Real Supabase-backed implementations of the core logic's dependencies.
// All use the service-role client: callers must have authenticated the user.

export function chatDeps(db: SupabaseClient): ChatDeps {
  return {
    now: () => new Date(),
    llm: getLlm(),
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
  };
}
