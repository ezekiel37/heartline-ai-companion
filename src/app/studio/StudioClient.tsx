"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CATALOG_BY_ID, itemFitsGender } from "@/lib/avatar/catalog";
import {
  BODY_TYPES,
  EYE_COLORS,
  EYE_STYLES,
  FACE_SHAPES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_SLOTS,
  SKIN_TONES,
  type AvatarConfig,
  type OutfitSlot,
} from "@/lib/avatar/config";

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const SLOT_LABELS: Record<OutfitSlot, string> = {
  top: "Tops",
  bottom: "Bottoms",
  dress: "Dresses",
  shoes: "Shoes",
  accessory: "Accessories",
  headwear: "Headwear",
};

export function StudioClient(props: { initial: AvatarConfig; gender: "male" | "female"; owned: string[]; unlocked: boolean }) {
  const [config, setConfig] = useState<AvatarConfig>(props.initial);
  const [tab, setTab] = useState<"look" | "wardrobe">("look");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(config) !== JSON.stringify(props.initial);

  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => {
    setConfig((c) => ({ ...c, [k]: v }));
    setStatus(null);
  };

  function equip(slot: OutfitSlot, id: string | undefined) {
    setStatus(null);
    setConfig((c) => {
      const outfit = { ...c.outfit, [slot]: id };
      if (slot === "dress" && id) {
        delete outfit.top;
        delete outfit.bottom;
      }
      if ((slot === "top" || slot === "bottom") && id) delete outfit.dress;
      return { ...c, outfit };
    });
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setConfig(body.config);
      setStatus("Saved 💛");
    } else {
      setStatus(body.error ?? "Could not save");
    }
  }

  const owned = props.owned
    .map((id) => CATALOG_BY_ID.get(id))
    .filter((i): i is NonNullable<typeof i> => !!i && itemFitsGender(i, props.gender));

  return (
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <div className="flex flex-col items-center gap-3 md:sticky md:top-6 md:self-start">
        <Avatar config={config} size={220} />
        <button className="btn w-full" onClick={save} disabled={!props.unlocked || !dirty || saving}>
          {saving ? "Saving…" : "Save look"}
        </button>
        {status && <p className="text-sm text-muted">{status}</p>}
      </div>

      <div className={props.unlocked ? "" : "pointer-events-none opacity-50"} aria-disabled={!props.unlocked}>
        <div className="mb-4 flex gap-2">
          {(["look", "wardrobe"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tab === t ? "btn" : "btn-ghost"}>
              {t === "look" ? "Face & body" : "Wardrobe"}
            </button>
          ))}
        </div>

        {tab === "look" ? (
          <div className="space-y-5">
            <Row title="Skin tone">
              {SKIN_TONES.map((c, i) => (
                <Swatch key={c} color={c} active={config.skinTone === i} onClick={() => set("skinTone", i)} />
              ))}
            </Row>
            <Row title="Face">
              {FACE_SHAPES.map((f) => (
                <Chip key={f} active={config.faceShape === f} onClick={() => set("faceShape", f)}>{label(f)}</Chip>
              ))}
            </Row>
            <Row title="Eyes">
              {EYE_STYLES.map((e) => (
                <Chip key={e} active={config.eyes === e} onClick={() => set("eyes", e)}>{label(e)}</Chip>
              ))}
              {EYE_COLORS.map((c, i) => (
                <Swatch key={c} color={c} active={config.eyeColor === i} onClick={() => set("eyeColor", i)} />
              ))}
            </Row>
            <Row title="Hair">
              {HAIR_STYLES.map((h) => (
                <Chip key={h} active={config.hairStyle === h} onClick={() => set("hairStyle", h)}>{label(h)}</Chip>
              ))}
            </Row>
            <Row title="Hair colour">
              {HAIR_COLORS.map((c, i) => (
                <Swatch key={c} color={c} active={config.hairColor === i} onClick={() => set("hairColor", i)} />
              ))}
            </Row>
            <Row title="Body">
              {BODY_TYPES.map((b) => (
                <Chip key={b} active={config.bodyType === b} onClick={() => set("bodyType", b)}>{label(b)}</Chip>
              ))}
            </Row>
          </div>
        ) : (
          <div className="space-y-5">
            {OUTFIT_SLOTS.map((slot) => {
              const items = owned.filter((i) => i.slot === slot);
              const optional = slot === "accessory" || slot === "headwear" || slot === "dress";
              return (
                <Row key={slot} title={SLOT_LABELS[slot]}>
                  {optional && (
                    <Chip active={!config.outfit[slot]} onClick={() => equip(slot, undefined)}>None</Chip>
                  )}
                  {items.map((i) => (
                    <Chip key={i.id} active={config.outfit[slot] === i.id} onClick={() => equip(slot, i.id)}>
                      <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle" style={{ background: i.color }} />
                      {i.name}
                    </Chip>
                  ))}
                  {!items.length && !optional && <span className="text-sm text-muted">Nothing here yet.</span>}
                </Row>
              );
            })}
            <Link href="/shop" className="inline-block text-sm underline">
              Get more outfits in the shop
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Chip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${props.active ? "border-accent bg-accent-soft font-medium" : "border-border bg-card hover:border-accent"}`}
    >
      {props.children}
    </button>
  );
}

function Swatch(props: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      aria-label={`Colour ${props.color}`}
      className={`h-9 w-9 rounded-full border-2 transition ${props.active ? "border-accent ring-2 ring-accent/40" : "border-border"}`}
      style={{ background: props.color }}
    />
  );
}
