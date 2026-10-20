import { and, eq, isNull, sql } from "drizzle-orm";
import { grossFromNet, type Pence } from "@rounds/domain";
import { db, schema, type Db } from "@/db";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Gross amount a job charges the customer. */
export function jobGross(job: { price: number; vatStatus: string; vatRate: number }): Pence {
  return job.vatStatus === "ex_vat" ? grossFromNet(job.price, job.vatRate) : job.price;
}

/**
 * Recompute and store a customer's balance from the ledger:
 *   starting balance + adjustments + (paid - tip) - gross value of done jobs.
 * Negative = owes. Also maintains debtSince.
 */
export async function recomputeBalance(customerId: string, today: string, tx: Tx = db): Promise<Pence> {
  const customer = await tx.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!customer) throw new Error("Customer not found");

  const [paid] = await tx
    .select({ total: sql<number>`coalesce(sum(${schema.payments.paid} - ${schema.payments.tip}), 0)::int` })
    .from(schema.payments)
    .where(and(eq(schema.payments.customerId, customerId), sql`${schema.payments.status} <> 'failed'`));
  const [adj] = await tx
    .select({ total: sql<number>`coalesce(sum(${schema.adjustments.amount}), 0)::int` })
    .from(schema.adjustments)
    .where(eq(schema.adjustments.customerId, customerId));
  const doneJobs = await tx
    .select({ price: schema.jobs.price, vatStatus: schema.jobs.vatStatus, vatRate: schema.jobs.vatRate })
    .from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .where(and(eq(schema.jobSpecs.customerId, customerId), eq(schema.jobs.status, "done")));
  const charged = doneJobs.reduce((s, j) => s + jobGross(j), 0);

  const balance = customer.startingBalance + (adj?.total ?? 0) + (paid?.total ?? 0) - charged;
  const debtSince = balance >= 0 ? null : customer.balance < 0 && customer.debtSince ? customer.debtSince : today;
  await tx.update(schema.customers)
    .set({ balance, debtSince, updatedAt: new Date() })
    .where(eq(schema.customers.id, customerId));
  return balance;
}

export async function logActivity(
  tx: Tx,
  a: { accountId: string; userId?: string | null; customerId?: string | null; date: string; category: string; subcategory?: string; summary: string; amount?: number | null },
) {
  await tx.insert(schema.activities).values({
    accountId: a.accountId, userId: a.userId ?? null, customerId: a.customerId ?? null, date: a.date,
    category: a.category, subcategory: a.subcategory ?? null, summary: a.summary, amount: a.amount ?? null,
  });
}

export async function customerDisplayName(customerId: string, tx: Tx = db): Promise<string> {
  const row = await tx
    .select({ c: schema.contacts })
    .from(schema.customers)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(eq(schema.customers.id, customerId), isNull(schema.customers.anonymisedAt)))
    .limit(1);
  const c = row[0]?.c;
  return c ? contactName(c) : "Customer";
}

export function contactName(c: { title?: string | null; firstNames?: string | null; lastName?: string | null; company?: string | null }) {
  const name = [c.title, c.firstNames, c.lastName].filter(Boolean).join(" ");
  return name || c.company || "(no name)";
}

export function firstAddressLine(c: { address?: string | null; company?: string | null }) {
  return (c.address ?? "").split(/\n|,/)[0]?.trim() || c.company || "";
}
