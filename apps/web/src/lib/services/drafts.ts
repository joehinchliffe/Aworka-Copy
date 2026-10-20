import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { IsoDate } from "@rounds/domain";
import { db, schema } from "@/db";
import { jobSheet, type JobSheetStatus } from "./jobSheets";
import { getTemplate, loadMergeCustomers, mergeContextFor, mergeTemplate } from "./templates";

export type DraftChannel = "email" | "sms" | "preferred";

/** Where a mass message's recipients come from. */
export type DraftSelection =
  | { kind: "round"; roundId: string }
  | { kind: "job_sheet"; start: IsoDate; days: number; status?: JobSheetStatus; userId?: string | null }
  | { kind: "debt" }
  | { kind: "customers"; customerIds: string[] };

/** Customer ids for a selection, in a stable order without duplicates. */
export async function selectCustomers(accountId: string, sel: DraftSelection): Promise<string[]> {
  const uniq = (ids: string[]) => [...new Set(ids)];
  switch (sel.kind) {
    case "customers": return uniq(sel.customerIds);
    case "round": {
      const rows = await db.select({ id: schema.jobSpecs.customerId }).from(schema.jobSpecs)
        .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
        .where(and(eq(schema.jobSpecs.accountId, accountId), eq(schema.jobSpecs.roundId, sel.roundId),
          inArray(schema.jobSpecs.status, ["active", "estimate"]), isNull(schema.customers.deletedAt)))
        .orderBy(asc(schema.jobSpecs.roundIndex));
      return uniq(rows.map((r) => r.id));
    }
    case "job_sheet": {
      const sheet = await jobSheet(accountId, { start: sel.start, days: sel.days, status: sel.status, userId: sel.userId });
      return uniq(sheet.flatMap((d) => d.rows.map((r) => r.customerId)));
    }
    case "debt": {
      const rows = await db.select({ id: schema.customers.id }).from(schema.customers)
        .where(and(eq(schema.customers.accountId, accountId), lt(schema.customers.balance, 0), isNull(schema.customers.deletedAt)))
        .orderBy(asc(schema.customers.debtSince));
      return rows.map((r) => r.id);
    }
  }
}

export interface DraftSkip { customerId: string; name: string; reason: string }

/** Message history reason recorded for each template purpose. */
const PURPOSE_REASON: Record<string, string> = {
  invoices: "invoice", receipts: "receipt", prepayment_receipt: "receipt", statements: "statement", job_sheets: "job_sheet",
};

/** Which channels a customer can be sent on for a requested channel, or why none. */
export function channelsFor(
  c: { contactMethod: string; acceptsMarketing: boolean; email: string | null; phone: string | null; anonymised?: boolean },
  channel: DraftChannel,
  purpose: string,
): { channels: ("email" | "sms")[]; reason?: string } {
  if (c.anonymised) return { channels: [], reason: "Customer has been anonymised" };
  if (purpose === "marketing" && !c.acceptsMarketing) return { channels: [], reason: "Does not accept marketing" };
  if (c.contactMethod === "none") return { channels: [], reason: "Contact method is none" };
  const allowed: ("email" | "sms")[] = c.contactMethod === "both" ? ["email", "sms"] : [c.contactMethod as "email" | "sms"];
  const wanted = channel === "preferred" ? allowed : allowed.includes(channel) ? [channel] : [];
  if (wanted.length === 0) return { channels: [], reason: `Prefers ${c.contactMethod === "sms" ? "SMS" : "email"}` };
  const reasons: string[] = [];
  const ok = wanted.filter((ch) => {
    if (ch === "email" && !c.email) { reasons.push("No email address"); return false; }
    if (ch === "sms" && !c.phone) { reasons.push("No phone number"); return false; }
    return true;
  });
  return ok.length ? { channels: ok } : { channels: [], reason: reasons.join(", ") };
}

/**
 * Create draft messages for the selected customers from a template. Drafts that
 * can't be sent are not created; they are returned in `skipped` with a reason.
 */
export async function buildDrafts(accountId: string, customerIds: string[], templateId: string, channel: DraftChannel, reasonOverride?: string) {
  const template = await getTemplate(accountId, templateId);
  if (!template) throw new Error("Template not found");
  const reason = reasonOverride ?? PURPOSE_REASON[template.purpose] ?? "other";
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  const merge = await loadMergeCustomers(accountId, customerIds);
  const values: (typeof schema.messages.$inferInsert)[] = [];
  const skipped: DraftSkip[] = [];
  for (const id of customerIds) {
    const c = merge.get(id);
    if (!c) { skipped.push({ customerId: id, name: "Unknown", reason: "Customer not found" }); continue; }
    const ctx = mergeContextFor(c, account?.businessName ?? "");
    const { channels, reason: why } = channelsFor(c, channel, template.purpose);
    const usable = channels.filter((ch) => (ch === "email" ? template.emailBody : template.smsBody));
    if (channels.length && !usable.length) { skipped.push({ customerId: id, name: ctx.name!, reason: `Template has no ${channels.join("/")} text` }); continue; }
    if (!usable.length) { skipped.push({ customerId: id, name: ctx.name!, reason: why ?? "No channel" }); continue; }
    for (const ch of usable) {
      values.push({
        accountId, customerId: id, channel: ch, reason, status: "draft",
        to: ch === "email" ? c.email! : c.phone!,
        subject: ch === "email" ? mergeTemplate(template.emailSubject ?? "", ctx) || null : null,
        body: mergeTemplate(ch === "email" ? template.emailBody! : template.smsBody!, ctx),
      });
    }
  }
  const created = values.length ? await db.insert(schema.messages).values(values).returning() : [];
  return { created, skipped };
}

export const listDrafts = (accountId: string) =>
  db.select().from(schema.messages)
    .where(and(eq(schema.messages.accountId, accountId), eq(schema.messages.status, "draft")))
    .orderBy(desc(schema.messages.createdAt));

/** Queue drafts for delivery (all of them, or just the given ids). */
export async function deliverDrafts(accountId: string, ids?: string[]) {
  const rows = await db.update(schema.messages).set({ status: "queued", updatedAt: new Date() })
    .where(and(eq(schema.messages.accountId, accountId), eq(schema.messages.status, "draft"),
      ids ? inArray(schema.messages.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]) : undefined))
    .returning({ id: schema.messages.id });
  return rows.length;
}

export async function discardDrafts(accountId: string, ids?: string[]) {
  await db.delete(schema.messages)
    .where(and(eq(schema.messages.accountId, accountId), eq(schema.messages.status, "draft"),
      ids ? inArray(schema.messages.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]) : undefined));
}
