import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pg, schema } from "@/db";
import {
  activity, customerRetention, incomeForecast, periodWindow, pnlCsvRows, profitAndLoss, salesSummary, taxYear, valuation,
} from "@/lib/services/reports";

const CREATED = new Date("2025-01-01T12:00:00Z");
let accountId = "";
let monday = "";
let tuesday = "";
const cust: Record<string, string> = {};
const spec: Record<string, string> = {};

async function customer(key: string, lastName: string) {
  const [contact] = await db.insert(schema.contacts).values({ accountId, lastName, address: `${key} Street` }).returning();
  const [c] = await db.insert(schema.customers).values({ accountId, contactId: contact!.id, createdAt: CREATED }).returning();
  cust[key] = c!.id;
  return c!.id;
}

async function jobSpec(key: string, customerKey: string, v: Partial<typeof schema.jobSpecs.$inferInsert>) {
  const [s] = await db.insert(schema.jobSpecs).values({ accountId, customerId: cust[customerKey]!, createdAt: CREATED, ...v }).returning();
  spec[key] = s!.id;
  return s!.id;
}

async function doneJob(specKey: string, date: string, price: number, vatStatus: string, vatRate: number) {
  const [j] = await db.insert(schema.jobs).values({ accountId, jobSpecId: spec[specKey]!, date, status: "done", price, vatStatus, vatRate }).returning();
  return j!.id;
}

beforeAll(async () => {
  await pg`truncate accounts cascade`;
  const [account] = await db.insert(schema.accounts).values({ businessName: "Report Clean", collectsVat: true, vatRate: 0.2 }).returning();
  accountId = account!.id;
  const [r1] = await db.insert(schema.rounds).values({ accountId, name: "Monday" }).returning();
  const [r2] = await db.insert(schema.rounds).values({ accountId, name: "Tuesday" }).returning();
  monday = r1!.id;
  tuesday = r2!.id;

  await customer("c1", "Adams");
  await customer("c2", "Brown");
  await customer("c3", "Clark");
  await customer("c4", "Davis");
  await customer("c5", "Evans");

  // c1, Monday: 4-weekly £12 inc VAT, plus twice-monthly £5 inc VAT and a suspended weekly job.
  await jobSpec("s1", "c1", { roundId: monday, price: 1200, vatStatus: "inc_vat", numPeriods: 4, periodUnit: "week", nextDueOn: "2026-11-01" });
  await jobSpec("s5", "c1", { roundId: monday, price: 500, vatStatus: "inc_vat", timesPerPeriod: 2, numPeriods: 1, periodUnit: "month", nextDueOn: "2026-11-01" });
  await jobSpec("s4", "c1", { roundId: monday, price: 900, status: "suspended", numPeriods: 1, periodUnit: "week", nextDueOn: "2026-11-01" });
  // c2, Tuesday: monthly £10 ex VAT.
  await jobSpec("s2", "c2", { roundId: tuesday, price: 1000, vatStatus: "ex_vat", numPeriods: 1, periodUnit: "month", nextDueOn: "2026-11-15" });
  // c3, no round: one-off £20 zero rated.
  await jobSpec("s3", "c3", { price: 2000, vatStatus: "zero_rated", regularity: "one_off" });
  // c4 and c5 only matter for retention.
  await jobSpec("s6", "c4", { roundId: monday, price: 1000, numPeriods: 4, periodUnit: "week", nextDueOn: "2025-10-29" });
  await jobSpec("s7", "c5", { roundId: tuesday, price: 1000, numPeriods: 4, periodUnit: "week", status: "estimate" });

  const j1 = await doneJob("s1", "2026-05-10", 1200, "inc_vat", 0.2); // net 1000
  const j2 = await doneJob("s1", "2026-06-07", 1200, "inc_vat", 0.2); // net 1000
  const j3 = await doneJob("s2", "2026-05-15", 1000, "ex_vat", 0.2); // net 1000, gross 1200
  await doneJob("s3", "2026-06-20", 2000, "zero_rated", 0); // net 2000, never paid
  await doneJob("s6", "2025-10-01", 1000, "inc_vat", 0.2);
  await doneJob("s7", "2025-10-10", 1000, "inc_vat", 0.2);
  await doneJob("s7", "2026-10-01", 1000, "inc_vat", 0.2);
  // A planned (not done) job never counts.
  await db.insert(schema.jobs).values({ accountId, jobSpecId: spec.s1!, date: "2026-07-05", status: "to_do", price: 1200, vatStatus: "inc_vat", vatRate: 0.2 });

  await db.insert(schema.payments).values([
    { accountId, customerId: cust.c1!, jobId: j1, date: "2026-05-10", paid: 1500, tip: 300 },
    { accountId, customerId: cust.c1!, jobId: j2, date: "2026-06-07", paid: 1200, tip: 0 },
    { accountId, customerId: cust.c2!, jobId: j3, date: "2026-05-20", paid: 1200, tip: 0 },
    { accountId, customerId: cust.c1!, date: "2026-06-10", paid: 999, status: "failed" },
  ]);
  await db.insert(schema.adjustments).values([
    { accountId, customerId: cust.c2!, date: "2026-05-21", type: "overpayment", amount: 200 },
    { accountId, customerId: cust.c3!, date: "2026-07-01", type: "bad_debt", amount: 2000 },
    { accountId, customerId: cust.c1!, date: "2026-07-02", type: "discount", amount: 100 },
  ]);

  const [fuel] = await db.insert(schema.expenseCategories).values({ accountId, name: "Fuel" }).returning();
  const [ins] = await db.insert(schema.expenseCategories).values({ accountId, name: "Insurance" }).returning();
  const [van] = await db.insert(schema.expenseCategories).values({ accountId, name: "Van", capitalAsset: true }).returning();
  await db.insert(schema.expenses).values([
    { accountId, categoryId: fuel!.id, date: "2026-05-03", amount: 6000, reclaimableVat: 1000 },
    { accountId, categoryId: ins!.id, date: "2026-07-15", amount: 12000, vatStatus: "exempt", reclaimableVat: null },
    { accountId, categoryId: van!.id, date: "2026-06-01", amount: 500000, reclaimableVat: 0 },
    { accountId, categoryId: fuel!.id, date: "2026-03-01", amount: 4000, reclaimableVat: 0 }, // outside the period
  ]);

  await db.insert(schema.activities).values([
    { accountId, customerId: cust.c1!, date: "2026-06-07", category: "payments", subcategory: "cash", summary: "Payment", amount: 1200 },
    { accountId, customerId: cust.c2!, date: "2026-05-20", category: "payments", subcategory: "card", summary: "Payment", amount: 1200 },
    { accountId, customerId: cust.c3!, date: "2026-07-01", category: "adjustments", subcategory: "bad_debt", summary: "bad debt", amount: 2000 },
    { accountId, customerId: cust.c1!, date: "2026-03-01", category: "jobs", subcategory: "done", summary: "Job done", amount: 1200 },
  ]);
});
afterAll(async () => { await pg.end(); });

describe("tax year", () => {
  it("uses the UK 6 April to 5 April year by default", () => {
    const uk = { yearEndMonth: 4, yearEndDay: 5 };
    expect(taxYear(uk, "2026-10-20")).toEqual({ start: "2026-04-06", end: "2027-04-05" });
    expect(taxYear(uk, "2026-04-05")).toEqual({ start: "2025-04-06", end: "2026-04-05" });
    expect(taxYear(uk, "2026-04-06")).toEqual({ start: "2026-04-06", end: "2027-04-05" });
    expect(taxYear({}, "2027-01-01")).toEqual({ start: "2026-04-06", end: "2027-04-05" });
  });
  it("supports other year ends, clamping 29 February", () => {
    expect(taxYear({ yearEndMonth: 12, yearEndDay: 31 }, "2026-10-20")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(taxYear({ yearEndMonth: 2, yearEndDay: 29 }, "2027-03-01")).toEqual({ start: "2027-03-01", end: "2028-02-29" });
    expect(taxYear({ yearEndMonth: 2, yearEndDay: 29 }, "2027-02-28")).toEqual({ start: "2026-03-01", end: "2027-02-28" });
  });
  it("builds activity windows", () => {
    expect(periodWindow(1, "month", "ending", "2026-10-20")).toEqual({ start: "2026-09-21", end: "2026-10-20" });
    expect(periodWindow(2, "week", "starting", "2026-10-20")).toEqual({ start: "2026-10-20", end: "2026-11-02" });
  });
});

describe("profit and loss", () => {
  it("accrual basis by month", async () => {
    const p = await profitAndLoss(accountId, "2026-05-01", "2026-07-31", "accrual", "month");
    expect(p.columns.map((c) => c.key)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(p.netSales.map((r) => [r.label, r.values])).toEqual([
      ["Monday", [1000, 1000, 0]],
      ["Tuesday", [1000, 0, 0]],
      ["No round", [0, 2000, 0]],
    ]);
    expect(p.netSalesTotal).toMatchObject({ values: [2000, 3000, 0], total: 5000 });
    expect(p.grossIncome[0]).toMatchObject({ values: [2400, 1200, 0], total: 3600 });
    expect(p.grossIncome[1]).toMatchObject({ label: "Tips", values: [500, 0, 0], total: 500 });
    expect(p.badDebt).toMatchObject({ values: [0, 0, 2000], total: 2000 });
    expect(p.expenses.map((r) => [r.label, r.values])).toEqual([["Fuel", [5000, 0, 0]], ["Insurance", [0, 0, 12000]]]);
    expect(p.expensesTotal.total).toBe(17000);
    expect(p.capitalAssets).toEqual([{ label: "Van", values: [0, 500000, 0], total: 500000 }]);
    expect(p.profit).toMatchObject({ values: [-2500, 3000, -14000], total: -13500 });
  });

  it("cash basis by month", async () => {
    const p = await profitAndLoss(accountId, "2026-05-01", "2026-07-31", "cash", "month");
    expect(p.netSales.map((r) => [r.label, r.values])).toEqual([
      ["Monday", [1000, 1000, 0]],
      ["Tuesday", [1000, 0, 0]],
    ]);
    expect(p.netSalesTotal.total).toBe(3000);
    // Bad debt is shown but not deducted on the cash basis.
    expect(p.badDebt.total).toBe(2000);
    expect(p.profit).toMatchObject({ values: [-2500, 1000, -12000], total: -13500 });
  });

  it("accrual basis by round", async () => {
    const p = await profitAndLoss(accountId, "2026-05-01", "2026-07-31", "accrual", "round");
    expect(p.columns.map((c) => c.label)).toEqual(["Monday", "Tuesday", "No round", "Not allocated"]);
    expect(p.netSales).toHaveLength(1);
    expect(p.netSales[0]!.values).toEqual([2000, 1000, 2000, 0]);
    expect(p.grossIncome[1]!.values).toEqual([300, 200, 0, 0]);
    expect(p.badDebt.values).toEqual([0, 0, 2000, 0]);
    expect(p.expensesTotal.values).toEqual([0, 0, 0, 17000]);
    expect(p.profit).toMatchObject({ values: [2300, 1200, 0, -17000], total: -13500 });
  });

  it("exports CSV rows in pounds", async () => {
    const rows = pnlCsvRows(await profitAndLoss(accountId, "2026-05-01", "2026-07-31", "accrual", "month"));
    expect(rows[0]).toEqual(["Section", "Line", "May 2026", "Jun 2026", "Jul 2026", "Total"]);
    expect(rows.at(-1)).toEqual(["Profit", "Profit before tax", "-25.00", "30.00", "-140.00", "-135.00"]);
  });
});

describe("sales summary", () => {
  it("totals done jobs and payments for each period", async () => {
    const s = Object.fromEntries((await salesSummary(accountId, "2026-06-07")).map((l) => [l.key, l]));
    expect(s.today).toMatchObject({ jobs: 1200, payments: 1200, jobCount: 1 });
    expect(s.yesterday).toMatchObject({ jobs: 0, payments: 0 });
    expect(s.this_week).toMatchObject({ start: "2026-06-01", end: "2026-06-07", jobs: 1200 });
    expect(s.last_month).toMatchObject({ start: "2026-05-01", end: "2026-05-31", jobs: 2400, payments: 2700 });
    expect(s.this_month).toMatchObject({ jobs: 3200 });
    expect(s.tax_year).toMatchObject({ start: "2026-04-06", end: "2026-06-07", jobs: 3600, payments: 3900 });
    expect(s.last_tax_year).toMatchObject({ start: "2025-04-06", end: "2025-06-07", jobs: 0 });
  });
});

describe("valuation and forecast", () => {
  it("annualises active regular work per round", async () => {
    const v = await valuation(accountId, "2026-10-20");
    // Monday: 1200 x 13 + 500 x 24 + c4's 1000 x 13; Tuesday: 1000 x 12 (estimate excluded).
    expect(v.rows.map((r) => [r.name, r.customers, r.jobs, r.annualValue])).toEqual([
      ["Monday", 2, 3, 15600 + 12000 + 13000],
      ["Tuesday", 1, 1, 12000],
    ]);
    expect(v.total).toEqual({ customers: 3, jobs: 4, annualValue: 52600 });
    expect((await valuation(accountId, "2024-12-31")).rows).toEqual([]);
  });

  it("projects net income per month per round", async () => {
    const f = await incomeForecast(accountId, "2026-11-01", "2026-12-31");
    expect(f.months.map((m) => m.key)).toEqual(["2026-11", "2026-12"]);
    const monday = f.rows.find((r) => r.name === "Monday")!;
    const tuesday = f.rows.find((r) => r.name === "Tuesday")!;
    // s1: 1 Nov, 29 Nov, 27 Dec at £10 net; s5 every 15 days from 1 Nov at 417 net.
    // c4's spec (£10 inc VAT = 833 net) was due 29 Oct 2025; every 4 weeks lands on 25 Nov and 23 Dec.
    expect(monday.values).toEqual([2000 + 2 * 417 + 833, 1000 + 3 * 417 + 833]);
    // s2: 15 Nov and 15 Dec, ex VAT price is already net.
    expect(tuesday.values).toEqual([1000, 1000]);
    expect(f.total).toBe(monday.total + tuesday.total);
  });
});

describe("customer retention", () => {
  it("counts customers at start, gained, lost and retained", async () => {
    const r = await customerRetention(accountId, "2026-10-20");
    expect(r.start).toBe("2025-10-20");
    // At start: c4 and c5. Gained: c1, c2, c3. Lost: c4 (stopped), c1 and c2 (no job in two cycles).
    expect(r).toMatchObject({ atStart: 2, gained: 3, lost: 3, retained: 1, atEnd: 2, retentionPercent: 50 });
    expect(new Set(r.lostCustomerIds)).toEqual(new Set([cust.c4, cust.c1, cust.c2]));
  });
});

describe("activity", () => {
  it("filters by category, subcategory, search and period", async () => {
    const all = await activity(accountId, { num: 3, unit: "month", mode: "ending", date: "2026-07-31" }, "2026-10-20");
    expect(all.period).toEqual({ start: "2026-05-01", end: "2026-07-31" });
    expect(all.rows).toHaveLength(3);
    const pays = await activity(accountId, { category: "payments", num: 3, unit: "month", mode: "ending", date: "2026-07-31" }, "2026-10-20");
    expect(pays.total).toBe(2400);
    const card = await activity(accountId, { category: "payments", subcategory: "card", num: 1, unit: "year", mode: "starting", date: "2026-01-01" }, "2026-10-20");
    expect(card.rows.map((r) => r.customerName)).toEqual(["Brown"]);
    const search = await activity(accountId, { search: "clark", num: 1, unit: "year", mode: "starting", date: "2026-01-01" }, "2026-10-20");
    expect(search.rows.map((r) => r.category)).toEqual(["adjustments"]);
    expect(all.subcategories).toContainEqual({ category: "payments", subcategory: "card" });
  });

  it("keeps accounts separate", async () => {
    const [other] = await db.insert(schema.accounts).values({ businessName: "Other" }).returning();
    const p = await profitAndLoss(other!.id, "2026-05-01", "2026-07-31", "accrual", "month");
    expect(p.profit.total).toBe(0);
    await db.delete(schema.accounts).where(eq(schema.accounts.id, other!.id));
  });
});
