import { and, asc, between, eq, inArray, isNull, sql } from "drizzle-orm";
import { addDays, formatPence, type IsoDate, type Pence } from "@rounds/domain";
import { db, schema } from "@/db";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { formatDay } from "@/lib/time";
import { contactName, firstAddressLine, jobGross } from "./ledger";

export const JOB_SHEET_STATUSES = {
  all: "All jobs",
  to_do: "Jobs to do",
  to_be_confirmed: "Jobs to be confirmed",
  done: "Jobs done",
  done_requiring_payment: "Jobs done requiring payment",
  to_invoice: "Jobs to invoice",
  skipped: "Jobs skipped",
  cash_in_debt: "Cash customers in debt",
  not_prepaid: "Customers not prepaid",
} as const;
export type JobSheetStatus = keyof typeof JOB_SHEET_STATUSES;

/** Customers who settle up at the door rather than by invoice or direct debit. */
const CASH_METHODS = ["on_day", "card", "collection"];
const INVOICED_METHODS = ["email_invoice", "paper_invoice"];

export interface JobSheetRow {
  jobId: string;
  customerId: string;
  date: IsoDate;
  status: string;
  confirmed: boolean | null;
  name: string;
  address: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  roundName: string | null;
  gross: Pence;
  timeRequired: number;
  notes: string | null;
  paymentMethod: string;
  balance: Pence;
  paidAmount: Pence;
  invoiced: boolean;
}

export interface JobSheetDay {
  date: IsoDate;
  rows: JobSheetRow[];
  topNotes: string | null;
  bottomNotes: string | null;
  totalValue: Pence;
  totalMinutes: number;
}

export interface JobSheetQuery {
  start: IsoDate;
  days: number;
  status?: JobSheetStatus;
  /** Only jobs assigned to this user; omit for everyone's. */
  userId?: string | null;
}

export function clampDays(n: unknown) {
  const d = Math.trunc(Number(n));
  return Number.isFinite(d) ? Math.min(14, Math.max(1, d)) : 1;
}

export function matchesStatus(r: JobSheetRow, status: JobSheetStatus): boolean {
  switch (status) {
    case "all": return true;
    case "to_do": return r.status === "to_do";
    case "to_be_confirmed": return r.status === "to_do" && r.confirmed === false;
    case "done": return r.status === "done";
    case "done_requiring_payment": return r.status === "done" && r.paidAmount < r.gross && !INVOICED_METHODS.includes(r.paymentMethod) && r.paymentMethod !== "direct_debit";
    case "to_invoice": return r.status === "done" && !r.invoiced && INVOICED_METHODS.includes(r.paymentMethod);
    case "skipped": return r.status === "skipped";
    case "cash_in_debt": return CASH_METHODS.includes(r.paymentMethod) && r.balance < 0;
    case "not_prepaid": return r.status === "to_do" && r.balance < r.gross;
  }
}

/** Planned jobs for a user (or everyone) over 1-14 days, with day notes and totals. */
export async function jobSheet(accountId: string, q: JobSheetQuery): Promise<JobSheetDay[]> {
  const days = clampDays(q.days);
  const end = addDays(q.start, days - 1);
  const status = q.status ?? "all";
  const rows = await db
    .select({
      job: schema.jobs, spec: schema.jobSpecs, customer: schema.customers, contact: schema.contacts,
      jobAddress: sql<string | null>`jc.address`, round: schema.rounds,
    })
    .from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .leftJoin(sql`contacts jc`, sql`jc.id = ${schema.jobSpecs.jobContactId}`)
    .leftJoin(schema.rounds, eq(schema.rounds.id, schema.jobSpecs.roundId))
    .where(and(
      eq(schema.jobs.accountId, accountId), between(schema.jobs.date, q.start, end),
      q.userId ? eq(schema.jobs.userId, q.userId) : undefined,
    ))
    .orderBy(asc(schema.jobs.date), asc(schema.jobs.dayOrder), asc(schema.rounds.name), asc(schema.jobSpecs.roundIndex));

  const jobIds = rows.map((r) => r.job.id);
  const paid = new Map<string, number>();
  if (jobIds.length) {
    const ps = await db.select({ jobId: schema.payments.jobId, paid: sql<number>`sum(${schema.payments.paid})::int` })
      .from(schema.payments)
      .where(and(inArray(schema.payments.jobId, jobIds), sql`${schema.payments.status} <> 'failed'`))
      .groupBy(schema.payments.jobId);
    for (const p of ps) if (p.jobId) paid.set(p.jobId, p.paid);
  }

  const notes = await db.select().from(schema.dayNotes).where(and(
    eq(schema.dayNotes.accountId, accountId), between(schema.dayNotes.date, q.start, end),
    q.userId ? eq(schema.dayNotes.userId, q.userId) : isNull(schema.dayNotes.userId),
  ));

  const sheet: JobSheetDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(q.start, i);
    const n = notes.find((x) => x.date === date);
    sheet.push({ date, rows: [], topNotes: n?.topNotes ?? null, bottomNotes: n?.bottomNotes ?? null, totalValue: 0, totalMinutes: 0 });
  }
  for (const { job, spec, customer, contact, jobAddress, round } of rows) {
    const address = jobAddress ?? contact.address ?? "";
    const row: JobSheetRow = {
      jobId: job.id, customerId: customer.id, date: job.date, status: job.status, confirmed: job.confirmed,
      name: [firstAddressLine({ address, company: contact.company }), spec.reference].filter(Boolean).join(" "),
      address: [address.replace(/\n/g, ", "), contact.postcode].filter(Boolean).join(", "),
      customerName: contactName(contact),
      phone: contact.phone1 || contact.phone2 || contact.phone3 || null,
      email: contact.email,
      roundName: round?.name ?? null,
      gross: jobGross(job), timeRequired: job.timeRequired,
      notes: [job.notes, spec.notes].filter(Boolean).join(" · ") || null,
      paymentMethod: customer.paymentMethod, balance: customer.balance,
      paidAmount: paid.get(job.id) ?? 0, invoiced: job.invoiceId != null,
    };
    if (!matchesStatus(row, status)) continue;
    const day = sheet.find((d) => d.date === job.date)!;
    day.rows.push(row);
    day.totalValue += row.gross;
    day.totalMinutes += row.timeRequired;
  }
  return sheet;
}

/** Save (or clear) the top and bottom notes for one day of a job sheet. */
export async function saveDayNotes(accountId: string, userId: string | null, date: IsoDate, topNotes: string | null, bottomNotes: string | null) {
  const where = and(eq(schema.dayNotes.accountId, accountId), eq(schema.dayNotes.date, date),
    userId ? eq(schema.dayNotes.userId, userId) : isNull(schema.dayNotes.userId));
  const existing = await db.select({ id: schema.dayNotes.id }).from(schema.dayNotes).where(where).limit(1);
  const top = topNotes?.trim() || null;
  const bottom = bottomNotes?.trim() || null;
  if (existing[0]) {
    if (!top && !bottom) await db.delete(schema.dayNotes).where(eq(schema.dayNotes.id, existing[0].id));
    else await db.update(schema.dayNotes).set({ topNotes: top, bottomNotes: bottom, updatedAt: new Date() }).where(eq(schema.dayNotes.id, existing[0].id));
  } else if (top || bottom) {
    await db.insert(schema.dayNotes).values({ accountId, userId, date, topNotes: top, bottomNotes: bottom });
  }
}

/** Plain-text job sheet for emailing. */
export function jobSheetText(sheet: JobSheetDay[], heading: string): string {
  const lines = [heading, ""];
  for (const d of sheet) {
    lines.push(`== ${formatDay(d.date)} ==`);
    if (d.topNotes) lines.push(d.topNotes, "");
    if (d.rows.length === 0) lines.push("No jobs.");
    d.rows.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.name} - ${r.customerName}${r.phone ? ` (${r.phone})` : ""}`);
      lines.push(`   ${r.address}`);
      lines.push(`   ${formatPence(r.gross)} · ${PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}${r.balance < 0 ? ` · owes ${formatPence(-r.balance)}` : ""}`);
      if (r.notes) lines.push(`   Note: ${r.notes}`);
    });
    lines.push(`Total: ${formatPence(d.totalValue)} · ${d.rows.length} job(s) · ${Math.floor(d.totalMinutes / 60)}h ${d.totalMinutes % 60}m`);
    if (d.bottomNotes) lines.push("", d.bottomNotes);
    lines.push("");
  }
  return lines.join("\n");
}
