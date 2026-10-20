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

export function MemoryList({ initial }: { initial: { id: string; fact: string }[] }) {
  const [memories, setMemories] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function forget(ids: string[]) {
    setError(null);
    // RLS allows users to delete only their own memories.
    const { error } = await supabaseBrowser().from("memories").delete().in("id", ids);
    if (error) return setError("Could not remove that. Please try again.");
    setMemories((m) => m.filter((x) => !ids.includes(x.id)));
  }

  if (!memories.length) return <p className="text-sm text-muted">Nothing yet.</p>;

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border">
        {memories.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-sm">
            <span>{m.fact}</span>
            <button className="shrink-0 text-muted hover:text-accent" onClick={() => forget([m.id])} aria-label={`Forget: ${m.fact}`}>
              Forget
            </button>
          </li>
        ))}
      </ul>
      <button
        className="btn-ghost text-sm"
        onClick={() => window.confirm("Forget everything? This can't be undone.") && forget(memories.map((m) => m.id))}
      >
        Forget everything
      </button>
      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}
