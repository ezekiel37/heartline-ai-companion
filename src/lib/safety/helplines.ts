// Shown on the support card when crisis detection fires.
// VERIFY EVERY ENTRY BEFORE LAUNCH: helpline numbers change, and a dead number
// in a crisis is worse than none. Add Nigerian NGO lines (e.g. SURPIN, MANI)
// only after calling them and confirming hours.

export interface Helpline {
  name: string;
  detail: string;
  phone?: string;
  url?: string;
}

export const HELPLINES: Helpline[] = [
  { name: "Nigeria emergency", detail: "Police, ambulance, fire — 24/7", phone: "112" },
  { name: "Lagos State emergency", detail: "If you are in Lagos", phone: "767" },
  {
    name: "Find a Helpline",
    detail: "Free, confidential lines in Nigeria and worldwide",
    url: "https://findahelpline.com/countries/ng",
  },
  {
    name: "Befrienders Worldwide",
    detail: "Emotional support centres worldwide",
    url: "https://befrienders.org",
  },
];
