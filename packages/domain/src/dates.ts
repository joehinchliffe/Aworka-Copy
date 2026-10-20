/**
 * Calendar dates as ISO strings (YYYY-MM-DD). All arithmetic is done in UTC so
 * results never shift with the server or device time zone.
 */
export type IsoDate = string;

export function parseIso(d: IsoDate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Invalid ISO date: ${d}`);
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, day));
  if (date.getUTCMonth() !== m - 1) throw new Error(`Invalid ISO date: ${d}`);
  return date;
}

export function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const date = parseIso(d);
  date.setUTCDate(date.getUTCDate() + n);
  return toIso(date);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Add months, clamping to the last day of the target month (31 Jan + 1m = 28/29 Feb). */
export function addMonths(d: IsoDate, n: number): IsoDate {
  const date = parseIso(d);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + n;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonth(targetYear, targetMonth));
  return toIso(new Date(Date.UTC(targetYear, targetMonth, day)));
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(d: IsoDate): number {
  return parseIso(d).getUTCDay();
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
