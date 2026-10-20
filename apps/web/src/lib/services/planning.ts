import { and, asc, between, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  haversine, optimiseRoute, type Point,
  addDays, lateness, nextDueDate, projectOccurrences, splitTip, type IsoDate, type Recurrence,
} from "@rounds/domain";
import { db, schema } from "@/db";
import { contactName, firstAddressLine, jobGross, logActivity, recomputeBalance } from "./ledger";
import { maybeAutoInvoice } from "./invoicing";

type Spec = typeof schema.jobSpecs.$inferSelect;

export function recurrenceOf(spec: Spec): Recurrence {
  return {
    regularity: spec.regularity as Recurrence["regularity"],
    timesPerPeriod: spec.timesPerPeriod,
    numPeriods: spec.numPeriods,
    periodUnit: spec.periodUnit as Recurrence["periodUnit"],
    allowedDays: spec.allowedDays,
    monthRule: (spec.monthRule as Recurrence["monthRule"]) ?? undefined,
  };
}

export interface PlannerJob {
  id: string;
  jobSpecId: string;
  customerId: string;
  date: IsoDate;
  status: string;
  apptType: string;
  confirmed: boolean | null;
  projected: boolean;
  name: string;
  customerName: string;
  roundName: string | null;
  price: number;
  gross: number;
  timeRequired: number;
  paid: boolean;
  notes: string | null;
  allowed: boolean;
  dayOrder: number | null;
}

/** All jobs (planned and projected) for a date range, grouped by date. */
export async function plannerRange(accountId: string, start: IsoDate, end: IsoDate, opts: { showFuture?: boolean; roundId?: string } = {}) {
  const planned = await db
    .select({ job: schema.jobs, spec: schema.jobSpecs, contact: schema.contacts, jobContact: sql<string | null>`jc.address`, round: schema.rounds })
    .from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .leftJoin(sql`contacts jc`, sql`jc.id = ${schema.jobSpecs.jobContactId}`)
    .leftJoin(schema.rounds, eq(schema.rounds.id, schema.jobSpecs.roundId))
    .where(and(eq(schema.jobs.accountId, accountId), between(schema.jobs.date, start, end),
      opts.roundId ? eq(schema.jobSpecs.roundId, opts.roundId) : undefined))
    .orderBy(asc(schema.jobs.date), asc(schema.jobs.dayOrder), asc(schema.rounds.name), asc(schema.jobSpecs.roundIndex));

  const jobIds = planned.map((p) => p.job.id);
  const paidJobIds = new Set(
    jobIds.length
      ? (await db.select({ jobId: schema.payments.jobId }).from(schema.payments).where(and(inArray(schema.payments.jobId, jobIds), sql`${schema.payments.paid} > 0`))).map((p) => p.jobId)
      : [],
  );

  const out: PlannerJob[] = planned.map(({ job, spec, contact, jobContact, round }) => ({
    id: job.id, jobSpecId: spec.id, customerId: spec.customerId, date: job.date, status: job.status,
    apptType: job.apptType, confirmed: job.confirmed, projected: false,
    name: [firstAddressLine({ address: jobContact ?? contact.address, company: contact.company }), spec.reference].filter(Boolean).join(" "),
    customerName: contactName(contact), roundName: round?.name ?? null, price: job.price, gross: jobGross(job),
    timeRequired: job.timeRequired, paid: paidJobIds.has(job.id),
    notes: job.notes, allowed: (spec.allowedDays & (1 << new Date(job.date + "T00:00:00Z").getUTCDay())) !== 0,
    dayOrder: job.dayOrder,
  }));

  if (opts.showFuture) {
    const plannedKeys = new Set(planned.map((p) => `${p.spec.id}:${p.job.date}`));
    const specsWithFutureJob = new Set(planned.filter((p) => p.job.status === "to_do").map((p) => p.spec.id));
    const specs = await db
      .select({ spec: schema.jobSpecs, contact: schema.contacts, round: schema.rounds })
      .from(schema.jobSpecs)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
      .leftJoin(schema.rounds, eq(schema.rounds.id, schema.jobSpecs.roundId))
      .where(and(eq(schema.jobSpecs.accountId, accountId), eq(schema.jobSpecs.status, "active"), eq(schema.jobSpecs.regularity, "regularly"),
        opts.roundId ? eq(schema.jobSpecs.roundId, opts.roundId) : undefined));
    for (const { spec, contact, round } of specs) {
      if (!spec.nextDueOn) continue;
      const from = specsWithFutureJob.has(spec.id) ? nextDueDate(recurrenceOf(spec), spec.nextDueOn) : spec.nextDueOn;
      if (!from) continue;
      for (const d of projectOccurrences(recurrenceOf(spec), from, start, end)) {
        if (plannedKeys.has(`${spec.id}:${d}`)) continue;
        out.push({
          id: `future:${spec.id}:${d}`, jobSpecId: spec.id, customerId: spec.customerId, date: d, status: "to_do", apptType: "auto",
          confirmed: null, projected: true, name: [firstAddressLine(contact), spec.reference].filter(Boolean).join(" "),
          customerName: contactName(contact), roundName: round?.name ?? null, price: spec.price,
          gross: spec.price, timeRequired: spec.timeRequired, paid: false, notes: spec.notes, allowed: true, dayOrder: null,
        });
      }
    }
  }
  const byDate = new Map<IsoDate, PlannerJob[]>();
  for (const j of out) {
    const list = byDate.get(j.date) ?? [];
    list.push(j);
    byDate.set(j.date, list);
  }
  return byDate;
}

/** Jobs that could be added to `date`, most overdue first (or in round order). */
export async function dueJobs(accountId: string, date: IsoDate, order: "next_due" | "round_order" = "next_due", roundId?: string) {
  const rows = await db
    .select({ spec: schema.jobSpecs, contact: schema.contacts, round: schema.rounds, customer: schema.customers })
    .from(schema.jobSpecs)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .leftJoin(schema.rounds, eq(schema.rounds.id, schema.jobSpecs.roundId))
    .where(and(eq(schema.jobSpecs.accountId, accountId), inArray(schema.jobSpecs.status, ["active", "estimate"]),
      roundId ? eq(schema.jobSpecs.roundId, roundId) : undefined));
  const plannedFuture = await db
    .select({ specId: schema.jobs.jobSpecId })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.accountId, accountId), gte(schema.jobs.date, addDays(date, -60)),
      sql`(${schema.jobs.status} = 'to_do' or ${schema.jobs.date} = ${date})`));
  const already = new Set(plannedFuture.map((p) => p.specId));
  const list = rows
    .filter(({ spec }) => !already.has(spec.id))
    .filter(({ spec }) => spec.status === "estimate" || spec.regularity === "on_request" || spec.nextDueOn != null)
    .map(({ spec, contact, round, customer }) => ({
      spec, round, customer,
      name: [firstAddressLine(contact), spec.reference].filter(Boolean).join(" "),
      customerName: contactName(contact),
      lateness: spec.nextDueOn ? lateness(recurrenceOf(spec), spec.nextDueOn, date) : null,
    }));
  list.sort((a, b) => {
    if (order === "round_order") {
      const r = (a.round?.name ?? "~").localeCompare(b.round?.name ?? "~");
      return r !== 0 ? r : a.spec.roundIndex - b.spec.roundIndex;
    }
    return (a.spec.nextDueOn ?? "9999").localeCompare(b.spec.nextDueOn ?? "9999");
  });
  return list;
}

/** Plan a job on a date by snapshotting its spec. One job per spec per date. */
export async function addJobToDay(accountId: string, userId: string | null, jobSpecId: string, date: IsoDate, vatRate: number) {
  const spec = await db.query.jobSpecs.findFirst({ where: and(eq(schema.jobSpecs.id, jobSpecId), eq(schema.jobSpecs.accountId, accountId)) });
  if (!spec) throw new Error("Job not found");
  const priorJobs = await db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.jobSpecId, jobSpecId)).limit(1);
  const [job] = await db.insert(schema.jobs).values({
    accountId, jobSpecId, userId, date, dueOn: spec.nextDueOn,
    status: spec.status === "estimate" ? "estimate" : "to_do",
    apptType: spec.status === "estimate" ? "estimate" : priorJobs.length === 0 ? "first" : "manual",
    confirmed: spec.appointments === "none" ? null : false,
    price: spec.price, vatStatus: spec.vatStatus, vatRate: spec.vatStatus === "inc_vat" || spec.vatStatus === "ex_vat" ? vatRate : 0,
    timeRequired: spec.timeRequired, taskId: spec.taskId,
  }).onConflictDoNothing().returning();
  if (!job) throw new Error("That job is already planned on this date");
  return job;
}

export async function moveJob(accountId: string, jobId: string, date: IsoDate) {
  const job = await db.query.jobs.findFirst({ where: and(eq(schema.jobs.id, jobId), eq(schema.jobs.accountId, accountId)) });
  if (!job) throw new Error("Job not found");
  const clash = await db.query.jobs.findFirst({ where: and(eq(schema.jobs.jobSpecId, job.jobSpecId), eq(schema.jobs.date, date)) });
  if (clash && clash.id !== jobId) throw new Error("That job is already planned on this date");
  await db.update(schema.jobs).set({ date, dayOrder: null, updatedAt: new Date() }).where(eq(schema.jobs.id, jobId));
}

export async function removeJob(accountId: string, jobId: string) {
  await db.delete(schema.jobs).where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.accountId, accountId), inArray(schema.jobs.status, ["to_do", "estimate"])));
}

export async function reorderDay(accountId: string, orderedJobIds: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedJobIds.entries()) {
      await tx.update(schema.jobs).set({ dayOrder: i }).where(and(eq(schema.jobs.id, id), eq(schema.jobs.accountId, accountId)));
    }
  });
}

/** Move all unfinished jobs from before `today` onto `today` (rain day / catch-up). */
export async function nudgeToDate(accountId: string, fromDate: IsoDate, toDate: IsoDate) {
  const jobs = await db.select().from(schema.jobs)
    .where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.date, fromDate), eq(schema.jobs.status, "to_do")));
  let moved = 0;
  for (const j of jobs) {
    try { await moveJob(accountId, j.id, toDate); moved++; } catch { /* clash: leave in place */ }
  }
  return moved;
}

export interface CompleteJobInput {
  status: "done" | "not_done" | "skipped" | "to_do";
  /** Total taken from the customer for this visit, in pence. */
  paid?: number;
  /** When true, any amount over the price is recorded as a tip. */
  includesTip?: boolean;
  tip?: number;
  method?: string;
  reference?: string | null;
  price?: number;
  /** Keep the new price for future jobs too. */
  permanent?: boolean;
  confirmed?: boolean | null;
  notes?: string | null;
  planNext?: { mode: "no" | "on_date" | "auto"; date?: IsoDate };
}

/**
 * Record what happened on a visit: status, price change, payment, and plan the
 * next visit. Recomputes the customer's balance and runs auto-invoicing.
 */
export async function completeJob(accountId: string, userId: string | null, jobId: string, input: CompleteJobInput, today: IsoDate) {
  const job = await db.query.jobs.findFirst({ where: and(eq(schema.jobs.id, jobId), eq(schema.jobs.accountId, accountId)) });
  if (!job) throw new Error("Job not found");
  const spec = await db.query.jobSpecs.findFirst({ where: eq(schema.jobSpecs.id, job.jobSpecId) });
  if (!spec) throw new Error("Job not found");
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });

  await db.transaction(async (tx) => {
    const price = input.price ?? job.price;
    // A future-dated job marked done happened today.
    const date = input.status === "done" && job.date > today ? today : job.date;
    await tx.update(schema.jobs).set({
      status: input.status, price, previousPrice: price !== job.price ? job.price : job.previousPrice,
      date, confirmed: input.confirmed === undefined ? job.confirmed : input.confirmed,
      notes: input.notes === undefined ? job.notes : input.notes,
      doneAt: input.status === "done" ? new Date() : null, updatedAt: new Date(),
    }).where(eq(schema.jobs.id, jobId));

    if (input.permanent && price !== spec.price) {
      await tx.update(schema.jobSpecs).set({ price, priceChangedOn: today, updatedAt: new Date() }).where(eq(schema.jobSpecs.id, spec.id));
      await logActivity(tx, { accountId, userId, customerId: spec.customerId, date: today, category: "job_value_changes", summary: `Price changed`, amount: price - spec.price });
    }

    // Replace the job's payment with what was entered.
    await tx.delete(schema.payments).where(eq(schema.payments.jobId, jobId));
    const total = input.paid ?? 0;
    if (input.status !== "to_do" && (total !== 0 || (input.tip ?? 0) !== 0)) {
      const gross = jobGross({ price, vatStatus: job.vatStatus, vatRate: job.vatRate });
      const { paid, tip } = input.includesTip ? splitTip(total, gross) : { paid: total, tip: input.tip ?? 0 };
      await tx.insert(schema.payments).values({
        accountId, customerId: spec.customerId, jobId, date, paid, tip, method: input.method ?? "cash", reference: input.reference ?? null,
      });
      await logActivity(tx, { accountId, userId, customerId: spec.customerId, date, category: "payments", subcategory: input.method ?? "cash", summary: "Payment", amount: paid });
    }

    if (input.status === "done" || input.status === "skipped") {
      const replanFrom = account?.settings.replanFrom === "last_due" && job.dueOn ? job.dueOn : date;
      const next = input.planNext?.mode === "on_date" && input.planNext.date ? input.planNext.date
        : input.planNext?.mode === "no" ? null
        : nextDueDate(recurrenceOf(spec), replanFrom);
      await tx.update(schema.jobSpecs).set({
        lastDoneOn: input.status === "done" ? date : spec.lastDoneOn,
        nextDueOn: spec.regularity === "one_off" && input.status === "done" ? null : next ?? spec.nextDueOn,
        status: spec.status === "estimate" && input.status === "done" ? "active" : spec.status,
        updatedAt: new Date(),
      }).where(eq(schema.jobSpecs.id, spec.id));
      if (input.planNext?.mode === "on_date" && input.planNext.date) {
        await tx.insert(schema.jobs).values({
          accountId, jobSpecId: spec.id, userId, date: input.planNext.date, dueOn: input.planNext.date, status: "to_do",
          price: input.permanent ? price : spec.price, vatStatus: spec.vatStatus, vatRate: job.vatRate, timeRequired: spec.timeRequired,
          confirmed: spec.appointments === "none" ? null : false,
        }).onConflictDoNothing();
      }
    }
    if (input.status !== job.status) {
      await logActivity(tx, { accountId, userId, customerId: spec.customerId, date, category: "jobs", subcategory: input.status, summary: `Job ${input.status.replace("_", " ")}`, amount: input.status === "done" ? jobGross({ price, vatStatus: job.vatStatus, vatRate: job.vatRate }) : null });
    }
    await recomputeBalance(spec.customerId, today, tx);
  });
  if (input.status === "done") await maybeAutoInvoice(accountId, spec.customerId, today, "after_job");
}

/** Apply the account's policy to To Do jobs left in the past. Run nightly. */
export async function autoMarkStaleJobs(accountId: string, today: IsoDate) {
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  if (!account) return 0;
  const policy = account.settings.autoMarkPolicy ?? "assume_not_done";
  if (policy === "keep_until_next_due") return 0;
  const cutoff = addDays(today, -(account.settings.autoMarkAfterDays ?? 7));
  const stale = await db.select().from(schema.jobs)
    .where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.status, "to_do"), lt(schema.jobs.date, cutoff)));
  for (const j of stale) {
    await completeJob(accountId, j.userId, j.id, { status: policy === "mark_done_overnight" ? "done" : "not_done" }, today);
  }
  return stale.length;
}

/**
 * Reorder a day's jobs to minimise driving. Jobs without coordinates keep their
 * relative order at the end. Start/finish at home or at the job furthest from home.
 */
export async function optimiseDay(accountId: string, date: IsoDate, opts: { start?: "home" | "furthest"; finish?: "home" | "furthest" | "anywhere" } = {}) {
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  const rows = await db
    .select({ job: schema.jobs, lat: sql<number | null>`coalesce(jc.lat, cc.lat)`, lng: sql<number | null>`coalesce(jc.lng, cc.lng)` })
    .from(schema.jobs)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.jobs.jobSpecId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
    .leftJoin(sql`contacts jc`, sql`jc.id = ${schema.jobSpecs.jobContactId}`)
    .leftJoin(sql`contacts cc`, sql`cc.id = ${schema.customers.contactId}`)
    .where(and(eq(schema.jobs.accountId, accountId), eq(schema.jobs.date, date)))
    .orderBy(asc(schema.jobs.dayOrder), asc(schema.jobSpecs.roundIndex));
  const located = rows.filter((r) => r.lat != null && r.lng != null);
  const unlocated = rows.filter((r) => r.lat == null || r.lng == null);
  const pts: Point[] = located.map((r) => ({ lat: r.lat!, lng: r.lng! }));
  const home: Point | undefined = account?.settings.homeLat != null && account.settings.homeLng != null ? { lat: account.settings.homeLat, lng: account.settings.homeLng } : undefined;
  const furthest = home && pts.length ? pts.reduce((a, b) => (haversine(home, b) > haversine(home, a) ? b : a)) : undefined;
  const startMode = opts.start ?? account?.settings.routeStart ?? "home";
  const finishMode = opts.finish ?? account?.settings.routeFinish ?? "home";
  const start = startMode === "furthest" ? furthest : home;
  const end = finishMode === "anywhere" ? undefined : finishMode === "furthest" ? furthest : home;
  const order = optimiseRoute(pts, start, end);
  const ids = [...order.map((i) => located[i]!.job.id), ...unlocated.map((r) => r.job.id)];
  await reorderDay(accountId, ids);
  return { ordered: located.length, unlocated: unlocated.length };
}
