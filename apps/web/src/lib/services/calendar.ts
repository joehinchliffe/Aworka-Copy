import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { IsoDate } from "@rounds/domain";
import { db, schema } from "@/db";

const isIso = (d: unknown): d is IsoDate => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const opt = (s?: string | null) => (s && s.trim() ? s.trim() : null);

// ---------------------------------------------------------------------------
// Events and to-dos

export const EVENT_FILTERS = { all: "All", to_do: "To do", done_to_do: "Done to do", event: "Events" } as const;
export type EventFilter = keyof typeof EVENT_FILTERS;

export interface EventInput {
  type: "event" | "to_do";
  date: IsoDate;
  time?: string | null;
  summary: string;
  details?: string | null;
  userId?: string | null;
}

function cleanEvent(e: EventInput) {
  if (!isIso(e.date)) throw new Error("Choose a date");
  if (!e.summary?.trim()) throw new Error("Enter a summary");
  const time = opt(e.time);
  if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Time must be HH:MM");
  return { type: e.type === "to_do" ? "to_do" : "event", date: e.date, time, summary: e.summary.trim(), details: opt(e.details), userId: e.userId ?? null };
}

export async function listEvents(accountId: string, f: { filter?: EventFilter; start: IsoDate; end: IsoDate }) {
  const filter = f.filter ?? "all";
  return db.select().from(schema.events)
    .where(and(
      eq(schema.events.accountId, accountId), gte(schema.events.date, f.start), lte(schema.events.date, f.end),
      filter === "all" ? undefined : eq(schema.events.type, filter),
    ))
    .orderBy(asc(schema.events.date), asc(schema.events.time));
}

export const getEvent = (accountId: string, id: string) =>
  db.query.events.findFirst({ where: and(eq(schema.events.id, id), eq(schema.events.accountId, accountId)) });

export async function saveEvent(accountId: string, id: string | null, input: EventInput) {
  const v = cleanEvent(input);
  if (id) {
    const existing = await getEvent(accountId, id);
    if (!existing) throw new Error("Event not found");
    // Keep a completed to-do completed when it is edited.
    const type = existing.type === "done_to_do" && v.type === "to_do" ? "done_to_do" : v.type;
    await db.update(schema.events).set({ ...v, type, userId: existing.userId, updatedAt: new Date() }).where(eq(schema.events.id, id));
    return id;
  }
  const [row] = await db.insert(schema.events).values({ accountId, ...v }).returning();
  return row!.id;
}

/** Tick a to-do off (or reopen it). */
export async function setToDoDone(accountId: string, id: string, done: boolean) {
  await db.update(schema.events).set({ type: done ? "done_to_do" : "to_do", updatedAt: new Date() })
    .where(and(eq(schema.events.id, id), eq(schema.events.accountId, accountId)));
}

export async function deleteEvent(accountId: string, id: string) {
  await db.delete(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.accountId, accountId)));
}

// ---------------------------------------------------------------------------
// Time off

export interface TimeOffInput { startOn: IsoDate; endOn: IsoDate; reason?: string | null; notes?: string | null; userId?: string | null }

export async function addTimeOff(accountId: string, t: TimeOffInput) {
  if (!isIso(t.startOn) || !isIso(t.endOn)) throw new Error("Choose the from and to dates");
  if (t.endOn < t.startOn) throw new Error("The to date must be on or after the from date");
  const [row] = await db.insert(schema.holidays).values({
    accountId, userId: t.userId ?? null, startOn: t.startOn, endOn: t.endOn, reason: opt(t.reason), notes: opt(t.notes),
  }).returning();
  return row!;
}

/** Periods of time off overlapping the range. */
export async function listTimeOff(accountId: string, start: IsoDate, end: IsoDate) {
  return db.select({ holiday: schema.holidays, userName: schema.users.name }).from(schema.holidays)
    .leftJoin(schema.users, eq(schema.users.id, schema.holidays.userId))
    .where(and(eq(schema.holidays.accountId, accountId), lte(schema.holidays.startOn, end), gte(schema.holidays.endOn, start)))
    .orderBy(asc(schema.holidays.startOn));
}

/** Reasons used before, for the free-text reason's suggestions. */
export async function timeOffReasons(accountId: string) {
  const rows = await db.selectDistinct({ reason: schema.holidays.reason }).from(schema.holidays).where(eq(schema.holidays.accountId, accountId));
  return rows.map((r) => r.reason).filter((r): r is string => !!r).sort();
}

export async function deleteTimeOff(accountId: string, id: string) {
  await db.delete(schema.holidays).where(and(eq(schema.holidays.id, id), eq(schema.holidays.accountId, accountId)));
}
