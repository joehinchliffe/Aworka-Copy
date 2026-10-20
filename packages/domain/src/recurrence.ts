import { nextAllowed, type DayMask } from "./allowedDays";
import { addDays, addMonths, daysInMonth, diffDays, type IsoDate, parseIso, toIso } from "./dates";
import type { PeriodUnit, Regularity } from "./enums";

/**
 * Optional monthly placement rule:
 *  - { kind: "day_of_month", day: 1..31 } (31 = last day)
 *  - { kind: "nth_weekday", nth: 1..5, weekday: 0..6 } (5 = last)
 */
export type MonthRule =
  | { kind: "day_of_month"; day: number }
  | { kind: "nth_weekday"; nth: number; weekday: number };

export interface Recurrence {
  regularity: Regularity;
  /** e.g. 2 times per 1 month. */
  timesPerPeriod: number;
  numPeriods: number;
  periodUnit: PeriodUnit;
  allowedDays: DayMask;
  monthRule?: MonthRule;
}

/** Interval in days for day/week units, spreading N visits evenly through the period. */
function dayInterval(r: Recurrence): number {
  const unitDays = r.periodUnit === "day" ? 1 : 7;
  return Math.max(1, Math.round((r.numPeriods * unitDays) / Math.max(1, r.timesPerPeriod)));
}

function applyMonthRule(anyDateInMonth: IsoDate, rule: MonthRule): IsoDate {
  const d = parseIso(anyDateInMonth);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (rule.kind === "day_of_month") {
    return toIso(new Date(Date.UTC(y, m, Math.min(rule.day, daysInMonth(y, m)))));
  }
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  let day = 1 + ((rule.weekday - first + 7) % 7) + (rule.nth - 1) * 7;
  while (day > daysInMonth(y, m)) day -= 7; // nth=5 means "last"
  return toIso(new Date(Date.UTC(y, m, day)));
}

/**
 * Next due date after a visit on (or due on) `from`.
 * Returns null for one-off and on-request jobs, which are never auto-planned.
 */
export function nextDueDate(r: Recurrence, from: IsoDate): IsoDate | null {
  if (r.regularity !== "regularly") return null;

  let candidate: IsoDate;
  if (r.periodUnit === "day" || r.periodUnit === "week") {
    candidate = addDays(from, dayInterval(r));
  } else {
    const months = r.periodUnit === "year" ? r.numPeriods * 12 : r.numPeriods;
    if (r.timesPerPeriod > 1) {
      // Several visits per month(s): approximate with an even day spacing.
      const approxDays = Math.round((months * 365.25) / 12 / r.timesPerPeriod);
      candidate = addDays(from, Math.max(1, approxDays));
    } else {
      candidate = addMonths(from, months);
      if (r.monthRule) candidate = applyMonthRule(candidate, r.monthRule);
    }
  }
  return nextAllowed(r.allowedDays, candidate);
}

/** Planned dates for a job spec within [start, end], starting from its next due date. */
export function projectOccurrences(r: Recurrence, nextDue: IsoDate, start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let d: IsoDate | null = nextAllowed(r.allowedDays, nextDue);
  for (let guard = 0; d && d <= end && guard < 1000; guard++) {
    if (d >= start) out.push(d);
    d = nextDueDate(r, d);
  }
  return out;
}

/**
 * How late a job is on `date`, as a fraction of its interval: 0 = exactly due,
 * 1 = a whole cycle late, negative = early. Drives the planner's colour scale.
 */
export function lateness(r: Recurrence, nextDue: IsoDate, date: IsoDate): number | null {
  if (r.regularity !== "regularly") return null;
  const next = nextDueDate(r, nextDue);
  if (!next) return null;
  const interval = Math.max(1, diffDays(nextDue, next));
  return diffDays(nextDue, date) / interval;
}
