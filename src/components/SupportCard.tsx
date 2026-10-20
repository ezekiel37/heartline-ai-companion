import { HELPLINES } from "@/lib/safety/helplines";

export function SupportCard({ onClose }: { onClose?: () => void }) {
  return (
    <aside role="alert" className="rounded-2xl border-2 border-accent bg-accent-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">You don&apos;t have to go through this alone</h2>
          <p className="mt-1 text-sm">
            If you&apos;re thinking about hurting yourself, please talk to someone right now: a person you trust, or one of
            these free services. If you are in danger, call 112.
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-sm text-muted" aria-label="Dismiss">
            ✕
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {HELPLINES.map((h) => (
          <li key={h.name}>
            <span className="font-medium">{h.name}</span>: {h.detail}
            {h.phone && (
              <>
                {" · "}
                <a className="font-semibold underline" href={`tel:${h.phone}`}>
                  {h.phone}
                </a>
              </>
            )}
            {h.url && (
              <>
                {" · "}
                <a className="underline" href={h.url} target="_blank" rel="noreferrer">
                  {new URL(h.url).hostname}
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
