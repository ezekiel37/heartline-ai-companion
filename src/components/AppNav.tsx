import Link from "next/link";

const LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/studio", label: "Studio" },
  { href: "/shop", label: "Shop" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({ current }: { current: string }) {
  return (
    <nav className="flex gap-3 text-sm" aria-label="Main">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={current === l.href ? "page" : undefined}
          className={current === l.href ? "font-semibold text-accent" : "text-muted hover:text-foreground"}
        >
          {l.label}
        </Link>
      ))}
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
