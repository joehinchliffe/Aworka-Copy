import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pg, schema } from "@/db";
import { signup, login, createSession, userForToken } from "@/lib/auth";
import { createCustomerWithJob, getCustomer, addAdjustment } from "@/lib/services/customers";
import { addJobToDay, completeJob, dueJobs, plannerRange, moveJob, autoMarkStaleJobs } from "@/lib/services/planning";
import { createInvoice, dueDate } from "@/lib/services/invoicing";

const TODAY = "2026-10-20";
let accountId = "";
let userId = "";

beforeAll(async () => {
  await pg`truncate accounts cascade`;
  const { account, user } = await signup({ businessName: "Test Clean", name: "Sam", email: "sam@example.com", password: "password123" });
  accountId = account.id;
  userId = user.id;
});
afterAll(async () => { await pg.end(); });

describe("auth", () => {
  it("logs in and resolves a session", async () => {
    expect(await login("SAM@example.com", "wrong")).toBeNull();
    const u = await login("SAM@example.com", "password123");
    expect(u?.id).toBe(userId);
    const { token } = await createSession(userId);
    const cu = await userForToken(token);
    expect(cu?.businessName).toBe("Test Clean");
    expect(cu?.permissions.has("edit_settings")).toBe(true);
  });
  it("rejects duplicate emails", async () => {
    await expect(signup({ businessName: "x", name: "y", email: "sam@example.com", password: "password123" })).rejects.toThrow();
  });
});

describe("round workflow", () => {
  it("creates a customer, plans, completes, pays and invoices", async () => {
    const { customer, jobSpec } = await createCustomerWithJob(accountId, userId,
      { contact: { firstNames: "Ann", lastName: "Smith", address: "1 High St\nTown", email: "ann@example.com" }, paymentMethod: "on_day" },
      { price: 15, newRoundName: "Monday", numPeriods: 4, periodUnit: "week", firstDueOn: TODAY }, TODAY);
    expect(jobSpec.nextDueOn).toBe(TODAY);

    const due = await dueJobs(accountId, TODAY);
    expect(due.map((d) => d.spec.id)).toContain(jobSpec.id);

    const job = await addJobToDay(accountId, userId, jobSpec.id, TODAY, 0.2);
    expect(job.apptType).toBe("first");
    await expect(addJobToDay(accountId, userId, jobSpec.id, TODAY, 0.2)).rejects.toThrow();

    const range = await plannerRange(accountId, "2026-10-01", "2026-12-31", { showFuture: true });
    expect(range.get(TODAY)?.[0]?.name).toBe("1 High St");
    expect(range.get("2026-11-17")?.[0]?.projected).toBe(true);

    // Done, paid £20 including a £5 tip.
    await completeJob(accountId, userId, job.id, { status: "done", paid: 2000, includesTip: true, method: "cash" }, TODAY);
    let c = await getCustomer(accountId, customer.id);
    expect(c?.customer.balance).toBe(0);
    expect(c?.payments[0]).toMatchObject({ paid: 2000, tip: 500 });
    const spec = await db.query.jobSpecs.findFirst({ where: eq(schema.jobSpecs.id, jobSpec.id) });
    expect(spec?.nextDueOn).toBe("2026-11-17");
    expect(spec?.lastDoneOn).toBe(TODAY);

    // Next visit: done but unpaid -> customer owes £15, debt since today.
    const job2 = await addJobToDay(accountId, userId, jobSpec.id, "2026-11-17", 0.2);
    await completeJob(accountId, userId, job2.id, { status: "done" }, "2026-11-17");
    c = await getCustomer(accountId, customer.id);
    expect(c?.customer.balance).toBe(-1500);
    expect(c?.customer.debtSince).toBe("2026-11-17");

    const invoice = await createInvoice(accountId, customer.id, "2026-11-17");
    expect(invoice?.number).toBe("1");
    expect(invoice?.gross).toBe(3000);
    expect(await createInvoice(accountId, customer.id, "2026-11-17")).toBeNull();

    // Write off the debt.
    await addAdjustment(accountId, userId, customer.id, "bad_debt", 1500, null, "2026-11-18");
    c = await getCustomer(accountId, customer.id);
    expect(c?.customer.balance).toBe(0);
    expect(c?.customer.debtSince).toBeNull();
  });

  it("auto-invoices email customers after each job", async () => {
    const { customer, jobSpec } = await createCustomerWithJob(accountId, userId,
      { contact: { lastName: "Jones", address: "2 Low Rd", email: "j@example.com" }, paymentMethod: "email_invoice", invoiceFrequency: "after_each_job", paymentTermsType: "net_from_invoice_date", paymentTermsDays: 14 },
      { price: 20 }, TODAY);
    const job = await addJobToDay(accountId, userId, jobSpec.id, TODAY, 0.2);
    await completeJob(accountId, userId, job.id, { status: "done" }, TODAY);
    const c = await getCustomer(accountId, customer.id);
    expect(c?.invoices).toHaveLength(1);
    expect(c?.invoices[0]?.dueOn).toBe("2026-11-03");
    const msgs = await db.select().from(schema.messages).where(eq(schema.messages.customerId, customer.id));
    expect(msgs[0]?.reason).toBe("invoice");
  });

  it("moves jobs and auto-marks stale ones as not done", async () => {
    const { jobSpec } = await createCustomerWithJob(accountId, userId,
      { contact: { lastName: "Old", address: "3 Lane" } }, { price: 10 }, "2026-09-01");
    const job = await addJobToDay(accountId, userId, jobSpec.id, "2026-09-01", 0.2);
    await moveJob(accountId, job.id, "2026-09-02");
    expect(await autoMarkStaleJobs(accountId, TODAY)).toBeGreaterThanOrEqual(1);
    const j = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) });
    expect(j?.status).toBe("not_done");
  });
});

describe("payment terms", () => {
  it("computes due dates", () => {
    expect(dueDate("2026-10-20", "net_from_month_end", 7)).toBe("2026-11-07");
    expect(dueDate("2026-10-20", "by_return", 0)).toBe("2026-10-20");
    expect(dueDate("2026-10-20", "not_required", 0)).toBeNull();
  });
});
