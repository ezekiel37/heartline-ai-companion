import Link from "next/link";

const LINKS = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/studio", label: "Studio", icon: "🎨" },
  { href: "/shop", label: "Shop", icon: "🛍️" },
  { href: "/settings", label: "Me", icon: "👤" },
];

// Top links on larger screens; on phones the BottomTabs bar takes over.
export function AppNav({ current }: { current: string }) {
  return (
    <nav className="hidden gap-3 text-sm md:flex" aria-label="Main">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={current === l.href ? "page" : undefined}
          className={current === l.href ? "font-semibold text-accent" : "text-muted hover:text-foreground"}
        >
          {l.label === "Me" ? "Settings" : l.label}
        </Link>
      ))}
    </nav>
  );
}

// Thumb-reachable tab bar for phones, like the messaging apps users already know.
// `fixed` is for scrolling pages; the chat screen places it in its own flex column.
export function BottomTabs({ current, fixed = true }: { current: string; fixed?: boolean }) {
  return (
    <nav
      aria-label="Main"
      className={`grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden ${
        fixed ? "fixed inset-x-0 bottom-0 z-10" : ""
      }`}
    >
      {LINKS.map((l) => {
        const active = current === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-semibold text-accent" : "text-muted"}`}
          >
            <span className={`text-lg leading-none ${active ? "" : "opacity-70 grayscale"}`} aria-hidden>
              {l.icon}
            </span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LockedNotice({ feature }: { feature: string }) {
  return (
    <div className="rounded-2xl border border-border bg-accent-soft p-4 text-sm">
      <p className="font-medium">{feature} is part of paid plans.</p>
      <Link href="/pricing" className="mt-2 inline-block underline">
        See plans
      </Link>
    </div>
  );
}
