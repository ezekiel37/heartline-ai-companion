export const MIN_AGE = 18;

export function ageOn(dob: string, now: Date): number {
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday =
    now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export function isAdult(dob: string | null | undefined, now: Date): boolean {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const age = ageOn(dob, now);
  return Number.isFinite(age) && age >= MIN_AGE && age < 120;
}
