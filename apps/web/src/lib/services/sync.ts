/**
 * Offline sync for the mobile app (/m).
 *
 * The device sends an ordered list of changes it made while (possibly) offline.
 * Each change is applied through the normal services, so the same business rules
 * hold as on the desktop. Changes are idempotent by their client-generated id:
 * the webhook_events table (provider "sync", id "sync:<clientId>") is the ledger
 * of applied changes. The response carries a full snapshot of what the device
 * needs, scoped to the user's account (and rounds, for staff with rounds).
 */
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { can, netFromGross, type IsoDate, type Permission, type PermissionSet } from "@rounds/domain";
import { db, schema } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { PAY_METHODS } from "@/lib/format";
import { addDays } from "@/lib/time";
import { recordPayment } from "./debts";
import { contactName, firstAddressLine, jobGross } from "./ledger";
import { addJobToDay, completeJob, dueJobs, moveJob, plannerRange } from "./planning";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clientId = z.string().min(8).max(100);
const pence = z.number().int().min(-10_000_000).max(10_000_000);
const method = z.string().refine((m) => m in PAY_METHODS, "Unknown payment method");

export const EXPENSE_VAT_STATUSES = ["inc_at_rate", "no_vat", "zero_rated", "exempt"] as const;

const completeInput = z.object({
  status: z.enum(["done", "not_done", "skipped", "to_do"]),
  paid: pence.optional(),
  includesTip: z.boolean().optional(),
  tip: pence.optional(),
  method: method.optional(),
  reference: z.string().max(200).nullable().optional(),
  price: z.number().int().min(0).max(10_000_000).optional(),
  permanent: z.boolean().optional(),
  confirmed: z.boolean().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  planNext: z.object({ mode: z.enum(["no", "on_date", "auto"]), date: isoDate.optional() }).optional(),
});

/** A job id from the device: a server uuid, or `local:<clientId>` of an add_job change. */
const jobRef = z.string().min(1).max(120);

export const changeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("complete_job"), clientId, jobId: jobRef, input: completeInput }),
  z.object({ type: z.literal("add_job"), clientId, jobSpecId: z.string().uuid(), date: isoDate }),
  z.object({ type: z.literal("move_job"), clientId, jobId: jobRef, date: isoDate }),
  z.object({
    type: z.literal("payment"), clientId, customerId: z.string().uuid(), paidPence: pence, method,
    reference: z.string().max(200).nullable().optional(), date: isoDate.optional(),
  }),
  z.object({
    type: z.literal("expense"), clientId, date: isoDate, categoryName: z.string().trim().min(1).max(100),
    amountPence: z.number().int().min(0).max(10_000_000), vatStatus: z.enum(EXPENSE_VAT_STATUSES),
    method: z.string().max(40).nullable().optional(), description: z.string().max(500).nullable().optional(),
  }),
  z.object({
    type: z.literal("mileage"), clientId, vehicleId: z.string().uuid(), date: isoDate,
    start: z.number().int().min(0).max(10_000_000), finish: z.number().int().min(0).max(10_000_000),
  }),
]);

export type Change = z.infer<typeof changeSchema>;
export type ChangeResult = {
  clientId: string;
  ok: boolean;
  error?: string;
  /** The change was seen but is still being applied by another request: keep it and resend. */
  retry?: boolean;
  /** For add_job: the server id of the created job. */
  jobId?: string;
};

export interface SyncRequest {
  cursor?: string;
  changes: unknown[];
}

export interface SnapshotJob {
  id: string;
  jobSpecId: string;
  customerId: string;
  date: IsoDate;
  status: string;
  apptType: string;
  confirmed: boolean | null;
  name: string;
  customerName: string;
  roundName: string | null;
  price: number;
  gross: number;
  vatStatus: string;
  vatRate: number;
  timeRequired: number;
  paid: boolean;
  notes: string | null;
  allowed: boolean;
  dayOrder: number | null;
}

export interface SnapshotDue {
  jobSpecId: string;
  customerId: string;
  name: string;
  customerName: string;
  roundName: string | null;
  nextDueOn: IsoDate | null;
  status: string;
  price: number;
  gross: number;
  vatStatus: string;
  vatRate: number;
  lateness: number | null;
}

export interface SnapshotCustomer {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  balance: number;
  debtSince: IsoDate | null;
  paymentMethod: string;
}

export interface Snapshot {
  today: IsoDate;
  settings: {
    businessName: string;
    userName: string;
    permissions: Permission[];
    collectsVat: boolean;
    vatRate: number;
    defaultPaid: "job_price" | "debt_balance";
  };
  rounds: { id: string; name: string }[];
  tasks: { id: string; name: string; price: number | null }[];
  vehicles: { id: string; name: string; registration: string | null }[];
  expenseCategories: { id: string; name: string }[];
  window: { start: IsoDate; end: IsoDate };
  jobs: SnapshotJob[];
  due: SnapshotDue[];
  customers: SnapshotCustomer[];
}

export interface SyncResponse {
  results: ChangeResult[];
  snapshot: Snapshot;
  cursor: string;
}

type SyncUser = Pick<CurrentUser, "id" | "accountId" | "isOwner" | "permissions">;

export class PermissionError extends Error {}

function need(perms: PermissionSet, p: Permission) {
  if (!can(perms, p)) throw new PermissionError("You do not have permission to do that");
}

/** Apply the device's changes in order, then return a fresh snapshot. */
export async function sync(user: SyncUser & Pick<CurrentUser, "name" | "businessName">, req: SyncRequest, today: IsoDate): Promise<SyncResponse> {
  need(user.permissions, "access_via_mobile");
  const results: ChangeResult[] = [];
  for (const raw of req.changes) results.push(await applyRawChange(user, raw, today));
  const snapshot = await buildSnapshot(user, today);
  return { results, snapshot, cursor: new Date().toISOString() };
}

const LEDGER = "sync";
const STALE_MS = 5 * 60_000;
const ledgerId = (cid: string) => `${LEDGER}:${cid}`;

export async function applyRawChange(user: SyncUser, raw: unknown, today: IsoDate): Promise<ChangeResult> {
  const parsed = changeSchema.safeParse(raw);
  const cid = typeof (raw as { clientId?: unknown })?.clientId === "string" ? (raw as { clientId: string }).clientId : "";
  if (!parsed.success) return { clientId: cid, ok: false, error: "Invalid change" };
  const change = parsed.data;

  // Claim the change in the idempotency ledger.
  const id = ledgerId(change.clientId);
  const claimed = await db.insert(schema.webhookEvents)
    .values({ id, provider: LEDGER, accountId: user.accountId, payload: { change } })
    .onConflictDoNothing().returning({ id: schema.webhookEvents.id });
  if (claimed.length === 0) {
    const prior = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, id) });
    if (!prior || prior.accountId !== user.accountId) return { clientId: change.clientId, ok: false, error: "Duplicate change id" };
    if (prior.processedAt) return { ...storedResult(prior.payload), clientId: change.clientId, ok: !prior.error, ...(prior.error ? { error: prior.error } : {}) };
    // Unfinished: another request is applying it, or it crashed. Reclaim only when stale.
    if (Date.now() - prior.createdAt.getTime() < STALE_MS) return { clientId: change.clientId, ok: false, retry: true, error: "Still being applied" };
    const reclaimed = await db.update(schema.webhookEvents).set({ createdAt: new Date() })
      .where(and(eq(schema.webhookEvents.id, id), isNull(schema.webhookEvents.processedAt), lt(schema.webhookEvents.createdAt, new Date(Date.now() - STALE_MS))))
      .returning({ id: schema.webhookEvents.id });
    if (reclaimed.length === 0) return { clientId: change.clientId, ok: false, retry: true, error: "Still being applied" };
  }

  let result: ChangeResult;
  try {
    const extra = await applyChange(user, change, today);
    result = { clientId: change.clientId, ok: true, ...extra };
  } catch (e) {
    result = { clientId: change.clientId, ok: false, error: e instanceof Error ? e.message : "Could not apply change" };
  }
  await db.update(schema.webhookEvents)
    .set({ processedAt: new Date(), error: result.error ?? null, payload: { change, result: { jobId: result.jobId } } })
    .where(eq(schema.webhookEvents.id, id));
  return result;
}

function storedResult(payload: unknown): { jobId?: string } {
  const jobId = (payload as { result?: { jobId?: string } } | null)?.result?.jobId;
  return jobId ? { jobId } : {};
}

/** Resolve `local:<clientId>` (a job created offline by an add_job change) to its server id. */
async function resolveJobId(accountId: string, ref: string): Promise<string> {
  if (!ref.startsWith("local:")) {
    if (!z.string().uuid().safeParse(ref).success) throw new Error("Job not found");
    return ref;
  }
  const prior = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, ledgerId(ref.slice(6))) });
  const jobId = prior && prior.accountId === accountId ? storedResult(prior.payload).jobId : undefined;
  if (!jobId) throw new Error("Job not found");
  return jobId;
}

async function applyChange(user: SyncUser, change: Change, today: IsoDate): Promise<{ jobId?: string }> {
  const { accountId, id: userId, permissions: perms } = user;
  switch (change.type) {
    case "complete_job": {
      need(perms, "edit_jobs");
      const jobId = await resolveJobId(accountId, change.jobId);
      const job = await db.query.jobs.findFirst({ where: and(eq(schema.jobs.id, jobId), eq(schema.jobs.accountId, accountId)) });
      if (!job) throw new Error("Job not found");
      await assertInScope(user, job.jobSpecId);
      const input = change.input;
      if ((input.price !== undefined && input.price !== job.price) || input.permanent) {
        if (!can(perms, "adjust_prices")) throw new PermissionError("You do not have permission to change prices");
      }
      if ((input.paid ?? 0) !== 0 || (input.tip ?? 0) !== 0) need(perms, "enter_payments");
      await completeJob(accountId, userId, jobId, input, today);
      return { jobId };
    }
    case "add_job": {
      need(perms, "add_jobs");
      await assertInScope(user, change.jobSpecId);
      const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
      const job = await addJobToDay(accountId, userId, change.jobSpecId, change.date, account?.collectsVat ? account.vatRate : 0);
      return { jobId: job.id };
    }
    case "move_job": {
      need(perms, "move_jobs");
      const jobId = await resolveJobId(accountId, change.jobId);
      const job = await db.query.jobs.findFirst({ where: and(eq(schema.jobs.id, jobId), eq(schema.jobs.accountId, accountId)) });
      if (!job) throw new Error("Job not found");
      await assertInScope(user, job.jobSpecId);
      if (job.status !== "to_do" && job.status !== "estimate") throw new Error("Only jobs still to do can be moved");
      await moveJob(accountId, jobId, change.date);
      return { jobId };
    }
    case "payment": {
      need(perms, "enter_payments");
      if (change.paidPence === 0) throw new Error("Enter an amount");
      await recordPayment(accountId, userId, change.customerId, {
        paid: change.paidPence, method: change.method, reference: change.reference ?? null, date: change.date ?? today,
      });
      return {};
    }
    case "expense": {
      need(perms, "record_expenses");
      const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
      const categoryId = await findOrCreateCategory(accountId, change.categoryName);
      const rate = account?.vatRate ?? 0.2;
      const vatCharged = change.vatStatus === "inc_at_rate" ? change.amountPence - netFromGross(change.amountPence, rate) : 0;
      const reclaimableVat = account?.collectsVat ? vatCharged : 0;
      await db.insert(schema.expenses).values({
        accountId, date: change.date, categoryId, description: change.description || null, amount: change.amountPence,
        vatStatus: change.vatStatus, vatRate: change.vatStatus === "inc_at_rate" ? rate : 0, vatCharged,
        method: change.method || null, reclaimableVat, allowable: change.amountPence - reclaimableVat,
      });
      return {};
    }
    case "mileage": {
      need(perms, "record_expenses");
      if (change.finish < change.start) throw new Error("Finish mileage is before the start");
      const vehicle = await db.query.vehicles.findFirst({ where: and(eq(schema.vehicles.id, change.vehicleId), eq(schema.vehicles.accountId, accountId)) });
      if (!vehicle) throw new Error("Vehicle not found");
      await db.insert(schema.mileages).values({ accountId, vehicleId: vehicle.id, date: change.date, start: change.start, finish: change.finish });
      return {};
    }
  }
}

async function findOrCreateCategory(accountId: string, name: string): Promise<string> {
  const existing = await db.query.expenseCategories.findFirst({
    where: and(eq(schema.expenseCategories.accountId, accountId), sql`lower(${schema.expenseCategories.name}) = lower(${name})`),
  });
  if (existing) return existing.id;
  const [created] = await db.insert(schema.expenseCategories).values({ accountId, name }).returning({ id: schema.expenseCategories.id });
  return created!.id;
}

/**
 * Staff who have rounds assigned to them only see and change jobs on those
 * rounds. Owners, administrators and users without assigned rounds see all.
 */
async function roundScope(user: SyncUser): Promise<{ roundIds: Set<string>; specIds: Set<string> } | null> {
  if (user.isOwner || user.permissions.has("administrator")) return null;
  const mine = await db.select({ id: schema.rounds.id }).from(schema.rounds)
    .where(and(eq(schema.rounds.accountId, user.accountId), eq(schema.rounds.userId, user.id)));
  if (mine.length === 0) return null;
  const roundIds = new Set(mine.map((r) => r.id));
  const specs = await db.select({ id: schema.jobSpecs.id }).from(schema.jobSpecs)
    .where(and(eq(schema.jobSpecs.accountId, user.accountId), inArray(schema.jobSpecs.roundId, [...roundIds])));
  return { roundIds, specIds: new Set(specs.map((s) => s.id)) };
}

async function assertInScope(user: SyncUser, jobSpecId: string) {
  const scope = await roundScope(user);
  if (scope && !scope.specIds.has(jobSpecId)) throw new PermissionError("That job is not on your rounds");
}

export const WINDOW_BEFORE = 7;
export const WINDOW_AFTER = 21;

export async function buildSnapshot(user: SyncUser & Pick<CurrentUser, "name" | "businessName">, today: IsoDate): Promise<Snapshot> {
  const { accountId } = user;
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  if (!account) throw new Error("Account not found");
  const vatRate = account.collectsVat ? account.vatRate : 0;
  const start = addDays(today, -WINDOW_BEFORE);
  const end = addDays(today, WINDOW_AFTER);
  const scope = await roundScope(user);
  const inScope = (specId: string) => !scope || scope.specIds.has(specId);

  const [byDate, due, rounds, tasks, vehicles, categories] = await Promise.all([
    plannerRange(accountId, start, end),
    dueJobs(accountId, today, account.settings.addJobsOrder ?? "next_due"),
    db.select({ id: schema.rounds.id, name: schema.rounds.name }).from(schema.rounds).where(eq(schema.rounds.accountId, accountId)).orderBy(schema.rounds.name),
    db.select({ id: schema.tasks.id, name: schema.tasks.name, price: schema.tasks.price }).from(schema.tasks).where(eq(schema.tasks.accountId, accountId)).orderBy(schema.tasks.name),
    db.select({ id: schema.vehicles.id, name: schema.vehicles.name, registration: schema.vehicles.registration }).from(schema.vehicles).where(eq(schema.vehicles.accountId, accountId)).orderBy(schema.vehicles.name),
    db.select({ id: schema.expenseCategories.id, name: schema.expenseCategories.name }).from(schema.expenseCategories)
      .where(and(eq(schema.expenseCategories.accountId, accountId), eq(schema.expenseCategories.enabled, true))).orderBy(schema.expenseCategories.name),
  ]);

  const planned = [...byDate.values()].flat().filter((j) => !j.projected && inScope(j.jobSpecId));
  const vat = new Map(
    planned.length
      ? (await db.select({ id: schema.jobs.id, vatStatus: schema.jobs.vatStatus, vatRate: schema.jobs.vatRate }).from(schema.jobs)
        .where(inArray(schema.jobs.id, planned.map((j) => j.id)))).map((r) => [r.id, r] as const)
      : [],
  );
  const jobs: SnapshotJob[] = planned.map((j) => ({
    id: j.id, jobSpecId: j.jobSpecId, customerId: j.customerId, date: j.date, status: j.status, apptType: j.apptType,
    confirmed: j.confirmed, name: j.name, customerName: j.customerName, roundName: j.roundName, price: j.price, gross: j.gross,
    vatStatus: vat.get(j.id)?.vatStatus ?? "inc_vat", vatRate: vat.get(j.id)?.vatRate ?? 0,
    timeRequired: j.timeRequired, paid: j.paid, notes: j.notes, allowed: j.allowed, dayOrder: j.dayOrder,
  }));

  const dueList: SnapshotDue[] = due.filter((d) => inScope(d.spec.id)).map((d) => {
    const rate = d.spec.vatStatus === "inc_vat" || d.spec.vatStatus === "ex_vat" ? vatRate : 0;
    return {
      jobSpecId: d.spec.id, customerId: d.spec.customerId, name: d.name, customerName: d.customerName,
      roundName: d.round?.name ?? null, nextDueOn: d.spec.nextDueOn, status: d.spec.status, price: d.spec.price,
      gross: jobGross({ price: d.spec.price, vatStatus: d.spec.vatStatus, vatRate: rate }), vatStatus: d.spec.vatStatus, vatRate: rate,
      lateness: d.lateness == null ? null : Math.round(d.lateness * 100) / 100,
    };
  });

  const customerIds = [...new Set([...jobs.map((j) => j.customerId), ...dueList.map((d) => d.customerId)])];
  const withDebts = can(user.permissions, "access_debt_list");
  const customerRows = customerIds.length || withDebts
    ? await db.select({ customer: schema.customers, contact: schema.contacts }).from(schema.customers)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
      .where(and(eq(schema.customers.accountId, accountId), isNull(schema.customers.deletedAt),
        or(customerIds.length ? inArray(schema.customers.id, customerIds) : undefined, withDebts ? lt(schema.customers.balance, 0) : undefined)))
    : [];
  const customers: SnapshotCustomer[] = customerRows.map(({ customer, contact }) => ({
    id: customer.id, name: contactName(contact), address: firstAddressLine(contact) + (contact.postcode ? `, ${contact.postcode}` : ""),
    phone: contact.phone1, balance: customer.balance, debtSince: customer.debtSince, paymentMethod: customer.paymentMethod,
  }));

  return {
    today,
    settings: {
      businessName: account.businessName, userName: user.name, permissions: [...user.permissions].sort(),
      collectsVat: account.collectsVat, vatRate, defaultPaid: account.settings.defaultPaid ?? "job_price",
    },
    rounds: scope ? rounds.filter((r) => scope.roundIds.has(r.id)) : rounds,
    tasks, vehicles, expenseCategories: categories,
    window: { start, end }, jobs, due: dueList, customers,
  };
}
