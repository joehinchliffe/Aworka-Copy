import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { createCustomerWithJob } from "@/lib/services/customers";
import { addJobToDay, completeJob } from "@/lib/services/planning";
import { computeVatReturn, toHmrcBody } from "@/lib/services/vat";
import { fraudHeaders, makeState, readState } from "@/lib/services/hmrc";

let accountId = "", userId = "";
beforeAll(async () => {
  const r = await signup({ businessName: "Vat Co", name: "V", email: `vat${Date.now()}@example.com`, password: "password123" });
  accountId = r.account.id; userId = r.user.id;
  // Two jobs at £60 inc VAT and £50 ex VAT (= £60 gross), done in the quarter, one paid.
  const a = await createCustomerWithJob(accountId, userId, { contact: { lastName: "A", address: "1 St" } }, { price: 60, vatStatus: "inc_vat" }, "2026-07-01");
  const b = await createCustomerWithJob(accountId, userId, { contact: { lastName: "B", address: "2 St" } }, { price: 50, vatStatus: "ex_vat" }, "2026-07-01");
  const j1 = await addJobToDay(accountId, userId, a.jobSpec.id, "2026-07-10", 0.2);
  const j2 = await addJobToDay(accountId, userId, b.jobSpec.id, "2026-08-10", 0.2);
  await completeJob(accountId, userId, j1.id, { status: "done", paid: 6000, method: "cash" }, "2026-07-10");
  await completeJob(accountId, userId, j2.id, { status: "done" }, "2026-08-10");
  const [cat] = await db.insert(schema.expenseCategories).values({ accountId, name: "Fuel" }).returning();
  const [van] = await db.insert(schema.expenseCategories).values({ accountId, name: "Van", capitalAsset: true }).returning();
  await db.insert(schema.expenses).values([
    { accountId, date: "2026-07-15", categoryId: cat!.id, amount: 12000, vatStatus: "inc_at_rate", vatRate: 0.2 }, // £20 VAT
    { accountId, date: "2026-08-15", categoryId: cat!.id, amount: 6000, vatStatus: "inc_charged", vatCharged: 1000, privateUsePercent: 50 }, // £5 reclaim
    { accountId, date: "2026-09-01", categoryId: van!.id, amount: 600000, vatStatus: "inc_at_rate", vatRate: 0.2 }, // £1000 VAT capital
  ]);
});
afterAll(async () => { await pg.end(); });

const reg = { regNo: "123456789", rate: 0.2 } as const;

describe("VAT returns", () => {
  it("standard scheme uses job dates and all purchase VAT", async () => {
    const r = await computeVatReturn(accountId, { ...reg, scheme: "standard" }, "2026-07-01", "2026-09-30");
    expect(r.vatDueSales).toBe(2000); // 1000 + 1000
    expect(r.vatReclaimedCurrPeriod).toBe(2000 + 500 + 100000);
    expect(r.totalValueSalesExVAT).toBe(100);
    expect(r.netVatDue).toBe(Math.abs(2000 - 102500));
    const body = toHmrcBody("26C3", r);
    expect(body.vatDueSales).toBe(20);
    expect(body.finalised).toBe(true);
  });
  it("cash accounting uses payments received", async () => {
    const r = await computeVatReturn(accountId, { ...reg, scheme: "cash_accounting" }, "2026-07-01", "2026-09-30");
    expect(r.vatDueSales).toBe(1000);
  });
  it("flat rate applies the flat percentage and only big capital purchases", async () => {
    const r = await computeVatReturn(accountId, { ...reg, scheme: "flat_rate", flatRate: 0.12 }, "2026-07-01", "2026-09-30");
    expect(r.vatDueSales).toBe(Math.round(12000 * 0.12));
    expect(r.vatReclaimedCurrPeriod).toBe(100000);
    expect(r.totalValueSalesExVAT).toBe(120);
  });
});

describe("HMRC", () => {
  it("signs and verifies OAuth state", () => {
    const s = makeState("acc-1");
    expect(readState(s)).toBe("acc-1");
    expect(readState(s.replace(/.$/, "x"))).toBeNull();
  });
  it("builds fraud-prevention headers", () => {
    const h = fraudHeaders({
      deviceId: "beec798b-b366-47fa-b1f8-92cede14a1ce", userId: "sam@example.com", publicIp: "198.51.100.0",
      publicIpTimestamp: "2026-10-20T10:00:00.000Z", publicPort: "12345", userAgent: "Mozilla/5.0",
      screens: { width: 1920, height: 1080, scalingFactor: 1, colourDepth: 24 }, windowSize: { width: 1256, height: 803 }, timezoneOffsetMinutes: -60,
    }, { publicIp: "203.0.113.6", version: "1.0.0" });
    expect(h["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
    expect(h["Gov-Client-Timezone"]).toBe("UTC+01:00");
    expect(h["Gov-Client-User-IDs"]).toBe("rounds=sam%40example.com");
    expect(h["Gov-Client-Screens"]).toBe("width=1920&height=1080&scaling-factor=1&colour-depth=24");
    expect(h["Gov-Vendor-Forwarded"]).toBe("by=203.0.113.6&for=198.51.100.0");
  });
});
