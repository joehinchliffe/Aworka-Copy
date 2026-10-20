import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  addDays, addMonths, daysInMonth, diffDays, netFromGross, nextDueDate, parseIso, projectOccurrences, toIso,
  type IsoDate, type Pence,
} from "@rounds/domain";
import { db, schema } from "@/db";
import { contactName, jobGross } from "./ledger";
import { recurrenceOf } from "./planning";

/* ------------------------------------------------------------------ */
/* Periods                                                             */
/* ------------------------------------------------------------------ */

export interface Period { start: IsoDate; end: IsoDate }

function yearEndIn(year: number, month: number, day: number): IsoDate {
  const m0 = Math.min(12, Math.max(1, month)) - 1;
  return toIso(new Date(Date.UTC(year, m0, Math.min(Math.max(1, day), daysInMonth(year, m0)))));
}

/**
 * The tax (financial) year containing `date`, given the account's year end
 * (inclusive). The UK default is a 5 April year end: 6 April to 5 April.
 */
export function taxYear(settings: { yearEndMonth?: number | null; yearEndDay?: number | null }, date: IsoDate): Period {
  const month = settings.yearEndMonth ?? 4;
  const day = settings.yearEndDay ?? 5;
  const y = parseIso(date).getUTCFullYear();
  const endThisYear = yearEndIn(y, month, day);
  if (date <= endThisYear) return { start: addDays(yearEndIn(y - 1, month, day), 1), end: endThisYear };
  return { start: addDays(endThisYear, 1), end: yearEndIn(y + 1, month, day) };
}

export const monthKey = (d: IsoDate) => d.slice(0, 7);
export const monthStart = (d: IsoDate): IsoDate => `${d.slice(0, 7)}-01`;
export function monthEnd(d: IsoDate): IsoDate {
  const x = parseIso(d);
  return toIso(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), daysInMonth(x.getUTCFullYear(), x.getUTCMonth()))));
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
/** Month keys (YYYY-MM) covering [start, end]. */
export function monthsBetween(start: IsoDate, end: IsoDate): string[] {
  const out: string[] = [];
  for (let d = monthStart(start); d <= end; d = addMonths(d, 1)) out.push(monthKey(d));
  return out;
}

export type PeriodUnit = "day" | "week" | "month" | "year";

/** A window of N units starting or ending on a date (both ends inclusive). */
export function periodWindow(num: number, unit: PeriodUnit, mode: "starting" | "ending", date: IsoDate): Period {
  const n = Math.max(1, Math.floor(num));
  const shift = (d: IsoDate, k: number) =>
    unit === "day" ? addDays(d, k) : unit === "week" ? addDays(d, 7 * k) : addMonths(d, unit === "year" ? 12 * k : k);
  return mode === "starting"
    ? { start: date, end: addDays(shift(date, n), -1) }
    : { start: addDays(shift(date, -n), 1), end: date };
}

async function getAccount(accountId: string) {
  const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  if (!a) throw new Error("Account not found");
  return a;
}

/** Net (ex VAT) value of a job. */
export function jobNet(job: { price: number; vatStatus: string; vatRate: number }): Pence {
  if (job.vatStatus === "inc_vat" && job.vatRate > 0) return netFromGross(job.price, job.vatRate);
  return job.price;
}

const NO_ROUND = "none";
const NO_ROUND_LABEL = "No round";

async function roundNames(accountId: string) {
  const rows = await db.select().from(schema.rounds).where(eq(schema.rounds.accountId, accountId)).orderBy(asc(schema.rounds.name));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Each customer's main round: the round of their first job spec. */
async function customerRounds(accountId: string) {
  const rows = await db.select({ customerId: schema.jobSpecs.customerId, roundId: schema.jobSpecs.roundId })
    .from(schema.jobSpecs).where(eq(schema.jobSpecs.accountId, accountId))
    .orderBy(asc(schema.jobSpecs.createdAt));
  const map = new Map<string, string>();
  for (const r of rows) if (!map.has(r.customerId) || (map.get(r.customerId) === NO_ROUND && r.roundId)) map.set(r.customerId, r.roundId ?? NO_ROUND);
  return map;
}

/* ------------------------------------------------------------------ */
/* Sales summary                                                       */
/* ------------------------------------------------------------------ */

export interface SalesLine { key: string; label: string; start: IsoDate; end: IsoDate; jobs: Pence; payments: Pence; jobCount: number }

/** Gross value of jobs done and payments received over the standard dashboard periods. */
export async function salesSummary(accountId: string, today: IsoDate): Promise<SalesLine[]> {
  const account = await getAccount(accountId);
  const firstWeekDay = account.settings.firstWeekDay ?? 1;
  const weekStart = addDays(today, -((parseIso(today).getUTCDay() - firstWeekDay + 7) % 7));
  const ty = taxYear(account, today);
  const lastYearToday = addMonths(today, -12);
  const lastTy = taxYear(account, lastYearToday);
  const periods: Omit<SalesLine, "jobs" | "payments" | "jobCount">[] = [
    { key: "today", label: "Today", start: today, end: today },
    { key: "yesterday", label: "Yesterday", start: addDays(today, -1), end: addDays(today, -1) },
    { key: "this_week", label: "This week", start: weekStart, end: addDays(weekStart, 6) },
    { key: "last_week", label: "Last week", start: addDays(weekStart, -7), end: addDays(weekStart, -1) },
    { key: "this_month", label: "This month", start: monthStart(today), end: monthEnd(today) },
    { key: "last_month", label: "Last month", start: monthStart(addMonths(monthStart(today), -1)), end: addDays(monthStart(today), -1) },
    { key: "tax_year", label: "Tax year to date", start: ty.start, end: today },
    { key: "last_tax_year", label: "Same period last year", start: lastTy.start, end: lastYearToday },
  ];
  const from = periods.reduce((m, p) => (p.start < m ? p.start : m), today);
  const to = periods.reduce((m, p) => (p.end > m ? p.end : m), today);

  const jobs = await db.select({ date: schema.jobs.date, price: schema.jobs.price, vatStatus: schema.jobs.vatStatus, vatRate: schema.jobs.vatRate })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.status, "done"), gte(schema.jobs.date, from), lte(schema.jobs.date, to)));
  const pays = await db.select({ date: schema.payments.date, paid: schema.payments.paid })
    .from(schema.payments)
    .where(and(eq(schema.payments.accountId, accountId), sql`${schema.payments.status} <> 'failed'`, gte(schema.payments.date, from), lte(schema.payments.date, to)));

  return periods.map((p) => {
    const inP = (d: IsoDate) => d >= p.start && d <= p.end;
    const js = jobs.filter((j) => inP(j.date));
    return {
      ...p,
      jobs: js.reduce((s, j) => s + jobGross(j), 0),
      jobCount: js.length,
      payments: pays.filter((x) => inP(x.date)).reduce((s, x) => s + x.paid, 0),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Profit and loss                                                     */
/* ------------------------------------------------------------------ */

export type Basis = "accrual" | "cash";
export type GroupBy = "round" | "month";

export interface PnlRow { label: string; values: Pence[]; total: Pence }
export interface ProfitAndLoss {
  start: IsoDate;
  end: IsoDate;
  basis: Basis;
  groupBy: GroupBy;
  columns: { key: string; label: string }[];
  /** Net sales (ex VAT): one row per round when grouped by month, otherwise a single row. */
  netSales: PnlRow[];
  netSalesTotal: PnlRow;
  /** Money received: payments excluding tips, then tips (including overpayments). */
  grossIncome: PnlRow[];
  grossIncomeTotal: PnlRow;
  /** Debts written off (accrual basis only reduces profit). */
  badDebt: PnlRow;
  /** Net expenses per category, excluding reclaimable VAT and capital assets. */
  expenses: PnlRow[];
  expensesTotal: PnlRow;
  /** Capital asset purchases, shown separately and not deducted from profit. */
  capitalAssets: PnlRow[];
  /** Net sales + tips - bad debt (accrual) - expenses. */
  profit: PnlRow;
}

class Grid {
  constructor(private cols: string[]) {}
  private rows = new Map<string, Pence[]>();
  add(row: string, col: string, amount: Pence) {
    const i = this.cols.indexOf(col);
    if (i < 0 || !amount) return;
    const r = this.rows.get(row) ?? this.cols.map(() => 0);
    r[i]! += amount;
    this.rows.set(row, r);
  }
  get(row: string): Pence[] { return this.rows.get(row) ?? this.cols.map(() => 0); }
  keys() { return [...this.rows.keys()]; }
}
const mkRow = (label: string, values: Pence[]): PnlRow => ({ label, values, total: values.reduce((s, v) => s + v, 0) });
const sumRows = (label: string, rows: PnlRow[], width: number): PnlRow =>
  mkRow(label, Array.from({ length: width }, (_, i) => rows.reduce((s, r) => s + (r.values[i] ?? 0), 0)));

export async function profitAndLoss(accountId: string, start: IsoDate, end: IsoDate, basis: Basis = "accrual", groupBy: GroupBy = "month"): Promise<ProfitAndLoss> {
  const account = await getAccount(accountId);
  const rounds = await roundNames(accountId);
  const custRound = await customerRounds(accountId);
  const roundLabel = (id: string) => (id === NO_ROUND ? NO_ROUND_LABEL : rounds.get(id) ?? NO_ROUND_LABEL);

  // Data
  const doneJobs = await db.select({ job: schema.jobs, roundId: schema.jobSpecs.roundId })
    .from(schema.jobs).innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.status, "done"), gte(schema.jobs.date, start), lte(schema.jobs.date, end)));
  const pays = await db.select({ pay: schema.payments, job: schema.jobs, roundId: schema.jobSpecs.roundId })
    .from(schema.payments)
    .leftJoin(schema.jobs, eq(schema.jobs.id, schema.payments.jobId))
    .leftJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .where(and(eq(schema.payments.accountId, accountId), sql`${schema.payments.status} <> 'failed'`, gte(schema.payments.date, start), lte(schema.payments.date, end)));
  const adjs = await db.select().from(schema.adjustments)
    .where(and(eq(schema.adjustments.accountId, accountId), inArray(schema.adjustments.type, ["bad_debt", "overpayment", "tip"]),
      gte(schema.adjustments.date, start), lte(schema.adjustments.date, end)));
  const exps = await db.select({ e: schema.expenses, cat: schema.expenseCategories })
    .from(schema.expenses).innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, schema.expenses.categoryId))
    .where(and(eq(schema.expenses.accountId, accountId), gte(schema.expenses.date, start), lte(schema.expenses.date, end)));

  // Columns
  const OTHER = "unallocated";
  let columns: { key: string; label: string }[];
  if (groupBy === "month") {
    columns = monthsBetween(start, end).map((k) => ({ key: k, label: monthLabel(k) }));
  } else {
    const used = new Set<string>();
    for (const j of doneJobs) used.add(j.roundId ?? NO_ROUND);
    for (const p of pays) used.add(p.roundId ?? custRound.get(p.pay.customerId) ?? NO_ROUND);
    for (const a of adjs) used.add(custRound.get(a.customerId) ?? NO_ROUND);
    columns = [...rounds.keys()].filter((id) => used.has(id)).map((id) => ({ key: id, label: rounds.get(id)! }));
    if (used.has(NO_ROUND)) columns.push({ key: NO_ROUND, label: NO_ROUND_LABEL });
    columns.push({ key: OTHER, label: "Not allocated" });
  }
  const keys = columns.map((c) => c.key);
  const col = (date: IsoDate, round: string) => (groupBy === "month" ? monthKey(date) : round);
  const width = keys.length;

  // Net sales
  const sales = new Grid(keys);
  const salesRowKey = (round: string) => (groupBy === "month" ? round : "all");
  if (basis === "accrual") {
    for (const { job, roundId } of doneJobs) {
      const r = roundId ?? NO_ROUND;
      sales.add(salesRowKey(r), col(job.date, r), jobNet(job));
    }
  } else {
    for (const { pay, job, roundId } of pays) {
      const r = roundId ?? custRound.get(pay.customerId) ?? NO_ROUND;
      const received = pay.paid - pay.tip;
      const rate = job ? (job.vatStatus === "inc_vat" || job.vatStatus === "ex_vat" ? job.vatRate : 0) : account.collectsVat ? account.vatRate : 0;
      sales.add(salesRowKey(r), col(pay.date, r), rate > 0 ? netFromGross(received, rate) : received);
    }
  }
  const netSales = groupBy === "month"
    ? [...[...rounds.keys()], NO_ROUND].filter((r) => sales.keys().includes(r)).map((r) => mkRow(roundLabel(r), sales.get(r)))
    : [mkRow("Net sales", sales.get("all"))];
  const netSalesTotal = sumRows("Total net sales", netSales, width);

  // Gross income
  const income = new Grid(keys);
  for (const { pay, roundId } of pays) {
    const r = roundId ?? custRound.get(pay.customerId) ?? NO_ROUND;
    income.add("received", col(pay.date, r), pay.paid - pay.tip);
    income.add("tips", col(pay.date, r), pay.tip);
  }
  const bad = new Grid(keys);
  for (const a of adjs) {
    const r = custRound.get(a.customerId) ?? NO_ROUND;
    if (a.type === "bad_debt") bad.add("bad", col(a.date, r), a.amount);
    else income.add("tips", col(a.date, r), a.amount); // overpayments are kept as tips
  }
  const grossIncome = [mkRow("Payments received (excluding tips)", income.get("received")), mkRow("Tips", income.get("tips"))];
  const grossIncomeTotal = sumRows("Total gross income", grossIncome, width);
  const badDebt = mkRow("Bad debt", bad.get("bad"));

  // Expenses
  const expGrid = new Grid(keys);
  const capGrid = new Grid(keys);
  const catNames = new Map<string, string>();
  for (const { e, cat } of exps) {
    catNames.set(cat.id, cat.name);
    const net = (e.amount ?? 0) - (e.reclaimableVat ?? 0);
    (cat.capitalAsset ? capGrid : expGrid).add(cat.id, col(e.date, OTHER), net);
  }
  const byName = (a: PnlRow, b: PnlRow) => a.label.localeCompare(b.label);
  const expenses = expGrid.keys().map((k) => mkRow(catNames.get(k)!, expGrid.get(k))).sort(byName);
  const capitalAssets = capGrid.keys().map((k) => mkRow(catNames.get(k)!, capGrid.get(k))).sort(byName);
  const expensesTotal = sumRows("Total net expenses", expenses, width);

  const tips = grossIncome[1]!;
  const profit = mkRow("Profit before tax", keys.map((_, i) =>
    netSalesTotal.values[i]! + tips.values[i]! - (basis === "accrual" ? badDebt.values[i]! : 0) - expensesTotal.values[i]!));

  return { start, end, basis, groupBy, columns, netSales, netSalesTotal, grossIncome, grossIncomeTotal, badDebt, expenses, expensesTotal, capitalAssets, profit };
}

/** Flatten a P&L into CSV rows (section, line, columns..., total). */
export function pnlCsvRows(p: ProfitAndLoss): (string | number)[][] {
  const pounds = (v: number) => (v / 100).toFixed(2);
  const out: (string | number)[][] = [["Section", "Line", ...p.columns.map((c) => c.label), "Total"]];
  const push = (section: string, r: PnlRow) => out.push([section, r.label, ...r.values.map(pounds), pounds(r.total)]);
  p.netSales.forEach((r) => push("Net sales", r)); push("Net sales", p.netSalesTotal);
  p.grossIncome.forEach((r) => push("Gross income", r)); push("Gross income", p.grossIncomeTotal);
  push("Bad debt", p.badDebt);
  p.expenses.forEach((r) => push("Net expenses", r)); push("Net expenses", p.expensesTotal);
  p.capitalAssets.forEach((r) => push("Capital assets", r));
  push("Profit", p.profit);
  return out;
}

/* ------------------------------------------------------------------ */
/* Valuation and forecast                                              */
/* ------------------------------------------------------------------ */

/** Visits a year for a regular job spec. */
export function visitsPerYear(s: { regularity: string; timesPerPeriod: number; numPeriods: number; periodUnit: string }): number {
  if (s.regularity !== "regularly") return 0;
  const periodsPerYear = { day: 365, week: 52, month: 12, year: 1 }[s.periodUnit] ?? 0;
  return (periodsPerYear / Math.max(1, s.numPeriods)) * Math.max(1, s.timesPerPeriod);
}

export interface ValuationRow { roundId: string | null; name: string; customers: number; jobs: number; annualValue: Pence }

/** Annualised value of the active regular work on the books as at a date, per round. */
export async function valuation(accountId: string, asAt: IsoDate) {
  const rounds = await roundNames(accountId);
  const specs = await db.select({ spec: schema.jobSpecs }).from(schema.jobSpecs)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
    .where(and(eq(schema.jobSpecs.accountId, accountId), eq(schema.jobSpecs.status, "active"), eq(schema.jobSpecs.regularity, "regularly"),
      isNull(schema.customers.deletedAt), sql`${schema.jobSpecs.createdAt}::date <= ${asAt}`));
  const by = new Map<string, { customers: Set<string>; jobs: number; value: number }>();
  for (const { spec } of specs) {
    const k = spec.roundId ?? NO_ROUND;
    const e = by.get(k) ?? { customers: new Set(), jobs: 0, value: 0 };
    e.customers.add(spec.customerId);
    e.jobs++;
    e.value += spec.price * visitsPerYear(spec);
    by.set(k, e);
  }
  const order = [...rounds.keys(), NO_ROUND];
  const rows: ValuationRow[] = order.filter((k) => by.has(k)).map((k) => {
    const e = by.get(k)!;
    return { roundId: k === NO_ROUND ? null : k, name: k === NO_ROUND ? NO_ROUND_LABEL : rounds.get(k)!, customers: e.customers.size, jobs: e.jobs, annualValue: Math.round(e.value) };
  });
  const total = { customers: new Set(specs.map((s) => s.spec.customerId)).size, jobs: specs.length, annualValue: rows.reduce((s, r) => s + r.annualValue, 0) };
  return { asAt, rows, total };
}

export interface ForecastRow { roundId: string | null; name: string; values: Pence[]; total: Pence }

/** Projected job value (less VAT) per month per round, from each active spec's next due date. */
export async function incomeForecast(accountId: string, start: IsoDate, end: IsoDate) {
  const account = await getAccount(accountId);
  const rounds = await roundNames(accountId);
  const months = monthsBetween(start, end);
  const specs = await db.select({ spec: schema.jobSpecs }).from(schema.jobSpecs)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
    .where(and(eq(schema.jobSpecs.accountId, accountId), eq(schema.jobSpecs.status, "active"), isNull(schema.customers.deletedAt),
      sql`${schema.jobSpecs.nextDueOn} is not null`, lte(schema.jobSpecs.nextDueOn, end)));
  const grid = new Grid(months);
  for (const { spec } of specs) {
    const rate = account.collectsVat && (spec.vatStatus === "inc_vat" || spec.vatStatus === "ex_vat") ? account.vatRate : 0;
    const net = jobNet({ price: spec.price, vatStatus: spec.vatStatus, vatRate: rate });
    for (const d of projectOccurrences(recurrenceOf(spec), spec.nextDueOn!, start, end)) grid.add(spec.roundId ?? NO_ROUND, monthKey(d), net);
  }
  const rows: ForecastRow[] = [...rounds.keys(), NO_ROUND].filter((k) => grid.keys().includes(k)).map((k) => {
    const values = grid.get(k);
    return { roundId: k === NO_ROUND ? null : k, name: k === NO_ROUND ? NO_ROUND_LABEL : rounds.get(k)!, values, total: values.reduce((s, v) => s + v, 0) };
  });
  const totals = months.map((_, i) => rows.reduce((s, r) => s + r.values[i]!, 0));
  return { start, end, months: months.map((k) => ({ key: k, label: monthLabel(k) })), rows, totals, total: totals.reduce((s, v) => s + v, 0) };
}

/* ------------------------------------------------------------------ */
/* Customer retention                                                  */
/* ------------------------------------------------------------------ */

/**
 * Retention over the 12 months to `end`. A customer is active on a date when
 * they had a job done within two of their cycles before it and were not
 * deleted. Gained = first job done in the period; lost = active at the start
 * or gained, but no job done in the last two cycles, deleted, or every job
 * suspended/deleted by the end.
 */
export async function customerRetention(accountId: string, end: IsoDate) {
  const start = addMonths(end, -12);
  const customers = await db.select().from(schema.customers).where(eq(schema.customers.accountId, accountId));
  const specs = await db.select().from(schema.jobSpecs).where(eq(schema.jobSpecs.accountId, accountId));
  const done = await db.select({ customerId: schema.jobSpecs.customerId, date: schema.jobs.date })
    .from(schema.jobs).innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.status, "done"), lte(schema.jobs.date, end)));

  const datesBy = new Map<string, IsoDate[]>();
  for (const d of done) datesBy.set(d.customerId, [...(datesBy.get(d.customerId) ?? []), d.date]);
  const specsBy = new Map<string, (typeof specs)[number][]>();
  for (const s of specs) specsBy.set(s.customerId, [...(specsBy.get(s.customerId) ?? []), s]);

  const cycleDays = (customerId: string): number => {
    let best = Infinity;
    for (const s of specsBy.get(customerId) ?? []) {
      const n = nextDueDate(recurrenceOf(s), end);
      if (n) best = Math.min(best, diffDays(end, n));
    }
    return Number.isFinite(best) ? best : 183;
  };
  const lastDoneBy = (dates: IsoDate[], d: IsoDate) => dates.filter((x) => x <= d).sort().at(-1);

  let atStart = 0, gained = 0, lost = 0, retained = 0;
  const lostCustomers: string[] = [];
  for (const c of customers) {
    const dates = datesBy.get(c.id) ?? [];
    if (!dates.length) continue;
    const first = [...dates].sort()[0]!;
    const cycle2 = 2 * cycleDays(c.id);
    const deletedOn = c.deletedAt ? toIso(c.deletedAt) : null;
    const lastAtStart = lastDoneBy(dates, start);
    const activeAtStart = !!lastAtStart && diffDays(lastAtStart, start) <= cycle2 && !(deletedOn && deletedOn <= start);
    const isGained = first > start && first <= end;
    if (!activeAtStart && !isGained) continue;
    const lastAtEnd = lastDoneBy(dates, end)!;
    const allStopped = (specsBy.get(c.id) ?? []).every((s) => s.status === "suspended" || s.status === "deleted");
    const isLost = (deletedOn != null && deletedOn <= end) || allStopped || diffDays(lastAtEnd, end) > cycle2;
    if (activeAtStart) atStart++;
    if (isGained) gained++;
    if (isLost) { lost++; lostCustomers.push(c.id); }
    if (activeAtStart && !isLost) retained++;
  }
  return {
    start, end, atStart, gained, lost, retained,
    atEnd: atStart + gained - lost,
    retentionPercent: atStart ? Math.round((retained / atStart) * 1000) / 10 : null,
    lostCustomerIds: lostCustomers,
  };
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export const ACTIVITY_CATEGORIES: Record<string, string> = {
  jobs: "Jobs", estimates: "Estimates", payments: "Payments", adjustments: "Adjustments",
  invoices: "Invoices", receipts: "Receipts", job_value_changes: "Job value changes",
};

export interface ActivityFilter {
  category?: string;
  subcategory?: string;
  search?: string;
  num?: number;
  unit?: PeriodUnit;
  mode?: "starting" | "ending";
  date?: IsoDate;
  limit?: number;
}

export async function activity(accountId: string, f: ActivityFilter, today: IsoDate) {
  const period = periodWindow(f.num ?? 1, f.unit ?? "month", f.mode ?? "ending", f.date ?? today);
  const conds = [eq(schema.activities.accountId, accountId), gte(schema.activities.date, period.start), lte(schema.activities.date, period.end)];
  if (f.category) conds.push(eq(schema.activities.category, f.category));
  if (f.subcategory) conds.push(eq(schema.activities.subcategory, f.subcategory));
  if (f.search) {
    const q = `%${f.search}%`;
    conds.push(or(ilike(schema.activities.summary, q), ilike(schema.contacts.lastName, q), ilike(schema.contacts.firstNames, q),
      ilike(schema.contacts.company, q), ilike(schema.contacts.address, q))!);
  }
  const rows = await db.select({ a: schema.activities, contact: schema.contacts, userName: schema.users.name })
    .from(schema.activities)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.activities.customerId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .leftJoin(schema.users, eq(schema.users.id, schema.activities.userId))
    .where(and(...conds))
    .orderBy(desc(schema.activities.date), desc(schema.activities.createdAt))
    .limit(f.limit ?? 2000);
  const subcategories = await db.selectDistinct({ category: schema.activities.category, subcategory: schema.activities.subcategory })
    .from(schema.activities).where(eq(schema.activities.accountId, accountId));
  return {
    period,
    rows: rows.map(({ a, contact, userName }) => ({ ...a, customerName: contact ? contactName(contact) : null, userName })),
    total: rows.reduce((s, r) => s + (r.a.amount ?? 0), 0),
    subcategories: subcategories.filter((s) => s.subcategory).map((s) => ({ category: s.category, subcategory: s.subcategory! })),
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export async function dashboard(accountId: string, today: IsoDate) {
  const sales = await salesSummary(accountId, today);
  const [debts] = await db.select({ total: sql<number>`coalesce(sum(${schema.customers.balance}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(schema.customers)
    .where(and(eq(schema.customers.accountId, accountId), isNull(schema.customers.deletedAt), lt(schema.customers.balance, 0)));
  const todays = await db.select({ status: schema.jobs.status, price: schema.jobs.price, vatStatus: schema.jobs.vatStatus, vatRate: schema.jobs.vatRate })
    .from(schema.jobs).where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.date, today)));
  const [overdue] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobSpecs)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
    .where(and(eq(schema.jobSpecs.accountId, accountId), eq(schema.jobSpecs.status, "active"), isNull(schema.customers.deletedAt),
      lt(schema.jobSpecs.nextDueOn, today),
      sql`not exists (select 1 from jobs j where j.job_spec_id = ${schema.jobSpecs.id} and j.status = 'to_do' and j.date >= ${today})`));
  const invoices = await db.select({ invoice: schema.invoices, contact: schema.contacts }).from(schema.invoices)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(eq(schema.invoices.accountId, accountId), eq(schema.invoices.kind, "invoice")))
    .orderBy(desc(schema.invoices.issuedOn), desc(schema.invoices.createdAt)).limit(6);
  const events = await db.select().from(schema.events)
    .where(and(eq(schema.events.accountId, accountId), inArray(schema.events.type, ["event", "to_do"]), gte(schema.events.date, today), lte(schema.events.date, addDays(today, 14))))
    .orderBy(asc(schema.events.date), asc(schema.events.time)).limit(10);
  return {
    sales,
    debts: { owed: -(debts?.total ?? 0), count: debts?.count ?? 0 },
    today: {
      count: todays.length,
      done: todays.filter((j) => j.status === "done").length,
      value: todays.filter((j) => j.status !== "not_done" && j.status !== "skipped").reduce((s, j) => s + jobGross(j), 0),
    },
    overdueCount: overdue?.count ?? 0,
    invoices: invoices.map(({ invoice, contact }) => ({ ...invoice, customerName: contactName(contact) })),
    events,
  };
}
