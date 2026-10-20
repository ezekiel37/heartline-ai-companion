import { hasActiveAccess, type Plan, type Subscription } from "./plans";

export type Feature = "memory" | "avatar_studio" | "wardrobe" | "gifts" | "coach";

// Coaching is the product's positioning ("helps you get ready for real love"),
// so it is never paywalled. Memory for free users is a product decision:
// being remembered is what converts people, and free usage is capped at
// 3 messages a day, so the extra extraction cost is small. Flip to false to
// make memory paid-only as in the original spec.
export const MEMORY_FOR_FREE_USERS = true;

const FREE_FEATURES: Feature[] = MEMORY_FOR_FREE_USERS ? ["coach", "memory"] : ["coach"];

export function featuresFor(sub: Subscription | null, plan: Plan | null, now: Date): Set<Feature> {
  const out = new Set<Feature>(FREE_FEATURES);
  if (plan && hasActiveAccess(sub, now)) {
    for (const f of plan.features) out.add(f as Feature);
  }
  return out;
}
