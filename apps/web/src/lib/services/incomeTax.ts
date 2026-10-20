import { and, between, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hmrcApiBase, accessToken } from "./hmrc";
import { jobGross } from "./ledger";

/** HMRC self-employment expense categories (Self Employment Business API v5). */
export const HMRC_EXPENSE_CATEGORIES = {
  costOfGoods: "Cost of goods bought for resale",
  paymentsToSubcontractors: "Payments to subcontractors",
  wagesAndStaffCosts: "Wages and staff costs",
  carVanTravelExpenses: "Car, van and travel",
  premisesRunningCosts: "Premises running costs",
  maintenanceCosts: "Repairs and maintenance",
  adminCosts: "Phone, stationery and office",
  businessEntertainmentCosts: "Business entertainment",
  advertisingCosts: "Advertising",
  interestOnBankOtherLoans: "Interest on loans",
  financeCharges: "Bank and card charges",
  irrecoverableDebts: "Bad debts",
  professionalFees: "Accountancy and legal fees",
  depreciation: "Depreciation",
  otherExpenses: "Other expenses",
} as const;
export type HmrcCategory = keyof typeof HMRC_EXPENSE_CATEGORIES;

/** Best-guess mapping of a category name, used until the user maps it. */
export function guessHmrcCategory(name: string): HmrcCategory {
  const n = name.toLowerCase();
  if (/fuel|petrol|diesel|van|vehicle|car|mileage|parking|toll|travel|insurance/.test(n)) return "carVanTravelExpenses";
  if (/wage|salary|staff|pension/.test(n)) return "wagesAndStaffCosts";
  if (/subcontract/.test(n)) return "paymentsToSubcontractors";
  if (/phone|mobile|stationery|postage|software|subscription|office|internet/.test(n)) return "adminCosts";
  if (/advert|marketing|leaflet|flyer|website/.test(n)) return "advertisingCosts";
  if (/repair|maintenance|service/.test(n)) return "maintenanceCosts";
  if (/bank|card fee|processing|gocardless|paypal|stripe/.test(n)) return "financeCharges";
  if (/accountan|legal|solicitor/.test(n)) return "professionalFees";
  if (/rent|rates|electric|gas|water|premises/.test(n)) return "premisesRunningCosts";
  if (/stock|materials|chemical|equipment|supplies|cleaning/.test(n)) return "costOfGoods";
  return "otherExpenses";
}

export interface QuarterlySummary {
  periodDates: { periodStartDate: string; periodEndDate: string };
  periodIncome: { turnover: number; other: number };
  periodExpenses?: Partial<Record<HmrcCategory, number>>;
  periodExpensesConsolidated?: number;
}

/**
 * Cumulative year-to-date figures for a self-employment business, in pounds.
 * Cash basis uses payments received; accrual uses done jobs. Capital assets are
 * excluded (claimed via allowances, not expenses). Private use is excluded.
 */
export async function cumulativeSummary(accountId: string, taxYearStart: string, periodEnd: string, opts: { basis: "cash" | "accrual"; consolidated?: boolean; categoryMap?: Record<string, HmrcCategory> }): Promise<QuarterlySummary> {
  let turnover = 0;
  if (opts.basis === "cash") {
    const [p] = await db.select({ t: sql<number>`coalesce(sum(${schema.payments.paid}),0)::int` }).from(schema.payments)
      .where(and(eq(schema.payments.accountId, accountId), between(schema.payments.date, taxYearStart, periodEnd), ne(schema.payments.status, "failed")));
    turnover = p?.t ?? 0;
  } else {
    const jobs = await db.select({ price: schema.jobs.price, vatStatus: schema.jobs.vatStatus, vatRate: schema.jobs.vatRate }).from(schema.jobs)
      .where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.status, "done"), between(schema.jobs.date, taxYearStart, periodEnd)));
    turnover = jobs.reduce((s, j) => s + jobGross(j), 0);
  }
  const rows = await db.select({ e: schema.expenses, cat: schema.expenseCategories }).from(schema.expenses)
    .innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, schema.expenses.categoryId))
    .where(and(eq(schema.expenses.accountId, accountId), between(schema.expenses.date, taxYearStart, periodEnd)));
  const byCat: Partial<Record<HmrcCategory, number>> = {};
  let total = 0;
  for (const { e, cat } of rows) {
    if (cat.capitalAsset || e.amount == null) continue;
    const allowable = e.allowable ?? Math.round(e.amount * (1 - (e.privateUsePercent ?? 0) / 100));
    const key = opts.categoryMap?.[cat.id] ?? guessHmrcCategory(cat.name);
    byCat[key] = (byCat[key] ?? 0) + allowable;
    total += allowable;
  }
  const pounds = (p: number) => Math.round(p) / 100;
  const summary: QuarterlySummary = {
    periodDates: { periodStartDate: taxYearStart, periodEndDate: periodEnd },
    periodIncome: { turnover: pounds(turnover), other: 0 },
  };
  // HMRC: consolidated expenses only allowed when turnover is under £90,000.
  if (opts.consolidated && turnover < 9_000_000) summary.periodExpensesConsolidated = pounds(total);
  else summary.periodExpenses = Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, pounds(v!)]));
  return summary;
}

async function call(accountId: string, path: string, version: string, fraud: Record<string, string>, init: RequestInit = {}) {
  const res = await fetch(`${hmrcApiBase()}${path}`, {
    ...init, headers: { Accept: `application/vnd.hmrc.${version}+json`, Authorization: `Bearer ${await accessToken(accountId)}`, "Content-Type": "application/json", ...fraud },
  });
  const body = res.status === 204 || res.status === 202 ? await res.json().catch(() => null) : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HMRC ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export const listBusinesses = (accountId: string, nino: string, fraud: Record<string, string>) =>
  call(accountId, `/individuals/business/details/${nino}/list`, "2.0", fraud);
export const incomeTaxObligations = (accountId: string, nino: string, fraud: Record<string, string>) =>
  call(accountId, `/obligations/details/${nino}/income-and-expenditure?status=open`, "3.0", fraud);
export const submitCumulative = (accountId: string, nino: string, businessId: string, taxYear: string, body: QuarterlySummary, fraud: Record<string, string>) =>
  call(accountId, `/individuals/business/self-employment/${nino}/${businessId}/cumulative/${taxYear}`, "5.0", fraud, { method: "PUT", body: JSON.stringify(body) });
export const triggerCalculation = (accountId: string, nino: string, taxYear: string, fraud: Record<string, string>) =>
  call(accountId, `/individuals/calculations/${nino}/self-assessment/${taxYear}/trigger/in-year`, "8.0", fraud, { method: "POST" });

/** "2026-27" style tax year label for a date, with 6 April year start. */
export function taxYearLabel(date: string) {
  const y = Number(date.slice(0, 4));
  const start = date >= `${y}-04-06` ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
