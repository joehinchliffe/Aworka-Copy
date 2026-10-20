import { addDays as addDaysIso, type IsoDate } from "@rounds/domain";

/** Today's date in the UK, where all customers of this product operate. */
export function todayIso(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

export const addDays = addDaysIso;

export function formatDate(d: IsoDate | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export function formatDay(d: IsoDate): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}
