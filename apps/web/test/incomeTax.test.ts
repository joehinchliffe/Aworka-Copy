import { afterAll, describe, expect, it } from "vitest";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { createCustomerWithJob } from "@/lib/services/customers";
import { addJobToDay, completeJob } from "@/lib/services/planning";
import { cumulativeSummary, guessHmrcCategory, taxYearLabel } from "@/lib/services/incomeTax";

afterAll(async () => { await pg.end(); });

describe("MTD income tax", () => {
  it("labels tax years and guesses categories", () => {
    expect(taxYearLabel("2026-04-05")).toBe("2025-26");
    expect(taxYearLabel("2026-04-06")).toBe("2026-27");
    expect(guessHmrcCategory("Van fuel")).toBe("carVanTravelExpenses");
    expect(guessHmrcCategory("Water fed pole repairs")).toBe("maintenanceCosts");
    expect(guessHmrcCategory("Leaflets")).toBe("advertisingCosts");
  });

  it("builds cumulative summaries on cash and accrual bases", async () => {
    const { account, user } = await signup({ businessName: "Tax Co", name: "T", email: `tax${Date.now()}@example.com`, password: "password123" });
    const { jobSpec } = await createCustomerWithJob(account.id, user.id, { contact: { lastName: "T", address: "1 T St" } }, { price: 25 }, "2026-05-01");
    const a = await addJobToDay(account.id, user.id, jobSpec.id, "2026-05-01", 0);
    await completeJob(account.id, user.id, a.id, { status: "done", paid: 2500 }, "2026-05-01");
    const b = await addJobToDay(account.id, user.id, jobSpec.id, "2026-06-01", 0);
    await completeJob(account.id, user.id, b.id, { status: "done" }, "2026-06-01");
    const [fuel] = await db.insert(schema.expenseCategories).values({ accountId: account.id, name: "Fuel" }).returning();
    const [kit] = await db.insert(schema.expenseCategories).values({ accountId: account.id, name: "Ladders", capitalAsset: true }).returning();
    await db.insert(schema.expenses).values([
      { accountId: account.id, date: "2026-05-10", categoryId: fuel!.id, amount: 10000, privateUsePercent: 20 },
      { accountId: account.id, date: "2026-05-11", categoryId: kit!.id, amount: 50000 },
    ]);
    const accrual = await cumulativeSummary(account.id, "2026-04-06", "2026-07-05", { basis: "accrual" });
    expect(accrual.periodIncome.turnover).toBe(50);
    expect(accrual.periodExpenses).toEqual({ carVanTravelExpenses: 80 });
    const cash = await cumulativeSummary(account.id, "2026-04-06", "2026-07-05", { basis: "cash", consolidated: true });
    expect(cash.periodIncome.turnover).toBe(25);
    expect(cash.periodExpensesConsolidated).toBe(80);
    expect(cash.periodExpenses).toBeUndefined();
  });
});
