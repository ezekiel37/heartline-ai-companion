"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isAdult } from "@/lib/age";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";

export type ActionState = { error?: string } | undefined;

const ageSchema = z.object({
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirm: z.literal("on"),
});

// The age gate. DOB and the blocked flag are written with the service role
// because users can't update those columns themselves (see migration).
export async function submitAgeGate(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const parsed = ageSchema.safeParse({ dob: form.get("dob"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: "Enter your date of birth and confirm you are 18 or older." };

  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("dob, blocked").eq("id", user.id).single();
  if (profile?.blocked) redirect("/blocked");
  if (profile?.dob) redirect("/onboarding"); // DOB can't be changed once set

  if (!isAdult(parsed.data.dob, new Date())) {
    await db.from("profiles").update({ dob: parsed.data.dob, blocked: true, blocked_reason: "under_18" }).eq("id", user.id);
    await supabase.auth.signOut();
    redirect("/blocked");
  }

  await db.from("profiles").update({ dob: parsed.data.dob, age_confirmed_at: new Date().toISOString() }).eq("id", user.id);
  redirect("/onboarding");
}

const partnerSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(30),
  gender: z.enum(["male", "female"]),
  personality: z.enum(["caring", "playful", "calm", "witty"]),
  language: z.enum(["en", "pcm"]),
});

export async function createPartner(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const parsed = partnerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please fill in every field." };
  const { displayName, name, gender, personality, language } = parsed.data;

  const { data: profile } = await supabase.from("profiles").select("dob, blocked").eq("id", user.id).single();
  if (profile?.blocked || !isAdult(profile?.dob, new Date())) redirect("/onboarding");

  await supabase.from("profiles").update({ display_name: displayName, language }).eq("id", user.id);
  const { error } = await supabase.from("characters").insert({ user_id: user.id, name, gender, personality });
  if (error && error.code !== "23505") return { error: "Could not save your partner. Please try again." };
  redirect("/chat");
}
