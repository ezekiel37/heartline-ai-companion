import Link from "next/link";
import { APP_NAME, TAGLINE } from "@/lib/brand";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold">{APP_NAME}</span>
        <Link href="/login" className="text-sm text-muted hover:text-foreground">
          Sign in
        </Link>
      </header>

      <section className="flex flex-1 flex-col justify-center gap-6 py-16">
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{TAGLINE}</h1>
        <p className="max-w-xl text-lg text-muted">
          Chat with a caring AI partner who listens, makes you smile, and gives you honest advice on dating,
          confidence and relationships, in English or Pidgin.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className="btn">
            Get started free
          </Link>
          <Link href="/pricing" className="btn-ghost">
            See plans
          </Link>
        </div>
        <p className="text-sm text-muted">18+ only. Your partner is an AI, and will always tell you so.</p>
      </section>

      <footer className="flex gap-4 py-6 text-sm text-muted">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </footer>
    </main>
  );
}
