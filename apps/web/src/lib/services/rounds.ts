import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertCan, type Actor } from "./access";
import { contactName, firstAddressLine } from "./ledger";

const js = schema.jobSpecs;
const jc = alias(schema.contacts, "jc");

/** Rounds with the number and total price of their live (active or suspended) jobs. */
export async function listRounds(accountId: string) {
  return db.select({
    round: schema.rounds,
    userName: schema.users.name,
    jobs: sql<number>`(select count(*)::int from job_specs s where s.round_id = ${schema.rounds.id} and s.account_id = ${schema.rounds.accountId} and s.status in ('active', 'suspended'))`,
    value: sql<number>`(select coalesce(sum(s.price), 0)::int from job_specs s where s.round_id = ${schema.rounds.id} and s.account_id = ${schema.rounds.accountId} and s.status = 'active')`,
  }).from(schema.rounds)
    .leftJoin(schema.users, eq(schema.users.id, schema.rounds.userId))
    .where(eq(schema.rounds.accountId, accountId))
    .orderBy(asc(schema.rounds.name));
}

export async function getRound(accountId: string, roundId: string) {
  return db.query.rounds.findFirst({ where: and(eq(schema.rounds.id, roundId), eq(schema.rounds.accountId, accountId)) });
}

export const roundInput = z.object({
  name: z.string().trim().min(1, "Enter a round name").max(60),
  otherIncome: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
});

export async function createRound(actor: Actor, raw: z.input<typeof roundInput>) {
  assertCan(actor, "edit_job_details");
  const r = roundInput.parse(raw);
  const [row] = await db.insert(schema.rounds).values({ accountId: actor.accountId, name: r.name, otherIncome: r.otherIncome }).returning();
  return row!;
}

export async function updateRound(actor: Actor, roundId: string, raw: z.input<typeof roundInput>) {
  assertCan(actor, "edit_job_details");
  const r = roundInput.parse(raw);
  const res = await db.update(schema.rounds).set({ name: r.name, otherIncome: r.otherIncome, updatedAt: new Date() })
    .where(and(eq(schema.rounds.id, roundId), eq(schema.rounds.accountId, actor.accountId))).returning({ id: schema.rounds.id });
  if (!res.length) throw new Error("Round not found");
}

/** Delete a round; its jobs stay but no longer belong to a round. */
export async function deleteRound(actor: Actor, roundId: string) {
  assertCan(actor, "delete_jobs");
  await db.delete(schema.rounds).where(and(eq(schema.rounds.id, roundId), eq(schema.rounds.accountId, actor.accountId)));
}

/** Live jobs in a round, in round order. */
export async function roundJobs(accountId: string, roundId: string) {
  const rows = await db.select({ spec: js, contact: schema.contacts, jobContact: jc.address })
    .from(js)
    .innerJoin(schema.customers, eq(schema.customers.id, js.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .leftJoin(jc, eq(jc.id, js.jobContactId))
    .where(and(eq(js.accountId, accountId), eq(js.roundId, roundId), inArray(js.status, ["active", "suspended", "estimate"])))
    .orderBy(asc(js.roundIndex), asc(js.createdAt));
  return rows.map(({ spec, contact, jobContact }) => ({
    spec,
    name: [jobContact ? jobContact.split("\n")[0] : firstAddressLine(contact), spec.reference].filter(Boolean).join(" ") || contactName(contact),
    customerName: contactName(contact),
  }));
}

/** Store a new round order. `orderedSpecIds` lists the round's jobs first to last. */
export async function setRoundOrder(actor: Actor, roundId: string, orderedSpecIds: string[]) {
  assertCan(actor, "edit_job_details");
  if (!(await getRound(actor.accountId, roundId))) throw new Error("Round not found");
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedSpecIds.entries()) {
      await tx.update(js).set({ roundIndex: i + 1 })
        .where(and(eq(js.id, id), eq(js.roundId, roundId), eq(js.accountId, actor.accountId)));
    }
  });
}
