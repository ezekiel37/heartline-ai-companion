// Turns the raw admin_metrics() JSON into the numbers that matter for pricing.

export interface RawMetrics {
  users_total: number;
  users_new_7d: number;
  dau: number;
  wau: number;
  paying_active: number;
  paying_by_plan: Record<string, number>;
  revenue_30d_kobo: number;
  revenue_30d_by_kind: Record<string, number>;
  replies_30d: number;
  llm_cost_30d_usd: number | string;
  llm_cost_30d_paying_usd: number | string;
  llm_cost_30d_background_usd: number | string;
  top_cost_users: { user_id: string; usd: number | string; replies: number; paying: boolean }[];
  safety_7d: Record<string, number>;
  reports_7d: number;
  coins_outstanding: number;
}

export interface DerivedMetrics {
  conversionPct: number; // paying / all users
  revenue30dNgn: number;
  llmCost30dNgn: number;
  grossMarginPct: number | null; // (revenue - LLM cost) / revenue
  arppuNgn: number | null; // revenue per paying user
  llmCostPerPayingUserNgn: number | null;
  costPerReplyUsd: number | null;
  dauWauPct: number | null; // stickiness
}

export function isAdmin(email: string | undefined | null, adminEmails = process.env.ADMIN_EMAILS ?? ""): boolean {
  if (!email) return false;
  const allowed = adminEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export function deriveMetrics(raw: RawMetrics, ngnPerUsd: number): DerivedMetrics {
  const revenue = raw.revenue_30d_kobo / 100;
  const cost = Number(raw.llm_cost_30d_usd) * ngnPerUsd;
  const payingCost = Number(raw.llm_cost_30d_paying_usd) * ngnPerUsd;
  return {
    conversionPct: raw.users_total ? (raw.paying_active / raw.users_total) * 100 : 0,
    revenue30dNgn: revenue,
    llmCost30dNgn: cost,
    grossMarginPct: revenue ? ((revenue - cost) / revenue) * 100 : null,
    arppuNgn: raw.paying_active ? revenue / raw.paying_active : null,
    llmCostPerPayingUserNgn: raw.paying_active ? payingCost / raw.paying_active : null,
    costPerReplyUsd: raw.replies_30d ? Number(raw.llm_cost_30d_usd) / raw.replies_30d : null,
    dauWauPct: raw.wau ? (raw.dau / raw.wau) * 100 : null,
  };
}
