import "server-only";
import { redirect } from "next/navigation";
import { isAdult } from "./age";
import { requireUser } from "./supabase/server";

// Server-side routing for pages that need an eligible, onboarded user.
export async function requireEligibleUser(opts: { needCharacter: boolean }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("dob, blocked, language, display_name, created_at")
    .eq("id", user.id)
    .single();

  if (profile?.blocked) redirect("/blocked");
  if (!profile?.dob || !isAdult(profile.dob, new Date())) redirect("/onboarding");

  const { data: character } = await supabase
    .from("characters")
    .select("id, name, gender, personality")
    .eq("user_id", user.id)
    .maybeSingle();
  if (opts.needCharacter && !character) redirect("/onboarding");

  return { supabase, user, profile, character };
}
