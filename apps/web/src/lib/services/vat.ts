import { and, between, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { jobGross } from "./ledger";

export type VatScheme = "standard" | "cash_accounting" | "flat_rate" | "flat_rate_cash" | "annual";

export interface VatRegistration {
  regNo: string;
  scheme: VatScheme;
  rate: number; // 0.2
  flatRate?: number; // e.g. 0.12
  capitalAssetThreshold?: number; // pence, default 200000
}

/** The nine boxes of a UK VAT return. Boxes 1-5 in pence; 6-9 in whole pounds as HMRC requires. */
export interface VatReturn {
  vatDueSales: number;
  vatDueAcquisitions: number;
  totalVatDue: number;
  vatReclaimedCurrPeriod: number;
  netVatDue: number;
  totalValueSalesExVAT: number;
  totalValuePurchasesExVAT: number;
  totalValueGoodsSuppliedExVAT: number;
  totalAcquisitionsExVAT: number;
}

const pounds = (pence: number) => Math.trunc(pence / 100);
const vatFraction = (gross: number, rate: number) => Math.round((gross * rate) / (1 + rate));

/**
 * Compute a VAT return for [start, end].
 * - standard / annual: sales VAT from done jobs by job date (tax point = date of supply).
 * - cash accounting: sales VAT from payments received in the period.
 * - flat rate: flat percentage of gross turnover; only capital purchases over the threshold are reclaimable.
 */
export async function computeVatReturn(accountId: string, reg: VatRegistration, start: string, end: string): Promise<VatReturn> {
  const cash = reg.scheme === "cash_accounting" || reg.scheme === "flat_rate_cash";
  const flat = reg.scheme === "flat_rate" || reg.scheme === "flat_rate_cash";

  let salesGross = 0, salesVat = 0, salesNet = 0;
  if (cash) {
    const [p] = await db.select({ total: sql<number>`coalesce(sum(${schema.payments.paid} - ${schema.payments.tip}),0)::int` })
      .from(schema.payments)
      .where(and(eq(schema.payments.accountId, accountId), between(schema.payments.date, start, end), ne(schema.payments.status, "failed")));
    salesGross = p?.total ?? 0;
    salesVat = vatFraction(salesGross, reg.rate);
    salesNet = salesGross - salesVat;
  } else {
    const jobs = await db.select({ price: schema.jobs.price, vatStatus: schema.jobs.vatStatus, vatRate: schema.jobs.vatRate })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.status, "done"), between(schema.jobs.date, start, end)));
    for (const j of jobs) {
      const gross = jobGross(j);
      const vatable = (j.vatStatus === "inc_vat" || j.vatStatus === "ex_vat") && j.vatRate > 0;
      const vat = vatable ? vatFraction(gross, j.vatRate) : 0;
      salesGross += gross; salesVat += vat; salesNet += gross - vat;
    }
  }

  const expenses = await db.select({ e: schema.expenses, capital: schema.expenseCategories.capitalAsset })
    .from(schema.expenses)
    .innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, schema.expenses.categoryId))
    .where(and(eq(schema.expenses.accountId, accountId), between(schema.expenses.date, start, end)));
  let reclaim = 0, purchasesNet = 0;
  const threshold = reg.capitalAssetThreshold ?? 200000;
  for (const { e, capital } of expenses) {
    const amount = e.amount ?? 0;
    const vat = e.vatStatus === "inc_charged" ? e.vatCharged ?? 0 : e.vatStatus === "inc_at_rate" ? vatFraction(amount, e.vatRate) : 0;
    const privateShare = (e.privateUsePercent ?? 0) / 100;
    const reclaimable = e.reclaimableVat ?? Math.round(vat * (1 - privateShare));
    if (flat) {
      if (capital && amount >= threshold) { reclaim += reclaimable; purchasesNet += amount - vat; }
    } else {
      reclaim += reclaimable;
      purchasesNet += amount - vat;
    }
  }

  const vatDueSales = flat ? Math.round(salesGross * (reg.flatRate ?? 0)) : salesVat;
  const totalVatDue = vatDueSales;
  const netVatDue = Math.abs(totalVatDue - reclaim);
  return {
    vatDueSales, vatDueAcquisitions: 0, totalVatDue, vatReclaimedCurrPeriod: reclaim, netVatDue,
    totalValueSalesExVAT: pounds(flat ? salesGross : salesNet),
    totalValuePurchasesExVAT: pounds(purchasesNet),
    totalValueGoodsSuppliedExVAT: 0, totalAcquisitionsExVAT: 0,
  };
}

/** HMRC expects boxes 1-5 in pounds with two decimal places. */
export function toHmrcBody(periodKey: string, r: VatReturn) {
  const p2 = (pence: number) => Math.round(pence) / 100;
  return {
    periodKey,
    vatDueSales: p2(r.vatDueSales),
    vatDueAcquisitions: p2(r.vatDueAcquisitions),
    totalVatDue: p2(r.totalVatDue),
    vatReclaimedCurrPeriod: p2(r.vatReclaimedCurrPeriod),
    netVatDue: p2(r.netVatDue),
    totalValueSalesExVAT: r.totalValueSalesExVAT,
    totalValuePurchasesExVAT: r.totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT: r.totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT: r.totalAcquisitionsExVAT,
    finalised: true,
  };
}
