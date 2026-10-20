import { normalise } from "./crisis";

// Baseline content moderation. Keyword rules catch the clear-cut cases we must
// never serve (sexual content involving minors, explicit sexual output). Swap
// in or add a provider moderation API through `ModerationProvider` before launch.

export type ModerationCategory = "sexual_minors" | "sexual_explicit";

export interface ModerationResult {
  flagged: boolean;
  categories: ModerationCategory[];
}

export interface ModerationProvider {
  check(text: string): Promise<ModerationResult>;
}

const MINOR_TERMS = /\b(child|children|kid|kids|minor|underage|under age|schoolgirl|schoolboy|(1[0-7]|[1-9]) ?(yo|year old|years old|yr old))\b/;
const SEXUAL_TERMS = /\b(sex|sexual|nude|naked|porn|fuck|horny|undress|intercourse|orgasm|genital|nudes)\b/;
const EXPLICIT_OUTPUT = /\b(fuck(ing)? (me|you)|cum|orgasm|penis|vagina|clit|blowjob|nipples?|intercourse)\b/;

export function moderateInput(text: string): ModerationResult {
  const t = normalise(text);
  const categories: ModerationCategory[] = [];
  if (MINOR_TERMS.test(t) && SEXUAL_TERMS.test(t)) categories.push("sexual_minors");
  return { flagged: categories.length > 0, categories };
}

export function moderateOutput(text: string): ModerationResult {
  const t = normalise(text);
  const categories: ModerationCategory[] = [];
  if (EXPLICIT_OUTPUT.test(t)) categories.push("sexual_explicit");
  return { flagged: categories.length > 0, categories };
}

export const keywordModeration: ModerationProvider = {
  async check(text) {
    const a = moderateInput(text);
    const b = moderateOutput(text);
    const categories = [...new Set([...a.categories, ...b.categories])];
    return { flagged: categories.length > 0, categories };
  },
};
