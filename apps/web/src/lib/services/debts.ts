import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { contactName, logActivity, recomputeBalance } from "./ledger";

export interface DebtFilter {
  method?: string;
  kind?: "debts_and_credits" | "debts" | "credits" | "zero";
  sort?: "debt_since" | "balance" | "round_order";
  search?: string;
}

export async function listDebts(accountId: string, f: DebtFilter = {}) {
  const kind = f.kind ?? "debts";
  const conds = [eq(schema.customers.accountId, accountId), isNull(schema.customers.deletedAt)];
  if (kind === "debts") conds.push(sql`${schema.customers.balance} < 0`);
  if (kind === "credits") conds.push(sql`${schema.customers.balance} > 0`);
  if (kind === "debts_and_credits") conds.push(sql`${schema.customers.balance} <> 0`);
  if (kind === "zero") conds.push(sql`${schema.customers.balance} = 0`);
  if (f.method) conds.push(eq(schema.customers.paymentMethod, f.method));
  if (f.search) conds.push(sql`(${schema.contacts.lastName} ilike ${"%" + f.search + "%"} or ${schema.contacts.address} ilike ${"%" + f.search + "%"})`);
  const order = f.sort === "balance" ? [asc(schema.customers.balance)] : [asc(schema.customers.debtSince), asc(schema.customers.balance)];
  const rows = await db.select({ customer: schema.customers, contact: schema.contacts })
    .from(schema.customers)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(...conds)).orderBy(...order);
  return rows.map((r) => ({ ...r, name: contactName(r.contact) }));
}

/** Debt ageing as at a date, bucketed by how long the customer has been in debt. */
export async function agedDebts(accountId: string, asAt: string) {
  const rows = await listDebts(accountId, { kind: "debts" });
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  const lines = rows.filter((r) => !r.customer.debtSince || r.customer.debtSince <= asAt).map((r) => {
    const days = r.customer.debtSince ? Math.round((Date.parse(asAt) - Date.parse(r.customer.debtSince)) / 86_400_000) : 0;
    const bucket = days < 30 ? "current" : days < 60 ? "d30" : days < 90 ? "d60" : "d90";
    buckets[bucket] += -r.customer.balance;
    return { ...r, days, bucket };
  });
  return { lines, buckets };
}

/** A payment not tied to a job, e.g. a customer paying off their debt. */
export async function recordPayment(accountId: string, userId: string, customerId: string, p: { paid: number; method: string; reference?: string | null; date: string; invoiceId?: string | null }) {
  const c = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
  if (!c) throw new Error("Customer not found");
  await db.transaction(async (tx) => {
    await tx.insert(schema.payments).values({ accountId, customerId, date: p.date, paid: p.paid, method: p.method, reference: p.reference ?? null, invoiceId: p.invoiceId ?? null });
    await recomputeBalance(customerId, p.date, tx);
    await logActivity(tx, { accountId, userId, customerId, date: p.date, category: "payments", subcategory: p.method, summary: "Payment", amount: p.paid });
  });
}

/** Statement of account: running balance over every ledger movement. */
export async function statement(accountId: string, customerId: string, upTo: string) {
  const c = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
  if (!c) return null;
  const jobs = await db.select({ job: schema.jobs, spec: schema.jobSpecs }).from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .where(and(eq(schema.jobSpecs.customerId, customerId), eq(schema.jobs.status, "done"), lte(schema.jobs.date, upTo)));
  const pays = await db.select().from(schema.payments).where(and(eq(schema.payments.customerId, customerId), lte(schema.payments.date, upTo)));
  const adj = await db.select().from(schema.adjustments).where(and(eq(schema.adjustments.customerId, customerId), lte(schema.adjustments.date, upTo)));
  const { jobGross } = await import("./ledger");
  const moves = [
    ...jobs.map(({ job, spec }) => ({ date: job.date, text: spec.description || "Work done", amount: -jobGross(job) })),
    ...pays.map((p) => ({ date: p.date, text: `Payment received${p.reference ? ` (${p.reference})` : ""}`, amount: p.paid - p.tip })),
    ...adj.map((a) => ({ date: a.date, text: a.type.replace(/_/g, " "), amount: a.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let running = c.startingBalance;
  const lines = moves.map((m) => ({ ...m, balance: (running += m.amount) }));
  return { customer: c, opening: c.startingBalance, lines, closing: running };
}

export async function listInvoices(accountId: string) {
  return db.select({ invoice: schema.invoices, contact: schema.contacts }).from(schema.invoices)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(eq(schema.invoices.accountId, accountId)).orderBy(desc(schema.invoices.issuedOn), desc(schema.invoices.createdAt)).limit(500);
}
