import { addDays, addMonths } from "@rounds/domain";
import { monthEnd, monthStart, taxYear, type ActivityFilter, type Basis, type GroupBy, type PeriodUnit } from "@/lib/services/reports";

type Params = Record<string, string | undefined>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (s: string | undefined) => (s && ISO.test(s) ? s : undefined);

export const PNL_PRESETS = {
  tax_year: "This tax year",
  last_tax_year: "Last tax year",
  this_month: "This month",
  last_month: "Last month",
  last_12_months: "Last 12 months",
} as const;

/** Read P&L options from the query string, defaulting to the current tax year. */
export function pnlParams(account: { yearEndMonth: number; yearEndDay: number; profitBasis: string }, sp: Params, today: string) {
  const ty = taxYear(account, today);
  let start = iso(sp.start) ?? ty.start;
  let end = iso(sp.end) ?? ty.end;
  switch (sp.preset) {
    case "tax_year": ({ start, end } = ty); break;
    case "last_tax_year": ({ start, end } = taxYear(account, addDays(ty.start, -1))); break;
    case "this_month": start = monthStart(today); end = monthEnd(today); break;
    case "last_month": start = monthStart(addMonths(monthStart(today), -1)); end = addDays(monthStart(today), -1); break;
    case "last_12_months": start = monthStart(addMonths(today, -11)); end = monthEnd(today); break;
  }
  if (end < start) [start, end] = [end, start];
  const basis: Basis = sp.basis === "cash" || sp.basis === "accrual" ? sp.basis : account.profitBasis === "cash" ? "cash" : "accrual";
  const groupBy: GroupBy = sp.group === "round" ? "round" : "month";
  return { start, end, basis, groupBy };
}

export function activityParams(sp: Params, today: string): ActivityFilter {
  const unit = (["day", "week", "month", "year"] as const).includes(sp.unit as PeriodUnit) ? (sp.unit as PeriodUnit) : "month";
  return {
    category: sp.category || undefined,
    subcategory: sp.sub || undefined,
    search: sp.q?.trim() || undefined,
    num: Math.min(366, Math.max(1, Number(sp.num) || 1)),
    unit,
    mode: sp.mode === "starting" ? "starting" : "ending",
    date: iso(sp.date) ?? today,
  };
}
