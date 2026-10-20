import { AppNav, LockedNotice } from "@/components/AppNav";
import { loadPartnerState } from "@/lib/access";
import { StudioClient } from "./StudioClient";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const s = await loadPartnerState();
  const unlocked = s.features.has("avatar_studio");

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{s.character.name}&apos;s look</h1>
        <AppNav current="/studio" />
      </header>
      {!unlocked && <LockedNotice feature="The avatar studio" />}
      <StudioClient initial={s.avatar} gender={s.gender} owned={s.owned} unlocked={unlocked} />
    </main>
  );
}
