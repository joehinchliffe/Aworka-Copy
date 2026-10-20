import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertCan, type Actor } from "./access";

const optStr = z.string().trim().optional().transform((s) => (s ? s : null));

export const salesSourceInput = z.object({
  type: z.string().trim().min(1, "Enter the source of sale, e.g. Leaflet or Facebook").max(60),
  reference: optStr,
  notes: optStr,
});

export async function listSalesSources(accountId: string) {
  return db.select({
    source: schema.salesSources,
    jobs: sql<number>`(select count(*)::int from job_specs s where s.sales_source_id = ${schema.salesSources.id} and s.status <> 'deleted')`,
  }).from(schema.salesSources).where(eq(schema.salesSources.accountId, accountId))
    .orderBy(asc(schema.salesSources.type), asc(schema.salesSources.reference));
}

/** Distinct source types already used, for suggestions. */
export async function salesSourceTypes(accountId: string) {
  const rows = await db.selectDistinct({ type: schema.salesSources.type }).from(schema.salesSources)
    .where(eq(schema.salesSources.accountId, accountId)).orderBy(asc(schema.salesSources.type));
  return rows.map((r) => r.type);
}

export async function getSalesSource(accountId: string, id: string) {
  return db.query.salesSources.findFirst({ where: and(eq(schema.salesSources.id, id), eq(schema.salesSources.accountId, accountId)) });
}

export async function createSalesSource(actor: Actor, raw: z.input<typeof salesSourceInput>) {
  assertCan(actor, "edit_sales_sources");
  const s = salesSourceInput.parse(raw);
  const [row] = await db.insert(schema.salesSources).values({ accountId: actor.accountId, ...s }).returning();
  return row!;
}

export async function updateSalesSource(actor: Actor, id: string, raw: z.input<typeof salesSourceInput>) {
  assertCan(actor, "edit_sales_sources");
  const s = salesSourceInput.parse(raw);
  const res = await db.update(schema.salesSources).set({ ...s, updatedAt: new Date() })
    .where(and(eq(schema.salesSources.id, id), eq(schema.salesSources.accountId, actor.accountId))).returning({ id: schema.salesSources.id });
  if (!res.length) throw new Error("Sales source not found");
}

export async function deleteSalesSource(actor: Actor, id: string) {
  assertCan(actor, "edit_sales_sources");
  await db.delete(schema.salesSources).where(and(eq(schema.salesSources.id, id), eq(schema.salesSources.accountId, actor.accountId)));
}
