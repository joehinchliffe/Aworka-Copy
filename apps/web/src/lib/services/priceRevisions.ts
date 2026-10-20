import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { formatPence, revisePrice, toPence, type IsoDate, type Pence, type PriceRevisionRule } from "@rounds/domain";
import { db, schema } from "@/db";
import { assertCan, type Actor } from "./access";
import { contactName, firstAddressLine, logActivity } from "./ledger";

const js = schema.jobSpecs;
const pr = schema.priceRevisions;

/** Which jobs a revision applies to, plus how their prices change. Money in pence. */
export interface RevisionRequest {
  /** null = all rounds. */
  roundId: string | null;
  priceMin: Pence | null;
  priceMax: Pence | null;
  /** Only jobs whose price was last changed on or before this date (never-changed jobs use their creation date). */
  changedOnOrBefore: IsoDate | null;
  rule: PriceRevisionRule;
}

/** Stored in price_revisions.rule alongside the request, so a revert can restore priceChangedOn. */
interface StoredRule extends RevisionRequest {
  previousChangedOn: Record<string, IsoDate | null>;
  reverted?: { jobSpecId: string; on: IsoDate }[];
}

const money = (label: string) => z.union([z.string(), z.number()]).optional().nullable()
  .transform((v, ctx) => {
    if (v === "" || v == null) return null;
    try { return toPence(v); } catch { ctx.addIssue({ code: "custom", message: `Enter a valid amount for ${label}` }); return z.NEVER; }
  });

/** Form input (pounds and percentages) to a RevisionRequest. */
export const revisionForm = z.object({
  roundId: z.string().optional().transform((s) => (!s || s === "all" ? null : s)),
  priceMin: money("the lowest price"),
  priceMax: money("the highest price"),
  changedOnOrBefore: z.string().optional().transform((s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)),
  kind: z.enum(["percentage", "fixed"]).default("percentage"),
  /** Percent, e.g. "3" or "3%" or "-5". */
  percentage: z.string().optional().transform((s) => Number((s ?? "0").replace("%", "").trim() || 0)),
  fixed: money("the fixed change"),
  roundTo: money("rounding").transform((p) => p ?? 50),
  minimumChange: money("the minimum change").transform((p) => p ?? 100),
}).transform((f): RevisionRequest => ({
  roundId: f.roundId, priceMin: f.priceMin, priceMax: f.priceMax, changedOnOrBefore: f.changedOnOrBefore,
  rule: {
    kind: f.kind,
    amount: f.kind === "percentage" ? f.percentage / 100 : (f.fixed ?? 0),
    roundTo: f.roundTo, minimumChange: f.minimumChange,
  },
}));

export function describeRevision(req: RevisionRequest, roundName?: string | null): string {
  const r = req.rule;
  const change = r.kind === "percentage"
    ? `${r.amount >= 0 ? "+" : ""}${Math.round(r.amount * 10000) / 100}%`
    : `${r.amount >= 0 ? "+" : "-"}${formatPence(Math.abs(r.amount))}`;
  const parts = [change, roundName ? `on ${roundName}` : "on all rounds"];
  if (req.priceMin != null || req.priceMax != null) {
    parts.push(`prices ${req.priceMin != null ? formatPence(req.priceMin) : "any"} to ${req.priceMax != null ? formatPence(req.priceMax) : "any"}`);
  }
  if (req.changedOnOrBefore) parts.push(`last changed on or before ${req.changedOnOrBefore}`);
  return parts.join(", ");
}

/** Jobs whose price this revision would change, plus counts of those it leaves alone. */
export async function previewRevision(accountId: string, req: RevisionRequest) {
  if (req.rule.kind === "percentage" && !Number.isFinite(req.rule.amount)) throw new Error("Enter a valid percentage");
  const conds = [eq(js.accountId, accountId), inArray(js.status, ["active", "suspended", "estimate"])];
  if (req.roundId) conds.push(eq(js.roundId, req.roundId));
  if (req.priceMin != null) conds.push(sql`${js.price} >= ${req.priceMin}`);
  if (req.priceMax != null) conds.push(sql`${js.price} <= ${req.priceMax}`);
  if (req.changedOnOrBefore) conds.push(sql`coalesce(${js.priceChangedOn}, ${js.createdAt}::date) <= ${req.changedOnOrBefore}`);
  const rows = await db.select({ spec: js, contact: schema.contacts, roundName: schema.rounds.name })
    .from(js)
    .innerJoin(schema.customers, eq(schema.customers.id, js.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .leftJoin(schema.rounds, eq(schema.rounds.id, js.roundId))
    .where(and(...conds))
    .orderBy(asc(schema.rounds.name), asc(js.roundIndex));
  const items: { jobSpecId: string; customerId: string; name: string; customerName: string; roundName: string | null; from: Pence; to: Pence }[] = [];
  let onTask = 0;
  let unchanged = 0;
  for (const { spec, contact, roundName } of rows) {
    // Jobs on a Task follow the task's price instead.
    if (spec.taskId) { onTask++; continue; }
    const to = revisePrice(spec.price, req.rule);
    if (to === spec.price) { unchanged++; continue; }
    items.push({
      jobSpecId: spec.id, customerId: spec.customerId, roundName,
      name: [firstAddressLine(contact), spec.reference].filter(Boolean).join(" ") || contactName(contact),
      customerName: contactName(contact), from: spec.price, to,
    });
  }
  return { items, onTask, unchanged };
}

/** Apply a revision: record it and update each affected job's price. */
export async function applyRevision(actor: Actor, req: RevisionRequest, today: IsoDate) {
  assertCan(actor, "edit_job_details");
  const preview = await previewRevision(actor.accountId, req);
  if (!preview.items.length) throw new Error("No job prices would change");
  const round = req.roundId ? await db.query.rounds.findFirst({ where: and(eq(schema.rounds.id, req.roundId), eq(schema.rounds.accountId, actor.accountId)) }) : null;
  if (req.roundId && !round) throw new Error("Round not found");
  const ids = preview.items.map((i) => i.jobSpecId);
  return db.transaction(async (tx) => {
    const before = await tx.select({ id: js.id, priceChangedOn: js.priceChangedOn }).from(js).where(inArray(js.id, ids));
    const stored: StoredRule = { ...req, previousChangedOn: Object.fromEntries(before.map((b) => [b.id, b.priceChangedOn])) };
    const [revision] = await tx.insert(pr).values({
      accountId: actor.accountId,
      description: describeRevision(req, round?.name),
      rule: stored,
      changes: preview.items.map((i) => ({ jobSpecId: i.jobSpecId, from: i.from, to: i.to })),
    }).returning();
    for (const i of preview.items) {
      await tx.update(js).set({ price: i.to, priceChangedOn: today, updatedAt: new Date() }).where(eq(js.id, i.jobSpecId));
      await logActivity(tx, {
        accountId: actor.accountId, userId: actor.id, customerId: i.customerId, date: today, category: "job_value_changes",
        subcategory: "price_revision", summary: `${i.name}: ${formatPence(i.from)} to ${formatPence(i.to)}`, amount: i.to - i.from,
      });
    }
    return revision!;
  });
}

export async function listRevisions(accountId: string) {
  return db.select().from(pr).where(eq(pr.accountId, accountId)).orderBy(desc(pr.createdAt));
}

export async function getRevision(accountId: string, id: string) {
  return db.query.priceRevisions.findFirst({ where: and(eq(pr.id, id), eq(pr.accountId, accountId)) });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The latest revision (not fully reverted) still holding a change for this job. */
async function latestRevisionFor(tx: Tx, accountId: string, jobSpecId: string) {
  const [row] = await tx.select().from(pr)
    .where(and(eq(pr.accountId, accountId), isNull(pr.revertedAt), sql`${pr.changes} @> ${JSON.stringify([{ jobSpecId }])}::jsonb`))
    .orderBy(desc(pr.createdAt), desc(pr.id)).limit(1);
  return row;
}

async function revertOne(tx: Tx, actor: Actor, revision: typeof pr.$inferSelect, jobSpecId: string, today: IsoDate) {
  const change = revision.changes.find((c) => c.jobSpecId === jobSpecId);
  if (!change) throw new Error("This job was not changed by that revision");
  const spec = await tx.query.jobSpecs.findFirst({ where: and(eq(js.id, jobSpecId), eq(js.accountId, actor.accountId)) });
  if (!spec) throw new Error("Job not found");
  if (spec.price !== change.to) throw new Error("The job's price has been changed since that revision");
  const rule = revision.rule as StoredRule;
  await tx.update(js).set({ price: change.from, priceChangedOn: rule.previousChangedOn?.[jobSpecId] ?? null, updatedAt: new Date() }).where(eq(js.id, jobSpecId));
  const changes = revision.changes.filter((c) => c.jobSpecId !== jobSpecId);
  const newRule: StoredRule = { ...rule, reverted: [...(rule.reverted ?? []), { jobSpecId, on: today }] };
  await tx.update(pr).set({ changes, rule: newRule, revertedAt: changes.length ? null : new Date(), updatedAt: new Date() }).where(eq(pr.id, revision.id));
  await logActivity(tx, {
    accountId: actor.accountId, userId: actor.id, customerId: spec.customerId, date: today, category: "job_value_changes",
    subcategory: "price_revision_reverted", summary: `Price revision reverted: ${formatPence(change.to)} to ${formatPence(change.from)}`, amount: change.from - change.to,
  });
  revision.changes = changes;
  revision.rule = newRule;
}

/** Revert one job from its most recent price revision. */
export async function revertJob(actor: Actor, jobSpecId: string, today: IsoDate) {
  assertCan(actor, "edit_job_details");
  await db.transaction(async (tx) => {
    const revision = await latestRevisionFor(tx, actor.accountId, jobSpecId);
    if (!revision) throw new Error("This job has no price revision to revert");
    await revertOne(tx, actor, revision, jobSpecId, today);
  });
}

/**
 * Revert every job in a revision for which it is still the job's most recent
 * revision and whose price has not been edited since. Others are skipped.
 */
export async function revertRevision(actor: Actor, revisionId: string, today: IsoDate) {
  assertCan(actor, "edit_job_details");
  return db.transaction(async (tx) => {
    const [revision] = await tx.select().from(pr).where(and(eq(pr.id, revisionId), eq(pr.accountId, actor.accountId)));
    if (!revision) throw new Error("Price revision not found");
    let reverted = 0;
    let skipped = 0;
    for (const c of [...revision.changes]) {
      const latest = await latestRevisionFor(tx, actor.accountId, c.jobSpecId);
      const spec = await tx.query.jobSpecs.findFirst({ where: eq(js.id, c.jobSpecId) });
      if (latest?.id !== revision.id || !spec || spec.price !== c.to) { skipped++; continue; }
      await revertOne(tx, actor, revision, c.jobSpecId, today);
      reverted++;
    }
    return { reverted, skipped };
  });
}

/** Names for the jobs in a revision's change list. */
export async function revisionJobNames(accountId: string, jobSpecIds: string[]) {
  if (!jobSpecIds.length) return new Map<string, { name: string; customerId: string; price: number }>();
  const rows = await db.select({ spec: js, contact: schema.contacts }).from(js)
    .innerJoin(schema.customers, eq(schema.customers.id, js.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(eq(js.accountId, accountId), inArray(js.id, jobSpecIds)));
  return new Map(rows.map(({ spec, contact }) => [spec.id, {
    name: [firstAddressLine(contact), spec.reference].filter(Boolean).join(" ") || contactName(contact),
    customerId: spec.customerId, price: spec.price,
  }]));
}

/** For each job, the id of the revision a per-job revert would undo (its most recent). */
export async function latestRevisionByJob(accountId: string, jobSpecIds: string[]): Promise<Map<string, string>> {
  if (!jobSpecIds.length) return new Map();
  const rows = await db.execute<{ job_spec_id: string; revision_id: string }>(sql`
    select distinct on (c->>'jobSpecId') c->>'jobSpecId' as job_spec_id, r.id as revision_id
    from price_revisions r, jsonb_array_elements(r.changes) c
    where r.account_id = ${accountId} and r.reverted_at is null
      and c->>'jobSpecId' in (${sql.join(jobSpecIds.map((id) => sql`${id}`), sql`, `)})
    order by c->>'jobSpecId', r.created_at desc, r.id desc`);
  return new Map(rows.map((r) => [r.job_spec_id, r.revision_id]));
}
