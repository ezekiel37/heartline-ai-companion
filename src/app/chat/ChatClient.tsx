"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChatEvent } from "@/lib/chat/handleChat";
import type { Plan } from "@/lib/plans";
import { Paywall } from "@/components/Paywall";
import { SupportCard } from "@/components/SupportCard";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reported?: boolean;
}

interface Allowance {
  tier: "free" | "paid";
  limit: number;
  remaining: number;
}

export function ChatClient(props: {
  character: { name: string; gender: string };
  initialMessages: UiMessage[];
  initialAllowance: Allowance;
  plans: Plan[];
}) {
  const [messages, setMessages] = useState<UiMessage[]>(props.initialMessages);
  const [allowance, setAllowance] = useState<Allowance>(props.initialAllowance);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const locked = allowance.remaining <= 0;
  const paywalled = locked && allowance.tier === "free";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showSupport]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || locked) return;
    setInput("");
    setNotice(null);
    setSending(true);
    const tempId = `local-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content: text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessages((m) => m.filter((x) => x.id !== tempId));
        setInput(text);
        if (res.status === 402 || res.status === 429) {
          setAllowance((a) => ({ ...a, tier: body.tier ?? a.tier, remaining: 0 }));
        } else {
          setNotice(body.error ?? "Something went wrong.");
        }
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantId = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const ev = JSON.parse(line) as ChatEvent;
          if (ev.t === "meta") {
            assistantId = ev.messageId;
            setAllowance({ tier: ev.tier, limit: ev.limit, remaining: ev.remaining });
            if (ev.crisis) setShowSupport(true);
            setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);
          } else if (ev.t === "delta") {
            setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: x.content + ev.v } : x)));
          } else if (ev.t === "error") {
            setMessages((m) => m.filter((x) => x.id !== assistantId || x.content));
            setNotice(ev.message);
            setAllowance((a) => ({ ...a, remaining: a.remaining + 1 })); // server refunded
          }
        }
      }
    } catch {
      setNotice("Network problem. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function report(id: string) {
    const reason = window.prompt("What was wrong with this message? (optional)") ?? "";
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: id, reason: reason || "unspecified" }),
    });
    if (res.ok) setMessages((m) => m.map((x) => (x.id === id ? { ...x, reported: true } : x)));
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="font-semibold">{props.character.name}</div>
          <div className="text-xs text-muted">You&apos;re chatting with an AI</div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {allowance.tier === "free" && (
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs" aria-live="polite">
              {allowance.remaining} of {allowance.limit} free messages left today
            </span>
          )}
          <Link href="/settings" className="text-muted hover:text-foreground" aria-label="Settings">
            Settings
          </Link>
        </div>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-muted">Say hi to {props.character.name} 👋</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="group max-w-[85%]">
              <div
                className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 ${
                  m.role === "user" ? "bg-accent text-white" : "border border-border bg-card"
                }`}
              >
                {m.content || <span className="text-muted">typing…</span>}
              </div>
              {m.role === "assistant" && m.content && !m.id.startsWith("local-") && (
                <button
                  onClick={() => report(m.id)}
                  disabled={m.reported}
                  className="mt-1 text-xs text-muted opacity-70 hover:opacity-100 disabled:opacity-60"
                >
                  {m.reported ? "Reported — thank you" : "Report"}
                </button>
              )}
            </div>
          </div>
        ))}
        {showSupport && <SupportCard onClose={() => setShowSupport(false)} />}
        <div ref={bottom} />
      </main>

      {paywalled ? (
        <Paywall plans={props.plans} />
      ) : (
        <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
          {notice && <p className="sr-only" role="alert">{notice}</p>}
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={locked ? "You've reached today's limit. It resets at midnight." : `Message ${props.character.name}…`}
            disabled={locked}
            maxLength={2000}
            aria-label="Message"
          />
          <button className="btn" disabled={sending || locked || !input.trim()}>
            Send
          </button>
        </form>
      )}
      {notice && !paywalled && <p className="px-4 pb-3 text-sm text-accent">{notice}</p>}
    </div>
  );
}
