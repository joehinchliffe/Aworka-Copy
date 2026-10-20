import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { addDays, addMonths, type IsoDate } from "@rounds/domain";
import { db, schema } from "@/db";
import { anonymiseCustomer } from "./customers";
import { getAccount, retentionRule, type RetentionRule } from "./settings";

/** The date before which records fall under a rule (today minus N weeks/months/years). */
export function retentionCutoff(today: IsoDate, rule: Pick<RetentionRule, "num" | "unit">): IsoDate {
  if (rule.unit === "week") return addDays(today, -7 * rule.num);
  if (rule.unit === "month") return addMonths(today, -rule.num);
  return addMonths(today, -12 * rule.num);
}

export interface RetentionResult {
  suspendedRegular: number;
  suspendedOnRequest: number;
  deletedJobs: number;
  deletedEstimates: number;
  anonymisedCustomers: number;
  anonymisedInvoices: number;
}

const js = schema.jobSpecs;

/**
 * Apply the account's six customer data retention rules as at `today`.
 * Each rule is independent and off unless enabled in settings. Suspension and
 * deletion change job_specs.status; the time a job was suspended or deleted is
 * taken from its updatedAt. Safe to run repeatedly (nightly).
 */
export async function runRetention(accountId: string, today: IsoDate): Promise<RetentionResult> {
  const account = await getAccount(accountId);
  const s = account.settings;
  const out: RetentionResult = { suspendedRegular: 0, suspendedOnRequest: 0, deletedJobs: 0, deletedEstimates: 0, anonymisedCustomers: 0, anonymisedInvoices: 0 };
  const now = new Date();

  // 1. Suspend regular jobs overdue by more than the period.
  const r1 = retentionRule(s, "suspendRegular");
  if (r1.enabled) {
    const rows = await db.update(js).set({ status: "suspended", updatedAt: now })
      .where(and(eq(js.accountId, accountId), eq(js.status, "active"), eq(js.regularity, "regularly"), lt(js.nextDueOn, retentionCutoff(today, r1))))
      .returning({ id: js.id });
    out.suspendedRegular = rows.length;
  }

  // 2. Suspend on-request jobs that have not been requested (done) for the period.
  const r2 = retentionRule(s, "suspendOnRequest");
  if (r2.enabled) {
    const rows = await db.update(js).set({ status: "suspended", updatedAt: now })
      .where(and(eq(js.accountId, accountId), eq(js.status, "active"), eq(js.regularity, "on_request"),
        sql`coalesce(${js.lastDoneOn}, ${js.createdAt}::date) < ${retentionCutoff(today, r2)}`))
      .returning({ id: js.id });
    out.suspendedOnRequest = rows.length;
  }

  // 3. Delete jobs suspended for the period, and one-off jobs completed that long ago.
  const r3 = retentionRule(s, "deleteSuspended");
  if (r3.enabled) {
    const cutoff = retentionCutoff(today, r3);
    const rows = await db.update(js).set({ status: "deleted", updatedAt: now })
      .where(and(eq(js.accountId, accountId), sql`(
        (${js.status} = 'suspended' and ${js.updatedAt}::date < ${cutoff})
        or (${js.status} = 'active' and ${js.regularity} = 'one_off' and ${js.nextDueOn} is null and ${js.lastDoneOn} < ${cutoff}
            and not exists (select 1 from jobs j where j.job_spec_id = ${js.id} and j.status = 'to_do'))
      )`))
      .returning({ id: js.id });
    out.deletedJobs = rows.length;
  }

  // 4. Delete estimates never converted to a job.
  const r4 = retentionRule(s, "deleteEstimates");
  if (r4.enabled) {
    const rows = await db.update(js).set({ status: "deleted", updatedAt: now })
      .where(and(eq(js.accountId, accountId), eq(js.status, "estimate"), sql`${js.createdAt}::date < ${retentionCutoff(today, r4)}`))
      .returning({ id: js.id });
    out.deletedEstimates = rows.length;
  }

  // 5. Anonymise customers deleted (or left with only deleted jobs) for the period.
  //    Customers who still owe money are kept so the debt can be collected.
  const r5 = retentionRule(s, "anonymiseDeleted");
  if (r5.enabled) {
    const cutoff = retentionCutoff(today, r5);
    const c = schema.customers;
    const rows = await db.select({ id: c.id }).from(c).where(and(
      eq(c.accountId, accountId), isNull(c.anonymisedAt), sql`${c.balance} >= 0`,
      sql`(
        ${c.deletedAt}::date < ${cutoff}
        or (exists (select 1 from job_specs s where s.customer_id = ${c.id})
            and not exists (select 1 from job_specs s where s.customer_id = ${c.id} and (s.status <> 'deleted' or s.updated_at::date >= ${cutoff})))
      )`,
    ));
    for (const r of rows) await anonymiseCustomer(accountId, r.id);
    out.anonymisedCustomers = rows.length;
  }

  // 6. Anonymise old invoices: drop notes, replace line descriptions, revoke the online link.
  const r6 = retentionRule(s, "anonymiseInvoices");
  if (r6.enabled) {
    const inv = schema.invoices;
    const rows = await db.update(inv).set({
      notes: null,
      lines: sql`coalesce((select jsonb_agg(l || '{"description":"Services"}'::jsonb) from jsonb_array_elements(${inv.lines}) l), '[]'::jsonb)`,
      viewToken: sql`replace(gen_random_uuid()::text, '-', '')`,
      updatedAt: now,
    }).where(and(eq(inv.accountId, accountId), lt(inv.issuedOn, retentionCutoff(today, r6)), sql`(
      ${inv.notes} is not null
      or exists (select 1 from jsonb_array_elements(${inv.lines}) l where l->>'description' is distinct from 'Services')
    )`)).returning({ id: inv.id });
    out.anonymisedInvoices = rows.length;
  }

  return out;
}

/** Run retention for every account (for the nightly scheduler). */
export async function runRetentionForAll(today: IsoDate) {
  const accounts = await db.select({ id: schema.accounts.id }).from(schema.accounts);
  const results: Record<string, RetentionResult> = {};
  for (const a of accounts) results[a.id] = await runRetention(a.id, today);
  return results;
}
