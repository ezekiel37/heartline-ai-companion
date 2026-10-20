// Crisis detection for self-harm / suicidal intent, in English and Nigerian
// Pidgin. This is a high-recall keyword layer: it is cheap, runs on every
// message, and errs toward showing the support card. It will miss indirect
// phrasing, so pair it with a model-based classifier before launch
// (see README → Safety).

export interface CrisisResult {
  flagged: boolean;
  matched: string[];
}

const PATTERNS: { label: string; re: RegExp }[] = [
  // English
  { label: "kill_myself", re: /\bkill(ing)? my ?self\b/ },
  { label: "suicide", re: /\bsuicid(e|al)\b/ },
  { label: "end_my_life", re: /\b(end|take) (my|my own) life\b/ },
  { label: "want_to_die", re: /\b(i )?(want|wanna|wish|going) to die\b/ },
  { label: "dont_want_to_live", re: /\b(don ?t|do not|no longer) want to (live|be alive|exist)\b/ },
  { label: "no_reason_to_live", re: /\bno (reason|point) (to|in) (live|living|going on)\b/ },
  { label: "better_off_dead", re: /\bbetter off (dead|without me)\b/ },
  { label: "end_it_all", re: /\bend it all\b/ },
  { label: "self_harm", re: /\bself ?harm(ing)?\b/ },
  { label: "hurt_myself", re: /\b(hurt(ing)?|cut(ting)?|harm(ing)?|burn(ing)?) my ?self\b/ },
  { label: "overdose", re: /\boverdos(e|ing)\b/ },
  // Nigerian Pidgin
  { label: "pcm_kill_myself", re: /\b(i )?(wan|go|fit) kill my ?self\b/ },
  { label: "pcm_want_die", re: /\b(i )?(wan|just wan) (die|comot for this world)\b/ },
  { label: "pcm_make_i_die", re: /\bmake i (just )?die\b/ },
  { label: "pcm_no_want_live", re: /\b(i )?no (wan|want) (live|dey alive)( again)?\b/ },
  { label: "pcm_tire_for_life", re: /\b(i )?(don )?tire for (this )?life\b/ },
  { label: "pcm_end_am", re: /\b(i )?(go|wan) end (am|my life)\b/ },
];

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectCrisis(text: string): CrisisResult {
  const t = normalise(text);
  const matched = PATTERNS.filter((p) => p.re.test(t)).map((p) => p.label);
  return { flagged: matched.length > 0, matched };
}
