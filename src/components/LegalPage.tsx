import Link from "next/link";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted">
        ← Home
      </Link>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="rounded-xl bg-accent-soft p-3 text-sm">
        Placeholder text. This page must be reviewed by a Nigerian lawyer before launch.
      </p>
      <div className="space-y-4 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold">{children}</div>
    </main>
  );
}
