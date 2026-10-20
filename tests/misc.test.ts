import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isAdult } from "@/lib/age";
import { decrypt, encrypt } from "@/lib/crypto";
import { buildSystemPrompt } from "@/lib/persona";
import { appDate } from "@/lib/time";

describe("age gate", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("accepts 18+ and rejects under 18, the day before the 18th birthday, and junk", () => {
    expect(isAdult("2008-10-20", now)).toBe(true);
    expect(isAdult("2008-10-21", now)).toBe(false);
    expect(isAdult("2012-01-01", now)).toBe(false);
    expect(isAdult("not-a-date", now)).toBe(false);
    expect(isAdult(null, now)).toBe(false);
  });
});

describe("message encryption", () => {
  it("round-trips and never stores plaintext", () => {
    process.env.MESSAGE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const stored = encrypt("I miss you 💛");
    expect(stored).not.toContain("miss");
    expect(decrypt(stored)).toBe("I miss you 💛");
  });
});

describe("timezone", () => {
  it("resets daily limits at Lagos midnight, not UTC", () => {
    expect(appDate(new Date("2026-10-20T23:30:00Z"))).toBe("2026-10-21");
  });
});

describe("persona prompt", () => {
  it("always includes the non-negotiable character rules", () => {
    const p = buildSystemPrompt({ character: { name: "Amara", gender: "female", personality: "witty" }, language: "pcm", userName: null });
    expect(p).toMatch(/Never claim or imply to be human/);
    expect(p).toMatch(/Never ask the user to buy/);
    expect(p).toMatch(/Nigerian Pidgin/);
    expect(p).toMatch(/girlfriend/);
  });
});
