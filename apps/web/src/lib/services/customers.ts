import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { logActivity, recomputeBalance } from "./ledger";

const money = z.coerce.number().transform((n) => Math.round(n * 100));
const optStr = z.string().trim().optional().transform((s) => (s ? s : null));

export const contactInput = z.object({
  title: optStr, firstNames: optStr, lastName: optStr, company: optStr,
  address: optStr, postcode: optStr,
  phone1: optStr, phone2: optStr, phone3: optStr,
  email: z.string().trim().email().optional().or(z.literal("")).transform((s) => (s ? s : null)),
  emailCc: optStr,
  lat: z.coerce.number().optional().nullable(), lng: z.coerce.number().optional().nullable(),
});

export const customerInput = z.object({
  contact: contactInput,
  reference: optStr,
  contactMethod: z.enum(["none", "email", "sms", "both"]).default("email"),
  acceptsMarketing: z.boolean().default(true),
  paymentMethod: z.enum(["on_day", "card", "collection", "by_post", "online", "direct_to_bank", "email_invoice", "paper_invoice", "direct_debit"]).default("on_day"),
  invoiceFrequency: z.enum(["manually", "after_each_job", "overnight", "periodically", "when_value_reaches", "when_jobs_done_reaches", "before_each_job"]).default("after_each_job"),
  invoicePeriodNum: z.coerce.number().int().min(1).max(12).default(1),
  invoicePeriodUnit: z.enum(["day", "week", "month"]).default("month"),
  invoiceJobsThreshold: z.coerce.number().int().min(1).default(2),
  invoiceValueThreshold: money.optional().nullable(),
  paymentTermsType: z.enum(["not_required", "by_return", "cod", "net_from_invoice_date", "net_from_month_end"]).optional().nullable(),
  paymentTermsDays: z.coerce.number().int().optional().nullable(),
  notes: optStr,
  startingBalance: money.default(0),
});

export const jobSpecInput = z.object({
  estimate: z.boolean().default(false),
  location: z.enum(["customer", "other", "none"]).default("customer"),
  jobContact: contactInput.optional(),
  reference: optStr,
  roundId: z.string().uuid().optional().nullable(),
  newRoundName: optStr,
  taskId: z.string().uuid().optional().nullable(),
  description: optStr,
  notes: optStr,
  price: money.default(0),
  vatStatus: z.enum(["inc_vat", "ex_vat", "zero_rated", "exempt", "out_of_scope"]).default("inc_vat"),
  timeRequired: z.coerce.number().int().min(0).max(24 * 60).default(30),
  regularity: z.enum(["one_off", "on_request", "regularly"]).default("regularly"),
  timesPerPeriod: z.coerce.number().int().min(1).max(7).default(1),
  numPeriods: z.coerce.number().int().min(1).max(52).default(4),
  periodUnit: z.enum(["day", "week", "month", "year"]).default("week"),
  allowedDays: z.coerce.number().int().min(1).max(127).default(127),
  appointments: z.enum(["none", "confirm_day_before", "confirm_few_days_before"]).default("none"),
  firstDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export type CustomerInput = z.input<typeof customerInput>;
export type JobSpecInput = z.input<typeof jobSpecInput>;

export function validateCustomer(c: z.output<typeof customerInput>, j?: z.output<typeof jobSpecInput>) {
  const errors: string[] = [];
  const ct = c.contact;
  if (!ct.title && !ct.firstNames && !ct.lastName && !ct.company) errors.push("Enter a name or company");
  if ((c.paymentMethod === "email_invoice") && !ct.email) errors.push("An email address is needed to email invoices");
  if (j) {
    if (j.location === "customer" && !ct.address && !j.reference) errors.push("Enter the customer's address or a job reference");
    if (j.location === "none" && !j.reference) errors.push("A job reference is needed when location is not applicable");
    if (j.location === "other" && !j.jobContact?.address && !j.reference) errors.push("Enter the job address or a reference");
  }
  return errors;
}

/** Create a customer together with their first job, as the combined "New Customer" form does. */
export async function createCustomerWithJob(accountId: string, userId: string, rawCustomer: CustomerInput, rawJob: JobSpecInput, today: string) {
  const c = customerInput.parse(rawCustomer);
  const j = jobSpecInput.parse(rawJob);
  const errors = validateCustomer(c, j);
  if (errors.length) throw new ValidationError(errors);

  return db.transaction(async (tx) => {
    const [contact] = await tx.insert(schema.contacts).values({ accountId, ...c.contact }).returning();
    const [customer] = await tx.insert(schema.customers).values({
      accountId, contactId: contact!.id, reference: c.reference, contactMethod: c.contactMethod,
      acceptsMarketing: c.acceptsMarketing, paymentMethod: c.paymentMethod, invoiceFrequency: c.invoiceFrequency,
      invoicePeriodNum: c.invoicePeriodNum, invoicePeriodUnit: c.invoicePeriodUnit,
      invoiceJobsThreshold: c.invoiceJobsThreshold, invoiceValueThreshold: c.invoiceValueThreshold ?? null,
      paymentTermsType: c.paymentTermsType ?? null, paymentTermsDays: c.paymentTermsDays ?? null,
      notes: c.notes, startingBalance: c.startingBalance, startingBalanceOn: today,
    }).returning();
    const spec = await insertJobSpec(tx, accountId, userId, customer!.id, contact!.id, j, today);
    await recomputeBalance(customer!.id, today, tx);
    await logActivity(tx, { accountId, userId, customerId: customer!.id, date: today, category: j.estimate ? "estimates" : "jobs", subcategory: "created", summary: `New customer` });
    return { customer: customer!, jobSpec: spec };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertJobSpec(tx: Tx, accountId: string, userId: string, customerId: string, customerContactId: string, j: z.output<typeof jobSpecInput>, today: string) {
  await assertOwnedRefs(accountId, j.roundId, j.taskId);
  let roundId = j.roundId ?? null;
  if (!roundId && j.newRoundName) {
    const [round] = await tx.insert(schema.rounds).values({ accountId, name: j.newRoundName, userId }).returning();
    roundId = round!.id;
  }
  let jobContactId: string | null = null;
  if (j.location === "customer") jobContactId = customerContactId;
  if (j.location === "other" && j.jobContact) {
    const [jc] = await tx.insert(schema.contacts).values({ accountId, ...j.jobContact }).returning();
    jobContactId = jc!.id;
  }
  let roundIndex = 0;
  if (roundId) {
    const [max] = await tx.select({ m: sql<number>`coalesce(max(${schema.jobSpecs.roundIndex}), 0)::int` })
      .from(schema.jobSpecs).where(eq(schema.jobSpecs.roundId, roundId));
    roundIndex = (max?.m ?? 0) + 1;
  }
  const [spec] = await tx.insert(schema.jobSpecs).values({
    accountId, customerId, jobContactId, location: j.location, roundId, roundIndex, taskId: j.taskId ?? null,
    status: j.estimate ? "estimate" : "active", reference: j.reference, description: j.description, notes: j.notes,
    price: j.price, vatStatus: j.vatStatus, timeRequired: j.timeRequired, regularity: j.regularity,
    timesPerPeriod: j.timesPerPeriod, numPeriods: j.numPeriods, periodUnit: j.periodUnit,
    allowedDays: j.allowedDays, appointments: j.appointments,
    nextDueOn: j.firstDueOn ?? (j.regularity === "regularly" ? today : null),
  }).returning();
  return spec!;
}

export async function addJobSpec(accountId: string, userId: string, customerId: string, rawJob: JobSpecInput, today: string) {
  const j = jobSpecInput.parse(rawJob);
  const customer = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
  if (!customer) throw new Error("Customer not found");
  return db.transaction((tx) => insertJobSpec(tx, accountId, userId, customerId, customer.contactId, j, today));
}

/** Round and task ids supplied by a client must belong to the same account. */
async function assertOwnedRefs(accountId: string, roundId?: string | null, taskId?: string | null) {
  if (roundId && !(await db.query.rounds.findFirst({ where: and(eq(schema.rounds.id, roundId), eq(schema.rounds.accountId, accountId)) }))) throw new ValidationError(["Unknown round"]);
  if (taskId && !(await db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.accountId, accountId)) }))) throw new ValidationError(["Unknown task"]);
}

export class ValidationError extends Error {
  constructor(public errors: string[]) { super(errors.join("; ")); }
}

export interface CustomerListFilter {
  search?: string;
  show?: "all" | "debts" | "suspended";
  roundId?: string;
}

export async function listCustomers(accountId: string, f: CustomerListFilter = {}) {
  const conds = [eq(schema.customers.accountId, accountId), isNull(schema.customers.deletedAt)];
  if (f.search) {
    const q = `%${f.search}%`;
    conds.push(or(ilike(schema.contacts.firstNames, q), ilike(schema.contacts.lastName, q), ilike(schema.contacts.company, q),
      ilike(schema.contacts.address, q), ilike(schema.contacts.postcode, q), ilike(schema.customers.reference, q))!);
  }
  if (f.show === "debts") conds.push(sql`${schema.customers.balance} < 0`);
  const rows = await db
    .select({ customer: schema.customers, contact: schema.contacts })
    .from(schema.customers)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(...conds))
    .orderBy(asc(schema.contacts.lastName), asc(schema.contacts.company));
  const specs = await db
    .select({ spec: schema.jobSpecs, round: schema.rounds })
    .from(schema.jobSpecs)
    .leftJoin(schema.rounds, eq(schema.rounds.id, schema.jobSpecs.roundId))
    .where(and(eq(schema.jobSpecs.accountId, accountId), sql`${schema.jobSpecs.status} <> 'deleted'`));
  const byCustomer = new Map<string, typeof specs>();
  for (const s of specs) {
    if (f.roundId && s.spec.roundId !== f.roundId) continue;
    if (f.show === "suspended" && s.spec.status !== "suspended") continue;
    const list = byCustomer.get(s.spec.customerId) ?? [];
    list.push(s);
    byCustomer.set(s.spec.customerId, list);
  }
  return rows
    .map((r) => ({ ...r, specs: byCustomer.get(r.customer.id) ?? [] }))
    .filter((r) => (f.roundId || f.show === "suspended" ? r.specs.length > 0 : true));
}

export async function getCustomer(accountId: string, customerId: string) {
  const row = await db
    .select({ customer: schema.customers, contact: schema.contacts })
    .from(schema.customers)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)))
    .limit(1);
  if (!row[0]) return null;
  const specs = await db
    .select({ spec: schema.jobSpecs, round: schema.rounds, jobContact: schema.contacts })
    .from(schema.jobSpecs)
    .leftJoin(schema.rounds, eq(schema.rounds.id, schema.jobSpecs.roundId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.jobSpecs.jobContactId))
    .where(and(eq(schema.jobSpecs.customerId, customerId), sql`${schema.jobSpecs.status} <> 'deleted'`));
  const jobs = await db
    .select({ job: schema.jobs })
    .from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .where(eq(schema.jobSpecs.customerId, customerId))
    .orderBy(desc(schema.jobs.date))
    .limit(100);
  const payments = await db.select().from(schema.payments).where(eq(schema.payments.customerId, customerId)).orderBy(desc(schema.payments.date));
  const adjustments = await db.select().from(schema.adjustments).where(eq(schema.adjustments.customerId, customerId)).orderBy(desc(schema.adjustments.date));
  const invoices = await db.select().from(schema.invoices).where(eq(schema.invoices.customerId, customerId)).orderBy(desc(schema.invoices.issuedOn));
  return { ...row[0], specs, jobs: jobs.map((j) => j.job), payments, adjustments, invoices };
}

export async function updateCustomer(accountId: string, customerId: string, raw: CustomerInput, today: string) {
  const c = customerInput.parse(raw);
  const errors = validateCustomer(c);
  if (errors.length) throw new ValidationError(errors);
  const existing = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
  if (!existing) throw new Error("Customer not found");
  await db.transaction(async (tx) => {
    await tx.update(schema.contacts).set({ ...c.contact, updatedAt: new Date() }).where(eq(schema.contacts.id, existing.contactId));
    const { contact: _c, ...rest } = c;
    await tx.update(schema.customers).set({
      ...rest, invoiceValueThreshold: rest.invoiceValueThreshold ?? null,
      paymentTermsType: rest.paymentTermsType ?? null, paymentTermsDays: rest.paymentTermsDays ?? null, updatedAt: new Date(),
    }).where(eq(schema.customers.id, customerId));
    await recomputeBalance(customerId, today, tx);
  });
}

/** Record a balance adjustment such as a bad-debt write-off (amount in the customer's favour). */
export async function addAdjustment(accountId: string, userId: string, customerId: string, type: string, amount: number, notes: string | null, today: string) {
  const owned = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
  if (!owned) throw new Error("Customer not found");
  await db.transaction(async (tx) => {
    await tx.insert(schema.adjustments).values({ accountId, customerId, date: today, type, amount, notes });
    await recomputeBalance(customerId, today, tx);
    await logActivity(tx, { accountId, userId, customerId, date: today, category: "adjustments", subcategory: type, summary: type.replace(/_/g, " "), amount });
  });
}

/** Anonymise personal data while keeping financial history. */
export async function anonymiseCustomer(accountId: string, customerId: string) {
  const c = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
  if (!c) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.contacts).set({
      title: null, firstNames: null, lastName: "Anonymised", company: null, address: null, postcode: null,
      phone1: null, phone2: null, phone3: null, email: null, emailCc: null, lat: null, lng: null,
    }).where(eq(schema.contacts.id, c.contactId));
    await tx.update(schema.customers).set({ anonymisedAt: new Date(), notes: null }).where(eq(schema.customers.id, customerId));
  });
}

export async function getJobSpec(accountId: string, id: string) {
  return db.query.jobSpecs.findFirst({ where: and(eq(schema.jobSpecs.id, id), eq(schema.jobSpecs.accountId, accountId)) });
}

/** Edit a job definition. Future to-do jobs pick up the new price and time. */
export async function updateJobSpec(accountId: string, userId: string, id: string, raw: JobSpecInput, today: string) {
  const j = jobSpecInput.parse(raw);
  const spec = await getJobSpec(accountId, id);
  if (!spec) throw new Error("Job not found");
  await assertOwnedRefs(accountId, j.roundId, j.taskId);
  await db.transaction(async (tx) => {
    let roundId = j.roundId ?? spec.roundId;
    if (!j.roundId && j.newRoundName) {
      const [round] = await tx.insert(schema.rounds).values({ accountId, name: j.newRoundName, userId }).returning();
      roundId = round!.id;
    }
    await tx.update(schema.jobSpecs).set({
      roundId, taskId: j.taskId ?? null, reference: j.reference, description: j.description, notes: j.notes,
      price: j.price, vatStatus: j.vatStatus, timeRequired: j.timeRequired, regularity: j.regularity,
      timesPerPeriod: j.timesPerPeriod, numPeriods: j.numPeriods, periodUnit: j.periodUnit,
      allowedDays: j.allowedDays, appointments: j.appointments, nextDueOn: j.firstDueOn ?? spec.nextDueOn,
      priceChangedOn: j.price !== spec.price ? today : spec.priceChangedOn, updatedAt: new Date(),
    }).where(eq(schema.jobSpecs.id, id));
    await tx.update(schema.jobs).set({ price: j.price, timeRequired: j.timeRequired, vatStatus: j.vatStatus })
      .where(and(eq(schema.jobs.jobSpecId, id), eq(schema.jobs.status, "to_do"), sql`${schema.jobs.date} >= ${today}`));
    if (j.price !== spec.price) {
      await logActivity(tx, { accountId, userId, customerId: spec.customerId, date: today, category: "job_value_changes", summary: "Price changed", amount: j.price - spec.price });
    }
  });
}

/** Suspend, reactivate or delete a job. Deleting removes its future to-do visits. */
export async function setJobSpecStatus(accountId: string, id: string, status: "active" | "suspended" | "deleted", today: string) {
  const spec = await getJobSpec(accountId, id);
  if (!spec) throw new Error("Job not found");
  await db.transaction(async (tx) => {
    await tx.update(schema.jobSpecs).set({ status, nextDueOn: status === "active" && !spec.nextDueOn ? today : spec.nextDueOn, updatedAt: new Date() })
      .where(eq(schema.jobSpecs.id, id));
    if (status !== "active") {
      await tx.delete(schema.jobs).where(and(eq(schema.jobs.jobSpecId, id), eq(schema.jobs.status, "to_do"), sql`${schema.jobs.date} >= ${today}`));
    }
  });
  return spec.customerId;
}
