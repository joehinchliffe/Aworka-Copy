import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { addAdjustment, createCustomerWithJob, getCustomer } from "@/lib/services/customers";
import { updateUser } from "@/lib/services/users";
import { toCsv, parseCsv } from "@/lib/csv";

afterAll(async () => { await pg.end(); });
const stamp = Date.now();

describe("tenant isolation", () => {
  it("rejects adjustments, rounds and tasks from another account", async () => {
    const a = await signup({ businessName: "A", name: "A", email: `seca${stamp}@example.com`, password: "password123" });
    const b = await signup({ businessName: "B", name: "B", email: `secb${stamp}@example.com`, password: "password123" });
    const victim = await createCustomerWithJob(b.account.id, b.user.id, { contact: { lastName: "Victim", address: "1 B St" } }, { price: 10, newRoundName: "B round" }, "2026-10-20");
    await expect(addAdjustment(a.account.id, a.user.id, victim.customer.id, "credit", 99900, null, "2026-10-20")).rejects.toThrow();
    expect((await getCustomer(b.account.id, victim.customer.id))?.customer.balance).toBe(0);
    const [bTask] = await db.insert(schema.tasks).values({ accountId: b.account.id, name: "B task" }).returning();
    await expect(createCustomerWithJob(a.account.id, a.user.id, { contact: { lastName: "X", address: "1 A St" } }, { roundId: victim.jobSpec.roundId }, "2026-10-20")).rejects.toThrow(/Unknown round/);
    await expect(createCustomerWithJob(a.account.id, a.user.id, { contact: { lastName: "X", address: "1 A St" } }, { taskId: bTask!.id }, "2026-10-20")).rejects.toThrow(/Unknown task/);
  });

  it("stops an administrator from taking over the owner", async () => {
    const { account, user: owner } = await signup({ businessName: "C", name: "Owner", email: `secc${stamp}@example.com`, password: "password123" });
    const [admin] = await db.insert(schema.users).values({ accountId: account.id, email: `secd${stamp}@example.com`, passwordHash: "x", name: "Admin" }).returning();
    const actor = { id: admin!.id, accountId: account.id, isOwner: false, permissions: new Set(["administrator"] as const) };
    await expect(updateUser(actor, owner.id, { email: `evil${stamp}@example.com`, name: "Owner", password: "hijacked123" })).rejects.toThrow(/owner/);
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, owner.id) }))?.email).toBe(`secc${stamp}@example.com`);
  });
});

describe("csv export", () => {
  it("neutralises formulas but keeps negative numbers", () => {
    const rows = parseCsv(toCsv([["=HYPERLINK(\"x\")", "+1+1", "@SUM(A1)", "-12.50", "-cmd"]]));
    expect(rows[0]).toEqual(["'=HYPERLINK(\"x\")", "'+1+1", "'@SUM(A1)", "-12.50", "'-cmd"]);
  });
});
