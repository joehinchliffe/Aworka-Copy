import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { addDays, type IsoDate } from "@rounds/domain";
import { db, schema } from "@/db";
import { contactName, firstAddressLine, jobGross } from "./ledger";
import { gocardlessConnected } from "./gocardless";
import { stripeConnected } from "./stripe";

/** The customer's self-service portal secret, created on first use. */
export async function ensurePortalToken(customerId: string): Promise<string> {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c) throw new Error("Customer not found");
  if (c.portalToken) return c.portalToken;
  await db.update(schema.customers).set({ portalToken: randomBytes(24).toString("base64url"), updatedAt: new Date() })
    .where(and(eq(schema.customers.id, customerId), isNull(schema.customers.portalToken)));
  const again = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  return again!.portalToken!;
}

export async function customerByPortalToken(token: string) {
  if (!token || token.length < 16) return null;
  const row = (await db.select({ customer: schema.customers, contact: schema.contacts, account: schema.accounts })
    .from(schema.customers)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.customers.accountId))
    .where(and(eq(schema.customers.portalToken, token), isNull(schema.customers.deletedAt), isNull(schema.customers.anonymisedAt)))
    .limit(1))[0];
  return row ?? null;
}

/** Everything the public portal page shows. */
export async function portalView(token: string, today: IsoDate) {
  const row = await customerByPortalToken(token);
  if (!row) return null;
  const { customer, contact, account } = row;
  const invoices = customer.balance < 0
    ? await db.select().from(schema.invoices)
      .where(and(eq(schema.invoices.customerId, customer.id), eq(schema.invoices.kind, "invoice"), isNull(schema.invoices.paidAt)))
      .orderBy(desc(schema.invoices.issuedOn)).limit(20)
    : [];
  const jobs = await db.select({ job: schema.jobs, spec: schema.jobSpecs, jobContact: schema.contacts })
    .from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.jobSpecs.jobContactId))
    .where(and(eq(schema.jobSpecs.customerId, customer.id), eq(schema.jobs.status, "to_do"),
      gte(schema.jobs.date, today), lte(schema.jobs.date, addDays(today, 60))))
    .orderBy(asc(schema.jobs.date));
  const [stripe, gocardless] = await Promise.all([stripeConnected(account.id), gocardlessConnected(account.id)]);
  return {
    customer, account, name: contactName(contact), email: contact.email,
    owed: customer.balance < 0 ? -customer.balance : 0,
    invoices,
    jobs: jobs.map(({ job, spec, jobContact }) => ({
      id: job.id, date: job.date, confirmed: job.confirmed, price: jobGross(job),
      description: spec.description || account.settings.defaultJobDescription || "Cleaning",
      where: firstAddressLine(jobContact ?? contact),
    })),
    canPayByCard: stripe,
    canSetUpDirectDebit: gocardless && customer.mandateStatus !== "active" && customer.mandateStatus !== "pending",
    mandateStatus: customer.mandateStatus,
  };
}

/** The customer confirms a planned appointment from their portal. */
export async function confirmAppointment(token: string, jobId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return false;
  const row = await customerByPortalToken(token);
  if (!row) return false;
  const job = (await db.select({ job: schema.jobs }).from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobSpecs.customerId, row.customer.id), eq(schema.jobs.status, "to_do")))
    .limit(1))[0]?.job;
  if (!job || job.confirmed !== false) return false;
  await db.update(schema.jobs).set({ confirmed: true, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
  return true;
}
