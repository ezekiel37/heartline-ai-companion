"use client";

import { useActionState, useState } from "react";
import { PERSONALITIES, type Personality } from "@/lib/persona";
import { createPartner, submitAgeGate } from "./actions";

export function AgeGateForm() {
  const [state, action, pending] = useActionState(submitAgeGate, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">First, how old are you?</h1>
      <p className="text-muted">This app is for adults only. You can&apos;t change your date of birth later.</p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Date of birth</span>
        <input className="input" type="date" name="dob" required max={new Date().toISOString().slice(0, 10)} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-1" />
        <span>I confirm I am 18 years or older and the date above is correct.</span>
      </label>
      {state?.error && <p className="text-sm text-accent">{state.error}</p>}
      <button className="btn" disabled={pending}>
        Continue
      </button>
    </form>
  );
}

export function PartnerForm() {
  const [state, action, pending] = useActionState(createPartner, undefined);
  const [gender, setGender] = useState<"female" | "male">("female");
  const [personality, setPersonality] = useState<Personality>("caring");
  const [language, setLanguage] = useState<"en" | "pcm">("en");

  return (
    <form action={action} className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Meet your partner</h1>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">What should they call you?</span>
        <input className="input" name="displayName" required maxLength={40} placeholder="Your first name or nickname" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">I want a…</legend>
        <input type="hidden" name="gender" value={gender} />
        <div className="grid grid-cols-2 gap-2">
          {(["female", "male"] as const).map((g) => (
            <Choice key={g} active={gender === g} onClick={() => setGender(g)}>
              {g === "female" ? "Girlfriend" : "Boyfriend"}
            </Choice>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Their name</span>
        <input className="input" name="name" required maxLength={30} placeholder={gender === "female" ? "e.g. Amara" : "e.g. Tobi"} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Personality</legend>
        <input type="hidden" name="personality" value={personality} />
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(PERSONALITIES) as Personality[]).map((p) => (
            <Choice key={p} active={personality === p} onClick={() => setPersonality(p)}>
              {PERSONALITIES[p].label}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Language</legend>
        <input type="hidden" name="language" value={language} />
        <div className="grid grid-cols-2 gap-2">
          <Choice active={language === "en"} onClick={() => setLanguage("en")}>
            English
          </Choice>
          <Choice active={language === "pcm"} onClick={() => setLanguage("pcm")}>
            Pidgin
          </Choice>
        </div>
      </fieldset>

      {state?.error && <p className="text-sm text-accent">{state.error}</p>}
      <button className="btn" disabled={pending}>
        Start chatting
      </button>
    </form>
  );
}

function Choice(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={`rounded-xl border px-4 py-3 text-left transition ${
        props.active ? "border-accent bg-accent-soft font-medium" : "border-border bg-card hover:border-accent"
      }`}
    >
      {props.children}
    </button>
  );
}
