import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const roundsFor = (accountId: string) =>
  db.select({ id: schema.rounds.id, name: schema.rounds.name }).from(schema.rounds).where(eq(schema.rounds.accountId, accountId)).orderBy(asc(schema.rounds.name));
export const tasksFor = (accountId: string) =>
  db.select({ id: schema.tasks.id, name: schema.tasks.name, price: schema.tasks.price }).from(schema.tasks).where(eq(schema.tasks.accountId, accountId)).orderBy(asc(schema.tasks.name));
export const accountFor = (accountId: string) => db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
