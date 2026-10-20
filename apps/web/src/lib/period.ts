import { addDays, addMonths, type IsoDate } from "@rounds/domain";

export type PeriodUnit = "day" | "week" | "month" | "year";

/** Inclusive date range of `num` units starting or ending on `date`. */
export function periodRange(num: number, unit: PeriodUnit, startOrEnd: "starting" | "ending", date: IsoDate): { start: IsoDate; end: IsoDate } {
  const n = Math.max(1, Math.trunc(num) || 1);
  const shift = (d: IsoDate, k: number) =>
    unit === "day" ? addDays(d, k) : unit === "week" ? addDays(d, 7 * k) : unit === "month" ? addMonths(d, k) : addMonths(d, 12 * k);
  return startOrEnd === "starting"
    ? { start: date, end: addDays(shift(date, n), -1) }
    : { start: addDays(shift(date, -n), 1), end: date };
}
