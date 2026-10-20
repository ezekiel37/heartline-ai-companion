"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function LanguageSwitch({ initial }: { initial: "en" | "pcm" }) {
  const [language, setLanguage] = useState(initial);
  const [saved, setSaved] = useState(false);

  async function change(next: "en" | "pcm") {
    setLanguage(next);
    setSaved(false);
    const supabase = supabaseBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ language: next }).eq("id", user.id);
    if (!error) setSaved(true);
  }

  return (
    <div className="flex items-center gap-2">
      {(["en", "pcm"] as const).map((l) => (
        <button key={l} onClick={() => change(l)} className={language === l ? "btn" : "btn-ghost"}>
          {l === "en" ? "English" : "Pidgin"}
        </button>
      ))}
      {saved && <span className="text-sm text-muted">Saved</span>}
    </div>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setError(body.error ?? "Could not delete account.");
  }

  return (
    <div className="space-y-2">
      <input className="input" placeholder='Type "DELETE" to confirm' value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <button className="btn" disabled={confirm !== "DELETE" || busy} onClick={del}>
        {busy ? "Deleting…" : "Delete everything"}
      </button>
      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}
