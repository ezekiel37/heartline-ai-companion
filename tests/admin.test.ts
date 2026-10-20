import { describe, expect, it } from "vitest";
import { deriveMetrics, isAdmin, type RawMetrics } from "@/lib/admin/metrics";

const raw: RawMetrics = {
  users_total: 1000,
  users_new_7d: 120,
  dau: 150,
  wau: 400,
  paying_active: 40,
  paying_by_plan: { two_week: 15, monthly: 25 },
  revenue_30d_kobo: 9_000_000, // ₦90,000
  revenue_30d_by_kind: { plan: 8_000_000, coins: 1_000_000 },
  replies_30d: 60_000,
  llm_cost_30d_usd: "24.000000",
  llm_cost_30d_paying_usd: "12",
  llm_cost_30d_background_usd: "2",
  top_cost_users: [],
  safety_7d: {},
  reports_7d: 0,
  coins_outstanding: 0,
};

describe("admin metrics", () => {
  it("derives conversion, margin and per-user economics", () => {
    const d = deriveMetrics(raw, 1500);
    expect(d.conversionPct).toBe(4);
    expect(d.revenue30dNgn).toBe(90_000);
    expect(d.llmCost30dNgn).toBe(36_000);
    expect(d.grossMarginPct).toBe(60);
    expect(d.arppuNgn).toBe(2_250);
    expect(d.llmCostPerPayingUserNgn).toBe(450);
    expect(d.costPerReplyUsd).toBeCloseTo(0.0004);
    expect(d.dauWauPct).toBe(37.5);
  });

  it("handles an empty database without dividing by zero", () => {
    const d = deriveMetrics({ ...raw, users_total: 0, paying_active: 0, revenue_30d_kobo: 0, replies_30d: 0, wau: 0 }, 1500);
    expect(d.conversionPct).toBe(0);
    expect(d.grossMarginPct).toBeNull();
    expect(d.arppuNgn).toBeNull();
  });

  it("only lets listed emails in, case-insensitively", () => {
    expect(isAdmin("Founder@Example.com", "founder@example.com, ops@example.com")).toBe(true);
    expect(isAdmin("someone@example.com", "founder@example.com")).toBe(false);
    expect(isAdmin("founder@example.com", "")).toBe(false);
    expect(isAdmin(null, "founder@example.com")).toBe(false);
  });
});
