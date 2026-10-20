import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { createCustomerWithJob } from "@/lib/services/customers";
import { addJobToDay, optimiseDay } from "@/lib/services/planning";

afterAll(async () => { await pg.end(); });

describe("optimiseDay", () => {
  it("orders located jobs by distance from home and puts unlocated last", async () => {
    const { account, user } = await signup({ businessName: "Route Co", name: "R", email: `route${Date.now()}@example.com`, password: "password123" });
    await db.update(schema.accounts).set({ settings: { homeLat: 53.8, homeLng: -1.6 } }).where(eq(schema.accounts.id, account.id));
    const date = "2026-10-21";
    const lngs = [-1.5, -1.58, -1.54, null];
    for (const [i, lng] of lngs.entries()) {
      const { customer, jobSpec } = await createCustomerWithJob(account.id, user.id, { contact: { lastName: `C${i}`, address: `${i} Road` } }, { price: 10 }, date);
      if (lng != null) await db.update(schema.contacts).set({ lat: 53.8, lng }).where(eq(schema.contacts.id, customer.contactId));
      await addJobToDay(account.id, user.id, jobSpec.id, date, 0);
    }
    const r = await optimiseDay(account.id, date, { start: "home", finish: "anywhere" });
    expect(r).toEqual({ ordered: 3, unlocated: 1 });
    const jobs = await db.select({ name: schema.contacts.lastName }).from(schema.jobs)
      .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
      .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
      .where(eq(schema.jobs.accountId, account.id)).orderBy(asc(schema.jobs.dayOrder));
    expect(jobs.map((j) => j.name)).toEqual(["C1", "C2", "C0", "C3"]);
  });
});
