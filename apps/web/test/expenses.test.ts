import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// vitest.config.ts sets a shared DATABASE_URL; EXPENSES_TEST_DATABASE_URL lets
// this file run against its own database. It must be set before "@/db" loads.
vi.hoisted(() => {
  if (process.env.EXPENSES_TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.EXPENSES_TEST_DATABASE_URL;
});

import { and, eq } from "drizzle-orm";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { ValidationError } from "@/lib/services/customers";
import {
  computeExpenseTax, createCategory, createExpense, createMileage, createRecurring, createSupplier, createVehicle,
  deleteCategory, deleteExpense, duplicateLastExpense, generateDueRecurringExpenses, getExpense, listExpenses,
  listMileages, listSuppliers, mileageValue, periodRange, recurringActive, suggestedStart, taxTreatmentOf,
  updateExpense, updateRecurring, updateSupplier, validateExpense,
} from "@/lib/services/expenses";

const TODAY = "2026-10-20";
let accountId = "";
let userId = "";

beforeAll(async () => {
  const email = `expenses-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { account, user } = await signup({ businessName: "Expense Test", name: "Pat", email, password: "password123" });
  accountId = account.id;
  userId = user.id;
});
afterAll(async () => {
  if (accountId) await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
  await pg.end();
});

async function expectErrors(p: Promise<unknown>, match: RegExp) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  expect((err as ValidationError).errors.join("; ")).toMatch(match);
}

describe("expense VAT and allowable calculations", () => {
  it("extracts VAT included at a rate", () => {
    expect(computeExpenseTax({ amount: 12000, vatStatus: "inc_at_rate", vatRate: 0.2 })).toEqual({ vat: 2000, reclaimableVat: 2000, allowable: 12000 });
    expect(computeExpenseTax({ amount: 1050, vatStatus: "inc_at_rate", vatRate: 0.05 }).vat).toBe(50);
  });
  it("uses the VAT charged amount", () => {
    expect(computeExpenseTax({ amount: 5000, vatStatus: "inc_charged", vatRate: 0.2, vatCharged: 437 })).toMatchObject({ vat: 437, reclaimableVat: 437 });
  });
  it("has no VAT for zero rated, exempt and out of scope", () => {
    for (const s of ["zero_rate", "exempt", "out_of_scope"]) {
      expect(computeExpenseTax({ amount: 5000, vatStatus: s, vatRate: 0.2 })).toEqual({ vat: 0, reclaimableVat: 0, allowable: 5000 });
    }
  });
  it("reduces reclaimable VAT and allowable amount by private use", () => {
    expect(computeExpenseTax({ amount: 12000, vatStatus: "inc_at_rate", vatRate: 0.2, privateUsePercent: 25 }))
      .toEqual({ vat: 2000, reclaimableVat: 1500, allowable: 9000 });
  });
  it("excludes reclaimed VAT from the allowable amount when the business reclaims VAT", () => {
    expect(computeExpenseTax({ amount: 12000, vatStatus: "inc_at_rate", vatRate: 0.2, privateUsePercent: 25, reclaimsVat: true }).allowable).toBe(7500);
  });
  it("respects a custom allowable amount", () => {
    expect(computeExpenseTax({ amount: 12000, vatStatus: "inc_at_rate", vatRate: 0.2, allowableOverride: 3000 }).allowable).toBe(3000);
  });
  it("leaves everything blank when the amount is to be added later", () => {
    expect(computeExpenseTax({ amount: null, vatStatus: "inc_at_rate", vatRate: 0.2 })).toEqual({ vat: null, reclaimableVat: null, allowable: null });
  });
  it("recovers the tax treatment from stored values", () => {
    const base = { amount: 10000, vatStatus: "zero_rate", vatRate: 0.2, vatCharged: null };
    expect(taxTreatmentOf({ ...base, privateUsePercent: null, allowable: 10000 })).toBe("all_business");
    expect(taxTreatmentOf({ ...base, privateUsePercent: 40, allowable: 6000 })).toBe("private_use");
    expect(taxTreatmentOf({ ...base, privateUsePercent: null, allowable: 2500 })).toBe("custom");
  });
});

describe("expense validation", () => {
  const ok = { date: TODAY, categoryId: "x", amount: 1000, vatStatus: "inc_at_rate", vatRate: 0.2 };
  it("accepts a blank amount to be added later", () => {
    expect(validateExpense({ ...ok, amount: null })).toEqual([]);
  });
  it("requires a category", () => {
    expect(validateExpense({ ...ok, categoryId: null })).toContain("Choose or enter a category");
    expect(validateExpense({ ...ok, categoryId: null, newCategoryName: "Fuel" })).toEqual([]);
  });
  it("requires a positive VAT rate when VAT is included at a rate", () => {
    expect(validateExpense({ ...ok, vatRate: 0 }).join()).toMatch(/rate must be more than 0/);
    expect(validateExpense({ ...ok, vatStatus: "zero_rate", vatRate: 0 })).toEqual([]);
  });
  it("requires VAT charged above zero and at most half the amount", () => {
    const charged = { ...ok, vatStatus: "inc_charged" };
    expect(validateExpense({ ...charged, vatCharged: 0 }).join()).toMatch(/more than 0/);
    expect(validateExpense({ ...charged, vatCharged: null }).join()).toMatch(/more than 0/);
    expect(validateExpense({ ...charged, vatCharged: 501 }).join()).toMatch(/half the amount/);
    expect(validateExpense({ ...charged, vatCharged: 500 })).toEqual([]);
  });
  it("checks private use and custom amounts", () => {
    expect(validateExpense({ ...ok, privateUsePercent: 120 }).join()).toMatch(/between 0% and 100%/);
    expect(validateExpense({ ...ok, taxTreatment: "private_use", privateUsePercent: null }).join()).toMatch(/private use percentage/);
    expect(validateExpense({ ...ok, taxTreatment: "custom", allowableOverride: null }).join()).toMatch(/allowable/);
  });
});

describe("periods and mileage", () => {
  it("turns N units starting or ending on a date into a range", () => {
    expect(periodRange({ num: 1, unit: "month", anchor: "starting", date: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange({ num: 2, unit: "week", anchor: "ending", date: "2026-10-20" })).toEqual({ from: "2026-10-07", to: "2026-10-20" });
    expect(periodRange({ num: 1, unit: "year", anchor: "starting", date: "2026-04-06" })).toEqual({ from: "2026-04-06", to: "2027-04-05" });
  });
  it("values a trip at the rate per mile and marks unfinished trips pending", () => {
    expect(mileageValue({ start: 1000, finish: 1042 }, 45)).toEqual({ miles: 42, value: 1890, pending: false });
    expect(mileageValue({ start: 1000, finish: null }, 45)).toEqual({ miles: null, value: null, pending: true });
  });
});

describe("expenses service", () => {
  it("creates expenses with inline category and supplier and stores computed tax", async () => {
    const e = await createExpense(accountId, userId, {
      date: TODAY, newCategoryName: "Fuel", newSupplierName: "Garage Ltd", amount: 6000,
      vatStatus: "inc_at_rate", vatRate: 0.2, method: "debit_card", taxTreatment: "private_use", privateUsePercent: 10,
    });
    expect(e).toMatchObject({ amount: 6000, reclaimableVat: 900, allowable: 5400, privateUsePercent: 10 });
    // Same names reuse the existing records, case-insensitively.
    const e2 = await createExpense(accountId, userId, { date: "2026-10-01", newCategoryName: "fuel", newSupplierName: "GARAGE LTD", amount: null });
    expect(e2.categoryId).toBe(e.categoryId);
    expect(e2.supplierId).toBe(e.supplierId);
    expect(e2).toMatchObject({ amount: null, reclaimableVat: null, allowable: null });
  });

  it("rejects invalid expenses", async () => {
    await expectErrors(createExpense(accountId, userId, { date: TODAY, newCategoryName: "Fuel", amount: 1000, vatStatus: "inc_charged", vatCharged: 600 }), /half the amount/);
    await expectErrors(createExpense(accountId, userId, { date: TODAY, amount: 1000 }), /category/);
  });

  it("updates, filters, totals and deletes", async () => {
    const insurance = await createCategory(accountId, { name: "Insurance" });
    const ins = await createExpense(accountId, userId, { date: "2026-09-15", categoryId: insurance.id, amount: 30000, vatStatus: "exempt", method: "direct_debit" });
    const updated = await updateExpense(accountId, userId, ins.id, { date: "2026-09-15", categoryId: insurance.id, amount: 32000, vatStatus: "exempt", method: "direct_debit", taxTreatment: "custom", allowableOverride: 16000 });
    expect(updated.allowable).toBe(16000);
    expect((await getExpense(accountId, ins.id))?.taxTreatment).toBe("custom");

    const byCat = await listExpenses(accountId, { categoryId: insurance.id });
    expect(byCat.rows).toHaveLength(1);
    expect(byCat.totals.amount).toBe(32000);

    const october = await listExpenses(accountId, periodRange({ num: 1, unit: "month", anchor: "starting", date: "2026-10-01" }));
    expect(october.rows.every((r) => r.expense.date >= "2026-10-01")).toBe(true);
    expect(october.totals.amountNotSet).toBe(1);
    expect((await listExpenses(accountId, { amountNotSet: true })).rows).toHaveLength(1);
    expect((await listExpenses(accountId, { method: "direct_debit" })).rows).toHaveLength(1);

    await expectErrors(deleteCategory(accountId, insurance.id), /disable it instead/);
    await deleteExpense(accountId, userId, ins.id, TODAY);
    expect(await getExpense(accountId, ins.id)).toBeNull();
    await deleteCategory(accountId, insurance.id);
  });

  it("duplicates the last expense in a category", async () => {
    const phone = await createCategory(accountId, { name: "Phone" });
    expect(await duplicateLastExpense(accountId, userId, phone.id, TODAY)).toBeNull();
    await createExpense(accountId, userId, { date: "2026-08-01", categoryId: phone.id, amount: 1200, description: "Old" });
    await createExpense(accountId, userId, { date: "2026-09-01", categoryId: phone.id, amount: 1500, description: "Mobile", vatStatus: "inc_at_rate", vatRate: 0.2 });
    const dup = await duplicateLastExpense(accountId, userId, phone.id, "2026-10-01");
    expect(dup).toMatchObject({ date: "2026-10-01", amount: 1500, description: "Mobile", reclaimableVat: 250 });
  });

  it("flags suppliers from another EC state", async () => {
    const s = await createSupplier(accountId, { name: "Euro Parts", otherEcState: true });
    expect((await listSuppliers(accountId)).find((x) => x.id === s.id)?.otherEcState).toBe(true);
    await updateSupplier(accountId, s.id, { name: "Euro Parts", enabled: false, otherEcState: false });
    const after = (await listSuppliers(accountId)).find((x) => x.id === s.id);
    expect(after).toMatchObject({ otherEcState: false, enabled: false });
    await expectErrors(createSupplier(accountId, { name: "euro parts" }), /already exists/);
  });
});

describe("recurring expenses", () => {
  const generatedFor = (id: string) => db.select().from(schema.expenses)
    .where(and(eq(schema.expenses.accountId, accountId), eq(schema.expenses.recurringExpenseId, id)))
    .orderBy(schema.expenses.date);

  it("catches up overdue instances on save, links them and advances next due", async () => {
    const { recurring, generated } = await createRecurring(accountId, userId, {
      newCategoryName: "Software", description: "Round app", amount: 1200, vatStatus: "inc_at_rate", vatRate: 0.2,
      everyNum: 1, everyUnit: "month", nextDueOn: "2026-07-20", schedule: "forever",
    }, TODAY);
    expect(generated).toBe(4); // 20 Jul, Aug, Sep, Oct
    const rows = await generatedFor(recurring.id);
    expect(rows.map((r) => r.date)).toEqual(["2026-07-20", "2026-08-20", "2026-09-20", "2026-10-20"]);
    expect(rows[0]).toMatchObject({ amount: 1200, reclaimableVat: 200, allowable: 1200, description: "Round app" });
    const r = await db.query.recurringExpenses.findFirst({ where: eq(schema.recurringExpenses.id, recurring.id) });
    expect(r?.nextDueOn).toBe("2026-11-20");
  });

  it("never duplicates when run again or concurrently", async () => {
    const { recurring } = await createRecurring(accountId, userId, {
      newCategoryName: "Water", amount: 500, vatStatus: "zero_rate", everyNum: 1, everyUnit: "week", nextDueOn: "2026-10-01",
    }, "2026-09-30");
    expect(await generatedFor(recurring.id)).toHaveLength(0);
    const runs = await Promise.all([
      generateDueRecurringExpenses(accountId, TODAY), generateDueRecurringExpenses(accountId, TODAY), generateDueRecurringExpenses(accountId, TODAY),
    ]);
    const rows = await generatedFor(recurring.id);
    expect(rows.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
    expect(runs.reduce((a, b) => a + b, 0)).toBe(3);
    expect(await generateDueRecurringExpenses(accountId, TODAY)).toBe(0);
    // Next day nothing new; a week on, exactly one more.
    expect(await generateDueRecurringExpenses(accountId, "2026-10-21")).toBe(0);
    expect(await generateDueRecurringExpenses(accountId, "2026-10-22")).toBe(1);
  });

  it("edits never duplicate or rewrite generated expenses", async () => {
    const { recurring } = await createRecurring(accountId, userId, {
      newCategoryName: "Rent", amount: 10000, vatStatus: "exempt", everyNum: 1, everyUnit: "month", nextDueOn: "2026-09-01",
    }, TODAY);
    const before = await generatedFor(recurring.id);
    expect(before.map((r) => r.date)).toEqual(["2026-09-01", "2026-10-01"]);
    // Move next due back to an already-generated date and change the amount.
    const n = await updateRecurring(accountId, userId, recurring.id, {
      categoryId: recurring.categoryId, amount: 11000, vatStatus: "exempt", everyNum: 1, everyUnit: "month", nextDueOn: "2026-10-01",
    }, TODAY);
    expect(n).toBe(0);
    const after = await generatedFor(recurring.id);
    expect(after.map((r) => [r.date, r.amount])).toEqual([["2026-09-01", 10000], ["2026-10-01", 10000]]);
    const r = await db.query.recurringExpenses.findFirst({ where: eq(schema.recurringExpenses.id, recurring.id) });
    expect(r?.nextDueOn).toBe("2026-11-01");
    expect(await generateDueRecurringExpenses(accountId, "2026-11-01")).toBeGreaterThanOrEqual(1);
    expect((await generatedFor(recurring.id)).at(-1)).toMatchObject({ date: "2026-11-01", amount: 11000 });
  });

  it("stops after N payments", async () => {
    const { recurring, generated } = await createRecurring(accountId, userId, {
      newCategoryName: "Loan", amount: 2500, vatStatus: "out_of_scope", everyNum: 2, everyUnit: "week", nextDueOn: "2026-08-01", schedule: "count", count: 3,
    }, TODAY);
    expect(generated).toBe(3);
    expect((await generatedFor(recurring.id)).map((r) => r.date)).toEqual(["2026-08-01", "2026-08-15", "2026-08-29"]);
    const r = await db.query.recurringExpenses.findFirst({ where: eq(schema.recurringExpenses.id, recurring.id) });
    expect(r?.remainingCount).toBe(0);
    expect(recurringActive(r!)).toBe(false);
  });

  it("stops at a date", async () => {
    const { recurring, generated } = await createRecurring(accountId, userId, {
      newCategoryName: "Hire", amount: 1000, vatStatus: "zero_rate", everyNum: 10, everyUnit: "day", nextDueOn: "2026-09-01", schedule: "until_date", endOn: "2026-09-25",
    }, TODAY);
    expect(generated).toBe(3);
    expect((await generatedFor(recurring.id)).map((r) => r.date)).toEqual(["2026-09-01", "2026-09-11", "2026-09-21"]);
  });

  it("stops at a total, with a final part payment", async () => {
    const { recurring } = await createRecurring(accountId, userId, {
      newCategoryName: "Ladder finance", amount: 4000, vatStatus: "zero_rate", everyNum: 1, everyUnit: "month", nextDueOn: "2026-06-01", schedule: "until_total", totalLimit: 10000,
    }, TODAY);
    const rows = await generatedFor(recurring.id);
    expect(rows.map((r) => r.amount)).toEqual([4000, 4000, 2000]);
    const r = await db.query.recurringExpenses.findFirst({ where: eq(schema.recurringExpenses.id, recurring.id) });
    expect(r?.totalSoFar).toBe(10000);
  });

  it("validates schedules", async () => {
    await expectErrors(createRecurring(accountId, userId, { newCategoryName: "X", amount: 100, everyNum: 1, nextDueOn: TODAY, schedule: "count" }, TODAY), /how many payments/);
    await expectErrors(createRecurring(accountId, userId, { newCategoryName: "X", amount: null, everyNum: 1, nextDueOn: TODAY, schedule: "until_total", totalLimit: 500 }, TODAY), /amount is needed/);
    await expectErrors(createRecurring(accountId, userId, { newCategoryName: "X", amount: 100, everyNum: 0, nextDueOn: TODAY }, TODAY), /at least 1/);
  });
});

describe("vehicles and mileage", () => {
  it("logs trips and totals miles and value", async () => {
    const van = await createVehicle(accountId, { name: "Van", registration: "AB12 CDE", startMileage: 50000, ratePerMile: 45 });
    expect(await suggestedStart(accountId, van.id)).toBe(50000);
    await createMileage(accountId, { vehicleId: van.id, date: "2026-10-19", start: 50000, finish: 50030 });
    await createMileage(accountId, { vehicleId: van.id, date: TODAY, start: 50030, finish: null });
    expect(await suggestedStart(accountId, van.id)).toBe(50030);
    await expectErrors(createMileage(accountId, { vehicleId: van.id, date: TODAY, start: 100, finish: 50 }), /cannot be less/);
    const { trips, totals } = await listMileages(accountId, { vehicleId: van.id });
    expect(trips).toHaveLength(2);
    expect(totals).toEqual({ miles: 30, value: 1350, pending: 1 });
  });
});
