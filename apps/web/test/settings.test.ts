import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { RolePresets, type Permission } from "@rounds/domain";
import { db, pg, schema } from "@/db";
import { login, signup } from "@/lib/auth";
import { createCustomerWithJob } from "@/lib/services/customers";
import { PermissionError, type Actor } from "@/lib/services/access";
import { applyRevision, latestRevisionByJob, previewRevision, revertJob, revertRevision, revisionForm, type RevisionRequest } from "@/lib/services/priceRevisions";
import { createTask, updateTask } from "@/lib/services/tasks";
import { createRound, listRounds, roundJobs, setRoundOrder } from "@/lib/services/rounds";
import { runRetention } from "@/lib/services/retention";
import { changePassword, getAccount, updatePlanner, updateRetention } from "@/lib/services/settings";
import { assignRounds, createRole, createUser, removeUser, updateRole } from "@/lib/services/users";
import { createSalesSource } from "@/lib/services/salesSources";

const TODAY = "2026-10-20";
let owner: Actor;

const spec = (id: string) => db.query.jobSpecs.findFirst({ where: eq(schema.jobSpecs.id, id) });

async function newJob(name: string, price: number, extra: Record<string, unknown> = {}) {
  const { customer, jobSpec } = await createCustomerWithJob(owner.accountId, owner.id,
    { contact: { lastName: name, address: `${name} House\nTown` } },
    { price, firstDueOn: TODAY, ...extra }, TODAY);
  return { customer, jobSpec };
}

const req = (rule: Partial<RevisionRequest["rule"]>, f: Partial<RevisionRequest> = {}): RevisionRequest => ({
  roundId: null, priceMin: null, priceMax: null, changedOnOrBefore: null,
  rule: { kind: "percentage", amount: 0.1, roundTo: 50, minimumChange: 100, ...rule }, ...f,
});

beforeAll(async () => {
  await pg`truncate accounts cascade`;
  const { account, user } = await signup({ businessName: "Settings Clean", name: "Olive", email: "olive@example.com", password: "password123" });
  owner = { id: user.id, accountId: account.id, isOwner: true, permissions: new Set(RolePresets.owner) };
});
afterAll(async () => { await pg.end(); });

describe("price revisions", () => {
  it("previews from form input in pounds and percent", () => {
    const r = revisionForm.parse({ roundId: "all", kind: "percentage", percentage: "3%", roundTo: "0.50", minimumChange: "1.00", priceMin: "", priceMax: "20" });
    expect(r).toEqual({ roundId: null, priceMin: null, priceMax: 2000, changedOnOrBefore: null, rule: { kind: "percentage", amount: 0.03, roundTo: 50, minimumChange: 100 } });
  });

  it("applies with round filter, task exclusion and minimum change, then reverts", async () => {
    const round = await createRound(owner, { name: "Tuesday" });
    const task = await createTask(owner, { name: "Gutters", price: "40" });
    const a = (await newJob("Alpha", 20, { roundId: round.id })).jobSpec; // +10% = 22.00
    const b = (await newJob("Bravo", 5, { roundId: round.id })).jobSpec; // +10% = 5.50, below £1 minimum
    const c = (await newJob("Charlie", 40, { roundId: round.id, taskId: task.id })).jobSpec; // on a task: excluded
    const d = (await newJob("Delta", 30)).jobSpec; // other round: excluded

    const preview = await previewRevision(owner.accountId, req({}, { roundId: round.id }));
    expect(preview.items.map((i) => [i.jobSpecId, i.from, i.to])).toEqual([[a.id, 2000, 2200]]);
    expect(preview.onTask).toBe(1);
    expect(preview.unchanged).toBe(1);

    const rev = await applyRevision(owner, req({}, { roundId: round.id }), TODAY);
    expect(rev.changes).toEqual([{ jobSpecId: a.id, from: 2000, to: 2200 }]);
    expect(rev.description).toContain("Tuesday");
    expect((await spec(a.id))?.price).toBe(2200);
    expect((await spec(a.id))?.priceChangedOn).toBe(TODAY);
    expect((await spec(b.id))?.price).toBe(500);
    expect((await spec(c.id))?.price).toBe(4000);
    expect((await spec(d.id))?.price).toBe(3000);

    // A second, fixed revision on all rounds priced up to £25 (A at £22, B at £5).
    const rev2 = await applyRevision(owner, req({ kind: "fixed", amount: 150 }, { priceMax: 2500 }), "2026-10-21");
    expect(rev2.changes.map((x) => x.jobSpecId).sort()).toEqual([a.id, b.id].sort());
    expect((await spec(a.id))?.price).toBe(2350);
    expect((await spec(b.id))?.price).toBe(650);

    expect(Object.fromEntries(await latestRevisionByJob(owner.accountId, [a.id, b.id, c.id]))).toEqual({ [a.id]: rev2.id, [b.id]: rev2.id });

    // Reverting A undoes its most recent revision first, then the earlier one.
    await revertJob(owner, a.id, TODAY);
    expect((await spec(a.id))?.price).toBe(2200);
    expect((await spec(a.id))?.priceChangedOn).toBe(TODAY);
    await revertJob(owner, a.id, TODAY);
    expect((await spec(a.id))?.price).toBe(2000);
    expect((await spec(a.id))?.priceChangedOn).toBeNull();
    await expect(revertJob(owner, a.id, TODAY)).rejects.toThrow(/no price revision/);
    const first = await db.query.priceRevisions.findFirst({ where: eq(schema.priceRevisions.id, rev.id) });
    expect(first?.revertedAt).not.toBeNull();

    // Revert the rest of the second revision as a whole.
    expect(await revertRevision(owner, rev2.id, TODAY)).toEqual({ reverted: 1, skipped: 0 });
    expect((await spec(b.id))?.price).toBe(500);
  });

  it("refuses a revision that changes nothing", async () => {
    await expect(applyRevision(owner, req({ amount: 0.001 }), TODAY)).rejects.toThrow(/No job prices/);
  });
});

describe("tasks", () => {
  it("propagates a task's price to every job using it", async () => {
    const task = await createTask(owner, { name: "Conservatory roof", price: "60", timeRequired: "45" });
    const j1 = (await newJob("Echo", 60, { taskId: task.id })).jobSpec;
    const j2 = (await newJob("Foxtrot", 55, { taskId: task.id })).jobSpec;
    const other = (await newJob("Golf", 60)).jobSpec;
    const changed = await updateTask(owner, task.id, { name: "Conservatory roof", price: "65", timeRequired: "50" }, TODAY);
    expect(changed).toBe(2);
    expect((await spec(j1.id))).toMatchObject({ price: 6500, timeRequired: 50, priceChangedOn: TODAY });
    expect((await spec(j2.id))?.price).toBe(6500);
    expect((await spec(other.id))?.price).toBe(6000);
  });
});

describe("rounds", () => {
  it("lists job count and value and stores a new order", async () => {
    const round = await createRound(owner, { name: "Wednesday", otherIncome: "on" });
    const x = (await newJob("Hotel", 10, { roundId: round.id })).jobSpec;
    const y = (await newJob("India", 12, { roundId: round.id })).jobSpec;
    const row = (await listRounds(owner.accountId)).find((r) => r.round.id === round.id);
    expect(row).toMatchObject({ jobs: 2, value: 2200 });
    expect(row?.round.otherIncome).toBe(true);
    await setRoundOrder(owner, round.id, [y.id, x.id]);
    expect((await roundJobs(owner.accountId, round.id)).map((j) => j.spec.id)).toEqual([y.id, x.id]);
  });
});

describe("retention", () => {
  it("does nothing while rules are off", async () => {
    const r = await runRetention(owner.accountId, TODAY);
    expect(Object.values(r).every((n) => n === 0)).toBe(true);
  });

  it("applies the six rules", async () => {
    const overdue = (await newJob("Juliet", 10, { firstDueOn: "2026-06-01" })).jobSpec;
    const recent = (await newJob("Kilo", 10, { firstDueOn: "2026-10-01" })).jobSpec;
    const onRequest = (await newJob("Lima", 10, { regularity: "on_request" })).jobSpec;
    await db.update(schema.jobSpecs).set({ createdAt: new Date("2025-06-01T12:00:00Z") }).where(eq(schema.jobSpecs.id, onRequest.id));
    const longSuspended = (await newJob("Mike", 10)).jobSpec;
    await db.update(schema.jobSpecs).set({ status: "suspended", updatedAt: new Date("2026-05-01T12:00:00Z") }).where(eq(schema.jobSpecs.id, longSuspended.id));
    const oneOff = (await newJob("November", 10, { regularity: "one_off" })).jobSpec;
    await db.update(schema.jobSpecs).set({ nextDueOn: null, lastDoneOn: "2026-06-01" }).where(eq(schema.jobSpecs.id, oneOff.id));
    const estimate = (await newJob("Oscar", 10, { estimate: true })).jobSpec;
    await db.update(schema.jobSpecs).set({ createdAt: new Date("2026-01-01T12:00:00Z") }).where(eq(schema.jobSpecs.id, estimate.id));
    const freshEstimate = (await newJob("Papa", 10, { estimate: true })).jobSpec;

    const gone = await newJob("Quebec", 10);
    await db.update(schema.jobSpecs).set({ status: "deleted", updatedAt: new Date("2026-01-01T12:00:00Z") }).where(eq(schema.jobSpecs.id, gone.jobSpec.id));
    const goneInDebt = await newJob("Romeo", 10);
    await db.update(schema.jobSpecs).set({ status: "deleted", updatedAt: new Date("2026-01-01T12:00:00Z") }).where(eq(schema.jobSpecs.id, goneInDebt.jobSpec.id));
    await db.update(schema.customers).set({ balance: -1000 }).where(eq(schema.customers.id, goneInDebt.customer.id));

    const [oldInvoice] = await db.insert(schema.invoices).values({
      accountId: owner.accountId, customerId: gone.customer.id, number: "OLD1", issuedOn: "2019-01-01", viewToken: "oldtoken",
      notes: "Thanks Mr Quebec", lines: [{ date: "2019-01-01", description: "Quebec House windows", net: 1000, vat: 0, gross: 1000 }],
    }).returning();

    const on = (num: number, unit: "week" | "month" | "year") => ({ enabled: "on" as const, num, unit });
    await updateRetention(owner, {
      suspendRegular: on(3, "month"), suspendOnRequest: on(1, "year"), deleteSuspended: on(3, "month"),
      deleteEstimates: on(6, "month"), anonymiseDeleted: on(3, "month"), anonymiseInvoices: on(6, "year"),
    });
    expect((await getAccount(owner.accountId)).settings.retention?.deleteEstimates).toEqual({ enabled: true, num: 6, unit: "month" });

    const r = await runRetention(owner.accountId, TODAY);
    expect((await spec(overdue.id))?.status).toBe("suspended");
    expect((await spec(recent.id))?.status).toBe("active");
    expect((await spec(onRequest.id))?.status).toBe("suspended");
    expect((await spec(longSuspended.id))?.status).toBe("deleted");
    expect((await spec(oneOff.id))?.status).toBe("deleted");
    expect((await spec(estimate.id))?.status).toBe("deleted");
    expect((await spec(freshEstimate.id))?.status).toBe("estimate");
    expect(r).toMatchObject({ suspendedRegular: 1, suspendedOnRequest: 1, deletedJobs: 2, deletedEstimates: 1, anonymisedCustomers: 1, anonymisedInvoices: 1 });

    const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, gone.customer.id) });
    expect(c?.anonymisedAt).not.toBeNull();
    const debtor = await db.query.customers.findFirst({ where: eq(schema.customers.id, goneInDebt.customer.id) });
    expect(debtor?.anonymisedAt).toBeNull();
    const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, oldInvoice!.id) });
    expect(inv?.notes).toBeNull();
    expect(inv?.lines[0]).toMatchObject({ description: "Services", gross: 1000 });
    expect(inv?.viewToken).not.toBe("oldtoken");

    // Suspended today: not deleted on the next run; everything else already handled.
    const again = await runRetention(owner.accountId, TODAY);
    expect(Object.values(again).every((n) => n === 0)).toBe(true);
    expect((await spec(overdue.id))?.status).toBe("suspended");
  });
});

describe("roles and users", () => {
  it("enforces role permissions in services", async () => {
    const employeeRole = await db.query.roles.findFirst({ where: sql`${schema.roles.accountId} = ${owner.accountId} and ${schema.roles.name} = 'Employee'` });
    const emp = await createUser(owner, { email: "eve@example.com", name: "Eve", password: "password123", passwordConfirmation: "password123", roleId: employeeRole!.id, managerId: owner.id });
    const empActor: Actor = { id: emp.id, accountId: owner.accountId, permissions: new Set(employeeRole!.permissions as Permission[]) };

    await expect(createTask(empActor, { name: "Nope" })).rejects.toBeInstanceOf(PermissionError);
    await expect(createSalesSource(empActor, { type: "Leaflet" })).rejects.toBeInstanceOf(PermissionError);
    await expect(updatePlanner(empActor, { daysWorked: 62, firstWeekDay: 1, addJobsOrder: "next_due", replanFrom: "last_job", defaultPaid: "job_price", autoMarkPolicy: "assume_not_done", autoMarkAfterDays: 7 })).rejects.toBeInstanceOf(PermissionError);
    await expect(applyRevision(empActor, req({}), TODAY)).rejects.toBeInstanceOf(PermissionError);
    await expect(createRole(empActor, { name: "Boss", permissions: ["administrator"] })).rejects.toBeInstanceOf(PermissionError);

    // Granting a permission on the role allows it; administrator allows everything.
    await updateRole(owner, employeeRole!.id, { name: "Employee", permissions: [...employeeRole!.permissions, "edit_sales_sources", "bogus"] });
    const updated = await db.query.roles.findFirst({ where: eq(schema.roles.id, employeeRole!.id) });
    expect(updated?.permissions).toContain("edit_sales_sources");
    expect(updated?.permissions).not.toContain("bogus");
    const s = await createSalesSource({ ...empActor, permissions: new Set(updated!.permissions as Permission[]) }, { type: "Leaflet", reference: "Oct drop" });
    expect(s.type).toBe("Leaflet");
    await expect(createTask({ ...empActor, permissions: new Set<Permission>(["administrator"]) }, { name: "Admin task" })).resolves.toBeTruthy();
  });

  it("assigns rounds and protects the owner", async () => {
    const round = await createRound(owner, { name: "Thursday" });
    const u = await createUser(owner, { email: "finn@example.com", name: "Finn", password: "password123" });
    await assignRounds(owner, { [round.id]: u.id });
    expect((await db.query.rounds.findFirst({ where: eq(schema.rounds.id, round.id) }))?.userId).toBe(u.id);
    await expect(createUser(owner, { email: "FINN@example.com", name: "Dup", password: "password123" })).rejects.toThrow(/already exists/);
    await expect(removeUser(owner, owner.id)).rejects.toThrow(/owner/);
    await removeUser(owner, u.id);
    expect((await db.query.rounds.findFirst({ where: eq(schema.rounds.id, round.id) }))?.userId).toBeNull();
  });

  it("changes password only with the current password", async () => {
    await expect(changePassword(owner, "wrong", "newpassword1", "newpassword1")).rejects.toThrow(/not correct/);
    await expect(changePassword(owner, "password123", "newpassword1", "different1")).rejects.toThrow(/match/);
    await changePassword(owner, "password123", "newpassword1", "newpassword1");
    expect(await login("olive@example.com", "newpassword1")).not.toBeNull();
    expect(await login("olive@example.com", "password123")).toBeNull();
  });
});
