"use client";

import { useEffect, useRef, useState } from "react";
import { AppNav, BottomTabs } from "@/components/AppNav";
import { Avatar } from "@/components/Avatar";
import { GiftInbox, type UiGift } from "@/components/GiftInbox";
import { Paywall } from "@/components/Paywall";
import { SupportCard } from "@/components/SupportCard";
import type { AvatarConfig } from "@/lib/avatar/config";
import type { ChatEvent } from "@/lib/chat/handleChat";
import type { Plan } from "@/lib/plans";

export type { UiGift };

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
  avatar: AvatarConfig;
  initialMessages: UiMessage[];
  initialAllowance: Allowance;
  plans: Plan[];
  gifts: UiGift[];
  coachAvailable: boolean;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(props.initialMessages);
  const [allowance, setAllowance] = useState<Allowance>(props.initialAllowance);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [coach, setCoach] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
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
        body: JSON.stringify({ text, mode: coach ? "coach" : "chat" }),
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
    setMenuFor(null);
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
      <header className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar config={props.avatar} crop="head" size={44} className="rounded-full" />
            <div>
              <div className="font-semibold">{props.character.name}</div>
              <div className="text-xs text-muted">You&apos;re chatting with an AI</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AppNav current="/chat" />
            <GiftInbox initial={props.gifts} partnerName={props.character.name} />
          </div>
        </div>
        {allowance.tier === "free" && (
          <div className="text-xs text-muted" aria-live="polite">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-foreground">
              {allowance.remaining} of {allowance.limit}
            </span>{" "}
            free messages left today
          </div>
        )}
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-muted">Say hi to {props.character.name} 👋</p>
        )}
        {messages.map((m, i) => {
          const mine = m.role === "user";
          // Show the partner's face on the last of a run of consecutive replies.
          const showFace = !mine && messages[i + 1]?.role !== "assistant";
          const canReport = !mine && m.content && !m.id.startsWith("local-");
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
              {!mine && (
                <div className="w-8 shrink-0">
                  {showFace && <Avatar config={props.avatar} crop="head" size={32} className="rounded-full" />}
                </div>
              )}
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 ${
                  mine ? "bg-accent text-white" : "border border-border bg-card"
                }`}
              >
                {m.content || <span className="text-muted">typing…</span>}
              </div>
              {canReport && (
                <div className="relative self-center">
                  {m.reported ? (
                    <span className="text-xs text-muted" title="Reported">⚑</span>
                  ) : (
                    <button
                      onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                      className="rounded-full px-1.5 text-muted opacity-60 hover:opacity-100"
                      aria-label="Message options"
                      aria-expanded={menuFor === m.id}
                    >
                      ⋯
                    </button>
                  )}
                  {menuFor === m.id && (
                    <div className="absolute right-0 top-7 z-10 w-40 rounded-xl border border-border bg-card p-1 text-sm shadow-lg">
                      <button onClick={() => report(m.id)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-accent-soft">
                        Report message
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {showSupport && <SupportCard onClose={() => setShowSupport(false)} />}
        <div ref={bottom} />
      </main>

      {paywalled ? (
        <Paywall plans={props.plans} />
      ) : (
        <form onSubmit={send} className="flex flex-wrap gap-2 border-t border-border p-3">
          {notice && <p className="sr-only" role="alert">{notice}</p>}
          {props.coachAvailable && (
            <label className="flex w-full cursor-pointer items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} />
              Coach mode: ask {props.character.name} for honest dating and relationship advice
            </label>
          )}
          <input
            className="input min-w-0 flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              locked
                ? "You've reached today's limit. It resets at midnight."
                : coach
                  ? "What do you need advice on?"
                  : `Message ${props.character.name}…`
            }
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
      <BottomTabs current="/chat" fixed={false} />
    </div>
  );
}
