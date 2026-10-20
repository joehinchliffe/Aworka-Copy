import { addDays, type IsoDate, weekday } from "./dates";

/** Bitmask of allowed weekdays: Sun = 1, Mon = 2, ... Sat = 64. 127 = every day. */
export type DayMask = number;
export const ALL_DAYS: DayMask = 127;
export const WEEKDAYS: DayMask = 0b0111110;

export function maskFromDays(days: number[]): DayMask {
  const mask = days.reduce((m, d) => m | (1 << d), 0);
  return mask === 0 ? ALL_DAYS : mask;
}

export function isAllowed(mask: DayMask, date: IsoDate): boolean {
  return (mask & (1 << weekday(date))) !== 0;
}

/** First allowed date on or after `date`. An empty mask is treated as all days. */
export function nextAllowed(mask: DayMask, date: IsoDate): IsoDate {
  const m = mask & ALL_DAYS || ALL_DAYS;
  let d = date;
  for (let i = 0; i < 7; i++) {
    if (isAllowed(m, d)) return d;
    d = addDays(d, 1);
  }
  return date;
}
