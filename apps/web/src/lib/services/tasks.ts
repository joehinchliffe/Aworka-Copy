import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { IsoDate } from "@rounds/domain";
import { db, schema } from "@/db";
import { assertCan, type Actor } from "./access";

const optStr = z.string().trim().optional().transform((s) => (s ? s : null));
const optMoney = z.union([z.string(), z.number()]).optional().nullable()
  .transform((v) => (v === "" || v == null ? null : Math.round(Number(v) * 100)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Enter a valid price");
const optInt = z.union([z.string(), z.number()]).optional().nullable()
  .transform((v) => (v === "" || v == null ? null : Math.round(Number(v))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 24 * 60), "Enter a valid time in minutes");

export const taskInput = z.object({
  name: z.string().trim().min(1, "Enter a task name"),
  description: optStr,
  /** Minutes. */
  timeRequired: optInt,
  /** Pounds in, pence out. */
  price: optMoney,
});

export async function listTasks(accountId: string) {
  return db.select({
    task: schema.tasks,
    jobs: sql<number>`(select count(*)::int from job_specs s where s.task_id = ${schema.tasks.id} and s.status <> 'deleted')`,
  }).from(schema.tasks).where(eq(schema.tasks.accountId, accountId)).orderBy(asc(schema.tasks.name));
}

export async function getTask(accountId: string, taskId: string) {
  return db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.accountId, accountId)) });
}

export async function createTask(actor: Actor, raw: z.input<typeof taskInput>) {
  assertCan(actor, "edit_job_details");
  const t = taskInput.parse(raw);
  const [row] = await db.insert(schema.tasks).values({ accountId: actor.accountId, ...t }).returning();
  return row!;
}

/**
 * Edit a task. A task's price and time are those of every job using it, so a
 * changed price (or time) is written to all of the task's live jobs.
 * Returns the number of jobs whose price changed.
 */
export async function updateTask(actor: Actor, taskId: string, raw: z.input<typeof taskInput>, today: IsoDate): Promise<number> {
  assertCan(actor, "edit_job_details");
  const t = taskInput.parse(raw);
  const existing = await getTask(actor.accountId, taskId);
  if (!existing) throw new Error("Task not found");
  return db.transaction(async (tx) => {
    await tx.update(schema.tasks).set({ ...t, updatedAt: new Date() }).where(eq(schema.tasks.id, taskId));
    const live = and(eq(schema.jobSpecs.accountId, actor.accountId), eq(schema.jobSpecs.taskId, taskId), ne(schema.jobSpecs.status, "deleted"));
    let changed = 0;
    if (t.price !== null) {
      const rows = await tx.update(schema.jobSpecs).set({ price: t.price, priceChangedOn: today, updatedAt: new Date() })
        .where(and(live, ne(schema.jobSpecs.price, t.price))).returning({ id: schema.jobSpecs.id });
      changed = rows.length;
    }
    if (t.timeRequired !== null && t.timeRequired !== existing.timeRequired) {
      await tx.update(schema.jobSpecs).set({ timeRequired: t.timeRequired }).where(live);
    }
    return changed;
  });
}

/** Delete a task; its jobs keep their current price and description. */
export async function deleteTask(actor: Actor, taskId: string) {
  assertCan(actor, "edit_job_details");
  await db.delete(schema.tasks).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.accountId, actor.accountId)));
}
