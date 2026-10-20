import { z } from "zod";

// The character's look. Stored in characters.avatar_config and rendered as
// layered SVG by components/Avatar.tsx — no image assets needed.

export const SKIN_TONES = ["#4a2c1d", "#6b3e26", "#8d5524", "#c68642", "#e0ac69", "#f6d3b3"] as const;
export const HAIR_COLORS = ["#1b1210", "#3b2219", "#6d2e1f", "#7b1e3a", "#c69c5d"] as const;
export const EYE_COLORS = ["#2b1a12", "#4e342e", "#3e5f3a", "#35546e"] as const;

export const FACE_SHAPES = ["oval", "round", "square"] as const;
export const EYE_STYLES = ["round", "almond", "smile"] as const;
export const BODY_TYPES = ["slim", "average", "curvy", "athletic"] as const;
export const HAIR_STYLES = ["low_cut", "fade", "afro", "puff", "braids", "locs", "bun", "bob", "bald"] as const;

export const OUTFIT_SLOTS = ["top", "bottom", "dress", "shoes", "accessory", "headwear"] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

export const avatarConfigSchema = z.object({
  skinTone: z.number().int().min(0).max(SKIN_TONES.length - 1),
  faceShape: z.enum(FACE_SHAPES),
  eyes: z.enum(EYE_STYLES),
  eyeColor: z.number().int().min(0).max(EYE_COLORS.length - 1),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: z.number().int().min(0).max(HAIR_COLORS.length - 1),
  bodyType: z.enum(BODY_TYPES),
  outfit: z
    .object({
      top: z.string().optional(),
      bottom: z.string().optional(),
      dress: z.string().optional(),
      shoes: z.string().optional(),
      accessory: z.string().optional(),
      headwear: z.string().optional(),
    })
    .default({}),
});

export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export function defaultAvatar(gender: "male" | "female"): AvatarConfig {
  return gender === "female"
    ? {
        skinTone: 2,
        faceShape: "oval",
        eyes: "almond",
        eyeColor: 0,
        hairStyle: "braids",
        hairColor: 0,
        bodyType: "average",
        outfit: { top: "basic_tee_rose", bottom: "basic_jeans" , shoes: "basic_sneakers" },
      }
    : {
        skinTone: 1,
        faceShape: "square",
        eyes: "round",
        eyeColor: 0,
        hairStyle: "low_cut",
        hairColor: 0,
        bodyType: "athletic",
        outfit: { top: "basic_tee_navy", bottom: "basic_jeans", shoes: "basic_sneakers" },
      };
}

// Accepts whatever is stored (possibly {} for older rows) and returns a valid config.
export function normaliseAvatar(raw: unknown, gender: "male" | "female"): AvatarConfig {
  const parsed = avatarConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultAvatar(gender);
}
