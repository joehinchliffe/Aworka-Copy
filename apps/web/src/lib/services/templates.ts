import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { formatPence, type Pence } from "@rounds/domain";
import { db, schema } from "@/db";
import { formatDate } from "@/lib/time";
import { contactName, firstAddressLine } from "./ledger";

/** What a template is for. Drives defaults and, for marketing, opt-out rules. */
export const TEMPLATE_PURPOSES = {
  general: "General",
  marketing: "Marketing",
  invoices: "Invoices",
  estimates: "Estimates",
  receipts: "Receipts",
  statements: "Statements",
  upcoming_jobs: "Upcoming jobs",
  jobs_done: "Jobs done",
  jobs_done_requiring_payment: "Jobs done requiring payment",
  jobs_not_done: "Jobs not done",
  jobs_skipped: "Jobs skipped",
  payment_reminders: "Payment reminders",
  direct_debit_cancelled: "Direct debit cancelled",
  job_sheets: "Job sheets",
  prepayment_receipt: "Prepayment receipt",
} as const;
export type TemplatePurpose = keyof typeof TEMPLATE_PURPOSES;

/** Merge tags that templates may use, with what they insert. */
export const MERGE_TAGS = {
  first_name: "Customer's first name (or full name when there is none)",
  name: "Customer's full name",
  address: "First line of the job address",
  balance: "Amount owed (or £0.00 when not in debt)",
  next_due: "Next due date of the customer's job",
  job_price: "Price of the customer's job",
  business_name: "Your business name",
  invoice_link: "Link to view the latest invoice online",
} as const;
export type MergeTag = keyof typeof MERGE_TAGS;
export type MergeContext = Partial<Record<MergeTag, string>>;

/**
 * Replace `#tag` merge tags with values from the context. Unknown tags are left
 * as typed so mistakes are visible in the preview; known tags with no value
 * become empty.
 */
export function mergeTemplate(text: string, ctx: MergeContext): string {
  return text.replace(/#([a-z_]+)/g, (whole, tag: string) => {
    if (!(tag in MERGE_TAGS)) return whole;
    return ctx[tag as MergeTag] ?? "";
  });
}

/** Tags in a text that are not recognised. */
export function unknownTags(text: string): string[] {
  return [...new Set([...text.matchAll(/#([a-z_]+)/g)].map((m) => m[1]!).filter((t) => !(t in MERGE_TAGS)))];
}

export interface MergeCustomer {
  contact: { title?: string | null; firstNames?: string | null; lastName?: string | null; company?: string | null; address?: string | null };
  balance: Pence;
  nextDueOn?: string | null;
  jobPrice?: Pence | null;
  invoiceToken?: string | null;
}

export function mergeContextFor(c: MergeCustomer, businessName: string, baseUrl = process.env.APP_URL ?? "http://localhost:3000"): MergeContext {
  const name = contactName(c.contact);
  return {
    first_name: c.contact.firstNames?.trim().split(/\s+/)[0] || name,
    name,
    address: firstAddressLine(c.contact),
    balance: formatPence(c.balance < 0 ? -c.balance : 0),
    next_due: c.nextDueOn ? formatDate(c.nextDueOn) : "",
    job_price: c.jobPrice != null ? formatPence(c.jobPrice) : "",
    business_name: businessName,
    invoice_link: c.invoiceToken ? `${baseUrl}/v/${c.invoiceToken}` : "",
  };
}

/** Load merge data for many customers at once (contact, balance, next job, latest invoice). */
export async function loadMergeCustomers(accountId: string, customerIds: string[]) {
  const out = new Map<string, MergeCustomer & {
    customerId: string; email: string | null; phone: string | null; contactMethod: string; acceptsMarketing: boolean; anonymised: boolean;
  }>();
  if (customerIds.length === 0) return out;
  const rows = await db
    .select({ customer: schema.customers, contact: schema.contacts })
    .from(schema.customers)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(eq(schema.customers.accountId, accountId), inArray(schema.customers.id, customerIds)));
  const specs = await db.select().from(schema.jobSpecs)
    .where(and(eq(schema.jobSpecs.accountId, accountId), inArray(schema.jobSpecs.customerId, customerIds), inArray(schema.jobSpecs.status, ["active", "estimate"])))
    .orderBy(asc(schema.jobSpecs.nextDueOn));
  const invoices = await db.select({ customerId: schema.invoices.customerId, viewToken: schema.invoices.viewToken })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.accountId, accountId), inArray(schema.invoices.customerId, customerIds), eq(schema.invoices.kind, "invoice"), isNotNull(schema.invoices.viewToken)))
    .orderBy(desc(schema.invoices.issuedOn), desc(schema.invoices.createdAt));
  for (const { customer, contact } of rows) {
    const spec = specs.find((s) => s.customerId === customer.id && s.nextDueOn) ?? specs.find((s) => s.customerId === customer.id);
    out.set(customer.id, {
      customerId: customer.id,
      contact,
      balance: customer.balance,
      nextDueOn: spec?.nextDueOn ?? null,
      jobPrice: spec?.price ?? null,
      invoiceToken: invoices.find((i) => i.customerId === customer.id)?.viewToken ?? null,
      email: contact.email,
      phone: contact.phone1 || contact.phone2 || contact.phone3 || null,
      contactMethod: customer.contactMethod,
      acceptsMarketing: customer.acceptsMarketing,
      anonymised: customer.anonymisedAt != null || customer.deletedAt != null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Template CRUD

export interface TemplateInput {
  name: string;
  purpose: string;
  emailSubject?: string | null;
  emailBody?: string | null;
  smsBody?: string | null;
}

function cleanTemplate(t: TemplateInput) {
  const name = t.name.trim();
  if (!name) throw new Error("Template name is required");
  if (!(t.purpose in TEMPLATE_PURPOSES)) throw new Error("Choose a purpose");
  const opt = (s?: string | null) => (s && s.trim() ? s : null);
  const v = { name, purpose: t.purpose, emailSubject: opt(t.emailSubject), emailBody: opt(t.emailBody), smsBody: opt(t.smsBody) };
  if (!v.emailBody && !v.smsBody) throw new Error("Enter an email body, an SMS body or both");
  return v;
}

export const listTemplates = (accountId: string) =>
  db.select().from(schema.messageTemplates).where(eq(schema.messageTemplates.accountId, accountId))
    .orderBy(asc(schema.messageTemplates.purpose), asc(schema.messageTemplates.name));

export const getTemplate = (accountId: string, id: string) =>
  db.query.messageTemplates.findFirst({ where: and(eq(schema.messageTemplates.id, id), eq(schema.messageTemplates.accountId, accountId)) });

export async function saveTemplate(accountId: string, id: string | null, input: TemplateInput) {
  const v = cleanTemplate(input);
  if (id) {
    const [row] = await db.update(schema.messageTemplates).set({ ...v, updatedAt: new Date() })
      .where(and(eq(schema.messageTemplates.id, id), eq(schema.messageTemplates.accountId, accountId))).returning();
    if (!row) throw new Error("Template not found");
    return row;
  }
  const [row] = await db.insert(schema.messageTemplates).values({ accountId, ...v }).returning();
  return row!;
}

export async function deleteTemplate(accountId: string, id: string) {
  await db.delete(schema.messageTemplates).where(and(eq(schema.messageTemplates.id, id), eq(schema.messageTemplates.accountId, accountId)));
}
