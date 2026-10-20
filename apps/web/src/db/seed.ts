/**
 * Demo/load seed: one account with N customers on 6 rounds and about a year of visits.
 * Usage: SEED_CUSTOMERS=1500 npx tsx src/db/seed.ts   (login demo@example.com / password123)
 */
import { eq, sql } from "drizzle-orm";
import { addDays, nextDueDate } from "@rounds/domain";
import { db, pg, schema } from "./index";
import { signup } from "../lib/auth";

const N = Number(process.env.SEED_CUSTOMERS ?? 300);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const streets = ["High St", "Church Rd", "Station Rd", "Park Ave", "Mill Lane", "Green Way", "Oak Close", "Victoria Rd"];
const names = ["Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Patel", "Wright"];

const existing = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = 'demo@example.com'` });
if (existing) await db.delete(schema.accounts).where(eq(schema.accounts.id, existing.accountId));
const { account, user } = await signup({ businessName: "Demo Window Cleaning", name: "Demo Owner", email: "demo@example.com", password: "password123" });
await db.update(schema.accounts).set({ plan: "team" }).where(eq(schema.accounts.id, account.id));
const rounds = await db.insert(schema.rounds).values(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => ({ accountId: account.id, name: `${d} round`, userId: user.id }))).returning();

const t0 = Date.now();
let jobs = 0;
for (let i = 0; i < N; i++) {
  const [contact] = await db.insert(schema.contacts).values({
    accountId: account.id, lastName: names[i % names.length], firstNames: `C${i}`,
    address: `${(i % 120) + 1} ${streets[i % streets.length]}\nLeeds`, postcode: "LS1 1AA",
    lat: 53.78 + ((i * 37) % 100) / 1000, lng: -1.6 + ((i * 53) % 100) / 1000, latLngSource: "approx",
  }).returning();
  const invoiced = i % 7 === 0;
  const [customer] = await db.insert(schema.customers).values({ accountId: account.id, contactId: contact!.id, paymentMethod: invoiced ? "email_invoice" : "on_day", invoiceFrequency: "manually" }).returning();
  const weeks = [4, 4, 4, 6, 8, 12][i % 6]!;
  const price = 1000 + (i % 15) * 100;
  const recurrence = { regularity: "regularly" as const, timesPerPeriod: 1, numPeriods: weeks, periodUnit: "week" as const, allowedDays: 127 };
  const [spec] = await db.insert(schema.jobSpecs).values({ accountId: account.id, customerId: customer!.id, jobContactId: contact!.id, roundId: rounds[i % 6]!.id, roundIndex: i, price, numPeriods: weeks, periodUnit: "week" }).returning();
  const visits: (typeof schema.jobs.$inferInsert)[] = [];
  const payments: (typeof schema.payments.$inferInsert)[] = [];
  let d = addDays(today, -365 + (i % (weeks * 7)));
  let balance = 0;
  while (d < today) {
    visits.push({ accountId: account.id, jobSpecId: spec!.id, date: d, status: "done", price, timeRequired: 30 });
    const paid = i % 11 === 0 ? 0 : price;
    balance += paid - price;
    d = nextDueDate(recurrence, d)!;
  }
  const inserted = visits.length ? await db.insert(schema.jobs).values(visits).returning({ id: schema.jobs.id, date: schema.jobs.date }) : [];
  for (const v of inserted) if (i % 11 !== 0) payments.push({ accountId: account.id, customerId: customer!.id, jobId: v.id, date: v.date, paid: price, method: "cash" });
  if (payments.length) await db.insert(schema.payments).values(payments);
  jobs += inserted.length;
  await db.update(schema.jobSpecs).set({ nextDueOn: d, lastDoneOn: inserted.at(-1)?.date ?? null }).where(eq(schema.jobSpecs.id, spec!.id));
  await db.update(schema.customers).set({ balance, debtSince: balance < 0 ? addDays(today, -60) : null }).where(eq(schema.customers.id, customer!.id));
}
console.log(`seeded ${N} customers, ${jobs} past visits in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await pg.end();
