import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { RolePresets, type Permission } from "@rounds/domain";
import { db, pg, schema } from "@/db";
import { createSession, hashPassword, signup, userForToken, type CurrentUser } from "@/lib/auth";
import { createCustomerWithJob } from "@/lib/services/customers";
import { addJobToDay } from "@/lib/services/planning";
import { PermissionError, sync, type Change } from "@/lib/services/sync";

const TODAY = "2026-10-20";
const run = Date.now().toString(36);
let owner: CurrentUser;
let accountId = "";
let specId = "";
let customerId = "";
let vehicleId = "";
let n = 0;
const cid = () => `test-${run}-${++n}`;

async function userWith(perms: Permission[], name: string): Promise<CurrentUser> {
  const [role] = await db.insert(schema.roles).values({ accountId, name, permissions: perms }).returning();
  const [u] = await db.insert(schema.users).values({
    accountId, email: `${name}-${run}@example.com`, passwordHash: await hashPassword("password123"), name, roleId: role!.id,
  }).returning();
  const { token } = await createSession(u!.id);
  return (await userForToken(token))!;
}

const customerBalance = async (id: string) => (await db.query.customers.findFirst({ where: eq(schema.customers.id, id) }))!.balance;

beforeAll(async () => {
  const { account, user } = await signup({ businessName: "Sync Clean", name: "Sam", email: `sync-${run}@example.com`, password: "password123" });
  accountId = account.id;
  const { token } = await createSession(user.id);
  owner = (await userForToken(token))!;
  const created = await createCustomerWithJob(accountId, user.id,
    { contact: { firstNames: "Ann", lastName: "Smith", address: "1 High St\nTown", phone1: "07700 900000" }, paymentMethod: "on_day" },
    { price: 15, newRoundName: "Monday", firstDueOn: TODAY }, TODAY);
  specId = created.jobSpec.id;
  customerId = created.customer.id;
  const [v] = await db.insert(schema.vehicles).values({ accountId, name: "Van" }).returning();
  vehicleId = v!.id;
});
afterAll(async () => { await pg.end(); });

describe("sync changes", () => {
  it("adds a job offline, completes it by its local id and takes a tip", async () => {
    const add = cid();
    const done = cid();
    const changes: Change[] = [
      { type: "add_job", clientId: add, jobSpecId: specId, date: TODAY },
      { type: "complete_job", clientId: done, jobId: `local:${add}`, input: { status: "done", paid: 2000, includesTip: true, method: "cash" } },
    ];
    const res = await sync(owner, { changes }, TODAY);
    expect(res.results.map((r) => r.ok)).toEqual([true, true]);
    const jobId = res.results[0]!.jobId!;
    expect(res.results[1]!.jobId).toBe(jobId);
    const job = res.snapshot.jobs.find((j) => j.id === jobId);
    expect(job).toMatchObject({ status: "done", paid: true, date: TODAY, customerName: "Ann Smith" });
    expect(await customerBalance(customerId)).toBe(0);
    const pays = await db.select().from(schema.payments).where(eq(schema.payments.jobId, jobId));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ paid: 2000, tip: 500 });

    // Idempotent: replaying the same batch changes nothing and reports the same outcome.
    const again = await sync(owner, { changes }, TODAY);
    expect(again.results).toEqual(res.results);
    expect(await db.select().from(schema.payments).where(eq(schema.payments.jobId, jobId))).toHaveLength(1);
    expect(await db.select().from(schema.jobs).where(eq(schema.jobs.jobSpecId, specId))).toHaveLength(1);
  });

  it("remembers failures by client id", async () => {
    const c = cid();
    const change: Change = { type: "add_job", clientId: c, jobSpecId: specId, date: TODAY };
    const first = await sync(owner, { changes: [change] }, TODAY);
    expect(first.results[0]).toMatchObject({ ok: false, error: "That job is already planned on this date" });
    const second = await sync(owner, { changes: [change] }, TODAY);
    expect(second.results[0]).toEqual(first.results[0]);
  });

  it("moves a job and records a debt payment", async () => {
    const job = await addJobToDay(accountId, owner.id, specId, "2026-10-22", 0);
    // Moved into the past (yesterday was missed), then done there.
    const res = await sync(owner, { changes: [
      { type: "move_job", clientId: cid(), jobId: job.id, date: "2026-10-19" },
      { type: "complete_job", clientId: cid(), jobId: job.id, input: { status: "done" } },
    ] }, TODAY);
    expect(res.results.every((r) => r.ok)).toBe(true);
    // Unpaid -> customer owes £15.
    expect(res.snapshot.jobs.find((j) => j.id === job.id)).toMatchObject({ status: "done", date: "2026-10-19", paid: false });
    expect(res.snapshot.customers.find((c) => c.id === customerId)).toMatchObject({ balance: -1500, debtSince: TODAY, name: "Ann Smith", phone: "07700 900000" });

    const paid = await sync(owner, { changes: [{ type: "payment", clientId: cid(), customerId, paidPence: 1500, method: "cash", reference: "R1" }] }, TODAY);
    expect(paid.results[0]!.ok).toBe(true);
    expect(await customerBalance(customerId)).toBe(0);
  });

  it("refuses to move a finished job", async () => {
    const done = (await db.select().from(schema.jobs).where(and(eq(schema.jobs.jobSpecId, specId), eq(schema.jobs.status, "done"))))[0]!;
    const res = await sync(owner, { changes: [{ type: "move_job", clientId: cid(), jobId: done.id, date: "2026-10-30" }] }, TODAY);
    expect(res.results[0]).toMatchObject({ ok: false, error: "Only jobs still to do can be moved" });
  });

  it("records expenses and mileage", async () => {
    const res = await sync(owner, { changes: [
      { type: "expense", clientId: cid(), date: TODAY, categoryName: "Fuel", amountPence: 6000, vatStatus: "inc_at_rate", method: "card", description: "Diesel" },
      { type: "expense", clientId: cid(), date: TODAY, categoryName: "fuel", amountPence: 1000, vatStatus: "no_vat", method: "cash", description: null },
      { type: "mileage", clientId: cid(), vehicleId, date: TODAY, start: 1000, finish: 1042 },
      { type: "mileage", clientId: cid(), vehicleId, date: TODAY, start: 1042, finish: 1000 },
    ] }, TODAY);
    expect(res.results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(res.results[3]!.error).toMatch(/before the start/);
    const exps = await db.select().from(schema.expenses).where(eq(schema.expenses.accountId, accountId));
    expect(exps).toHaveLength(2);
    expect(new Set(exps.map((e) => e.categoryId)).size).toBe(1);
    expect(exps.find((e) => e.amount === 6000)).toMatchObject({ vatCharged: 1000, description: "Diesel" });
    expect(res.snapshot.expenseCategories.map((c) => c.name)).toEqual(["Fuel"]);
    const miles = await db.select().from(schema.mileages).where(eq(schema.mileages.vehicleId, vehicleId));
    expect(miles).toHaveLength(1);
  });

  it("rejects malformed changes individually", async () => {
    const good = cid();
    const res = await sync(owner, { changes: [
      { type: "teleport", clientId: "bad-change-1" },
      { type: "payment", clientId: "bad-change-2", customerId, paidPence: 100, method: "beans" },
      { type: "payment", clientId: good, customerId, paidPence: 100, method: "cash" },
    ] }, TODAY);
    expect(res.results.map((r) => [r.clientId, r.ok])).toEqual([["bad-change-1", false], ["bad-change-2", false], [good, true]]);
  });
});

describe("permissions", () => {
  it("stops an employee without adjust_prices from changing a price", async () => {
    const perms = [...RolePresets.employee].filter((p) => p !== "adjust_prices");
    const emp = await userWith(perms, "noprice");
    const job = await addJobToDay(accountId, owner.id, specId, "2026-10-18", 0);
    const res = await sync(emp, { changes: [
      { type: "complete_job", clientId: cid(), jobId: job.id, input: { status: "done", price: 2500 } },
      { type: "complete_job", clientId: cid(), jobId: job.id, input: { status: "done", price: 1500, paid: 1500, method: "cash" } },
    ] }, TODAY);
    expect(res.results[0]).toMatchObject({ ok: false, error: "You do not have permission to change prices" });
    expect(res.results[1]!.ok).toBe(true);
    const saved = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) });
    expect(saved).toMatchObject({ price: 1500, status: "done" });
    expect(res.snapshot.settings.permissions).not.toContain("adjust_prices");
  });

  it("gates each change type by its permission", async () => {
    const viewer = await userWith(["access_via_mobile"], "viewer");
    const job = await addJobToDay(accountId, owner.id, specId, "2026-10-25", 0);
    const res = await sync(viewer, { changes: [
      { type: "complete_job", clientId: cid(), jobId: job.id, input: { status: "done" } },
      { type: "add_job", clientId: cid(), jobSpecId: specId, date: "2026-10-26" },
      { type: "move_job", clientId: cid(), jobId: job.id, date: "2026-10-27" },
      { type: "payment", clientId: cid(), customerId, paidPence: 100, method: "cash" },
      { type: "expense", clientId: cid(), date: TODAY, categoryName: "Fuel", amountPence: 100, vatStatus: "no_vat" },
      { type: "mileage", clientId: cid(), vehicleId, date: TODAY, start: 1, finish: 2 },
    ] }, TODAY);
    expect(res.results.every((r) => !r.ok && r.error === "You do not have permission to do that")).toBe(true);
    // No debt list access: debtors are not sent to the device.
    expect(res.snapshot.customers.every((c) => res.snapshot.jobs.some((j) => j.customerId === c.id) || res.snapshot.due.some((d) => d.customerId === c.id))).toBe(true);
  });

  it("requires mobile access", async () => {
    const webOnly = await userWith(["access_via_web", "edit_jobs"], "webonly");
    await expect(sync(webOnly, { changes: [] }, TODAY)).rejects.toBeInstanceOf(PermissionError);
  });

  it("limits staff with assigned rounds to those rounds", async () => {
    const emp = await userWith([...RolePresets.employee], "rounder");
    const other = await createCustomerWithJob(accountId, owner.id, { contact: { lastName: "Tuesday", address: "9 Side St" } }, { price: 12, newRoundName: "Tuesday", firstDueOn: TODAY }, TODAY);
    await db.update(schema.rounds).set({ userId: emp.id }).where(eq(schema.rounds.id, other.jobSpec.roundId!));
    const res = await sync(emp, { changes: [{ type: "add_job", clientId: cid(), jobSpecId: specId, date: "2026-10-28" }] }, TODAY);
    expect(res.results[0]).toMatchObject({ ok: false, error: "That job is not on your rounds" });
    expect(res.snapshot.rounds.map((r) => r.name)).toEqual(["Tuesday"]);
    expect(res.snapshot.due.map((d) => d.jobSpecId)).toEqual([other.jobSpec.id]);
    expect(res.snapshot.jobs).toHaveLength(0);
  });
});

describe("snapshot", () => {
  it("is scoped to the account and carries device settings", async () => {
    const otherAcct = await signup({ businessName: "Rival", name: "Rex", email: `rival-${run}@example.com`, password: "password123" });
    const rival = await createCustomerWithJob(otherAcct.account.id, otherAcct.user.id, { contact: { lastName: "Rivalcust", address: "5 Far Rd" } }, { price: 30, firstDueOn: TODAY }, TODAY);
    await addJobToDay(otherAcct.account.id, otherAcct.user.id, rival.jobSpec.id, TODAY, 0);
    await db.update(schema.accounts).set({ settings: { defaultPaid: "debt_balance" } }).where(eq(schema.accounts.id, accountId));

    const { snapshot, cursor } = await sync(owner, { changes: [] }, TODAY);
    expect(Date.parse(cursor)).toBeGreaterThan(0);
    expect(snapshot.settings).toMatchObject({ businessName: "Sync Clean", userName: "Sam", defaultPaid: "debt_balance", vatRate: 0 });
    expect(snapshot.settings.permissions).toContain("adjust_prices");
    expect(snapshot.window).toEqual({ start: "2026-10-13", end: "2026-11-10" });
    expect(snapshot.vehicles.map((v) => v.name)).toEqual(["Van"]);
    expect(snapshot.rounds.map((r) => r.name)).toEqual(["Monday", "Tuesday"]);
    expect(snapshot.jobs.length).toBeGreaterThan(0);
    expect(snapshot.jobs.every((j) => j.customerName !== "Rivalcust")).toBe(true);
    expect(snapshot.customers.every((c) => c.name !== "Rivalcust")).toBe(true);
    expect(snapshot.due.every((d) => d.customerName !== "Rivalcust")).toBe(true);
    expect(snapshot.jobs.every((j) => j.date >= snapshot.window.start && j.date <= snapshot.window.end)).toBe(true);

    // A change id from another account cannot be replayed into this one.
    const theirs = cid();
    const rivalUser = (await userForToken((await createSession(otherAcct.user.id)).token))!;
    await sync(rivalUser, { changes: [{ type: "payment", clientId: theirs, customerId: rival.customer.id, paidPence: 100, method: "cash" }] }, TODAY);
    const mine = await sync(owner, { changes: [{ type: "payment", clientId: theirs, customerId, paidPence: 100, method: "cash" }] }, TODAY);
    expect(mine.results[0]).toMatchObject({ ok: false, error: "Duplicate change id" });
  });
});
