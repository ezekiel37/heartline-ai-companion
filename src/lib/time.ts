// Daily limits reset at midnight West Africa Time, not UTC.
export const APP_TIMEZONE = "Africa/Lagos";

export function appDate(d: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
