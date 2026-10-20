import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { addDays, addMonths, netFromGross, grossFromNet, type IsoDate } from "@rounds/domain";
import { db, schema } from "@/db";
import type { InvoiceLine } from "@/db/schema";
import { logActivity } from "./ledger";
import { queueMessage } from "./messaging";

function lineFor(job: typeof schema.jobs.$inferSelect, description: string): InvoiceLine {
  const vatable = job.vatStatus === "inc_vat" || job.vatStatus === "ex_vat";
  const gross = job.vatStatus === "ex_vat" ? grossFromNet(job.price, job.vatRate) : job.price;
  const net = vatable && job.vatRate > 0 ? (job.vatStatus === "ex_vat" ? job.price : netFromGross(job.price, job.vatRate)) : gross;
  return { jobId: job.id, date: job.date, description, net, vat: gross - net, gross };
}

export function dueDate(issuedOn: IsoDate, type: string | null | undefined, days: number | null | undefined): IsoDate | null {
  switch (type) {
    case "by_return":
    case "cod":
      return issuedOn;
    case "net_from_invoice_date":
      return addDays(issuedOn, days ?? 0);
    case "net_from_month_end": {
      const monthEnd = addDays(addMonths(issuedOn.slice(0, 8) + "01", 1), -1);
      return addDays(monthEnd, days ?? 0);
    }
    default:
      return null;
  }
}

/** Invoice all done, uninvoiced jobs for a customer (or the given jobs). Returns null if nothing to invoice. */
export async function createInvoice(accountId: string, customerId: string, today: IsoDate, opts: { jobIds?: string[]; userId?: string | null } = {}) {
  return db.transaction(async (tx) => {
    const account = await tx.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
    const customer = await tx.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
    if (!account || !customer) throw new Error("Customer not found");
    const rows = await tx
      .select({ job: schema.jobs, spec: schema.jobSpecs })
      .from(schema.jobs)
      .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
      .where(and(eq(schema.jobSpecs.customerId, customerId), eq(schema.jobs.status, "done"), isNull(schema.jobs.invoiceId),
        opts.jobIds ? inArray(schema.jobs.id, opts.jobIds) : undefined))
      .orderBy(schema.jobs.date);
    if (rows.length === 0) return null;
    const lines = rows.map(({ job, spec }) => lineFor(job, spec.description || account.settings.defaultJobDescription || "Cleaning"));
    const net = lines.reduce((s, l) => s + l.net, 0);
    const vat = lines.reduce((s, l) => s + l.vat, 0);
    const gross = net + vat;
    const number = String(account.nextInvoiceNumber);
    await tx.update(schema.accounts).set({ nextInvoiceNumber: account.nextInvoiceNumber + 1 }).where(eq(schema.accounts.id, accountId));
    const termsType = customer.paymentTermsType ?? account.settings.paymentTermsType ?? "not_required";
    const termsDays = customer.paymentTermsDays ?? account.settings.paymentTermsDays ?? 0;
    const [invoice] = await tx.insert(schema.invoices).values({
      accountId, customerId, number, kind: "invoice", issuedOn: today, dueOn: dueDate(today, termsType, termsDays),
      net, vat, gross, amountToPay: Math.max(gross, -customer.balance), lines,
      notes: account.settings.invoiceNotes ?? null, viewToken: randomBytes(18).toString("base64url"),
    }).returning();
    await tx.update(schema.jobs).set({ invoiceId: invoice!.id }).where(inArray(schema.jobs.id, rows.map((r) => r.job.id)));
    await logActivity(tx, { accountId, userId: opts.userId, customerId, date: today, category: "invoices", summary: `Invoice ${number}`, amount: gross });
    return invoice!;
  });
}

/** Run a customer's automatic invoicing rule. `trigger` says why we were called. */
export async function maybeAutoInvoice(accountId: string, customerId: string, today: IsoDate, trigger: "after_job" | "nightly") {
  const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!customer || !["email_invoice", "paper_invoice"].includes(customer.paymentMethod)) return null;
  const f = customer.invoiceFrequency;
  const pending = await db
    .select({ n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${schema.jobs.price}),0)::int` })
    .from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .where(and(eq(schema.jobSpecs.customerId, customerId), eq(schema.jobs.status, "done"), isNull(schema.jobs.invoiceId)));
  const { n = 0, value = 0 } = pending[0] ?? {};
  if (n === 0) return null;
  let due = false;
  if (f === "after_each_job") due = trigger === "after_job";
  else if (f === "overnight") due = trigger === "nightly";
  else if (f === "when_jobs_done_reaches") due = n >= customer.invoiceJobsThreshold;
  else if (f === "when_value_reaches") due = value >= (customer.invoiceValueThreshold ?? 0);
  else if (f === "periodically") due = trigger === "nightly" && !!customer.nextInvoiceOn && customer.nextInvoiceOn <= today;
  if (!due) return null;
  const invoice = await createInvoice(accountId, customerId, today);
  if (invoice && f === "periodically") {
    const step = customer.invoicePeriodUnit === "month" ? addMonths(today, customer.invoicePeriodNum)
      : addDays(today, customer.invoicePeriodNum * (customer.invoicePeriodUnit === "week" ? 7 : 1));
    await db.update(schema.customers).set({ nextInvoiceOn: step }).where(eq(schema.customers.id, customerId));
  }
  if (invoice && customer.paymentMethod === "email_invoice") await emailInvoice(accountId, invoice.id);
  return invoice;
}

export async function emailInvoice(accountId: string, invoiceId: string) {
  const row = await db
    .select({ invoice: schema.invoices, contact: schema.contacts, account: schema.accounts })
    .from(schema.invoices)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.invoices.accountId))
    .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.accountId, accountId)))
    .limit(1);
  const r = row[0];
  if (!r?.contact.email) throw new Error("Customer has no email address");
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const amount = `£${(r.invoice.amountToPay / 100).toFixed(2)}`;
  await queueMessage(accountId, {
    customerId: r.invoice.customerId, channel: "email", reason: "invoice", to: r.contact.email,
    subject: `${r.account.settings.invoiceTitle ?? "Invoice"} ${r.invoice.number} from ${r.account.businessName}`,
    body: `Hello,\n\nYour invoice ${r.invoice.number} for ${amount} is ready:\n${base}/v/${r.invoice.viewToken}\n\nThank you,\n${r.account.businessName}`
      + (r.account.settings.emailSignature ? `\n${r.account.settings.emailSignature}` : ""),
  });
  await db.update(schema.invoices).set({ emailedAt: new Date() }).where(eq(schema.invoices.id, invoiceId));
}

/** Nightly: overnight, periodic and threshold invoicing for every invoiced customer. */
export async function runNightlyInvoicing(accountId: string, today: IsoDate) {
  const customers = await db.select({ id: schema.customers.id }).from(schema.customers)
    .where(and(eq(schema.customers.accountId, accountId), inArray(schema.customers.paymentMethod, ["email_invoice", "paper_invoice"])));
  let created = 0;
  for (const c of customers) if (await maybeAutoInvoice(accountId, c.id, today, "nightly")) created++;
  return created;
}
