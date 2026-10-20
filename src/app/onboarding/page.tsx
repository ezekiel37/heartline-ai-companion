import { redirect } from "next/navigation";
import { isAdult } from "@/lib/age";
import { APP_NAME } from "@/lib/brand";
import { requireUser } from "@/lib/supabase/server";
import { AgeGateForm, PartnerForm } from "./forms";

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("dob, blocked").eq("id", user.id).single();
  if (profile?.blocked) redirect("/blocked");

  const { data: character } = await supabase.from("characters").select("id").eq("user_id", user.id).maybeSingle();
  const ageDone = isAdult(profile?.dob, new Date());
  if (ageDone && character) redirect("/chat");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="text-sm text-muted">
        {APP_NAME} · Step {ageDone ? 2 : 1} of 2
      </p>
      {ageDone ? <PartnerForm /> : <AgeGateForm />}
    </main>
  );
}
