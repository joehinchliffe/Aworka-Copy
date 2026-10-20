import { and, desc, eq, gte, ilike, lt, ne, or } from "drizzle-orm";
import { addDays, type IsoDate } from "@rounds/domain";
import { db, schema } from "@/db";
import { channelsFor } from "./drafts";
import { queueMessage } from "./messaging";
import { loadMergeCustomers, mergeContextFor, mergeTemplate } from "./templates";

export const MESSAGE_REASONS: Record<string, string> = {
  invoice: "Invoices", receipt: "Receipts", statement: "Statements", job_sheet: "Job sheets", other: "Customer messages",
};
export const MESSAGE_STATUSES: Record<string, string> = { sent: "Sent", queued: "Queued", failed: "Failed", draft: "Draft" };

export interface MessageFilter {
  status?: string;
  reason?: string;
  text?: string;
  start: IsoDate;
  end: IsoDate;
  customerId?: string;
}

/** Message history (drafts excluded unless asked for). Dates are UK days on created time. */
export async function listMessages(accountId: string, f: MessageFilter, limit = 500) {
  const t = f.text?.trim();
  return db.select({ message: schema.messages, contact: schema.contacts })
    .from(schema.messages)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.messages.customerId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(
      eq(schema.messages.accountId, accountId),
      f.status ? eq(schema.messages.status, f.status) : ne(schema.messages.status, "draft"),
      f.reason ? eq(schema.messages.reason, f.reason) : undefined,
      f.customerId ? eq(schema.messages.customerId, f.customerId) : undefined,
      gte(schema.messages.createdAt, new Date(`${f.start}T00:00:00Z`)),
      lt(schema.messages.createdAt, new Date(`${addDays(f.end, 1)}T00:00:00Z`)),
      t ? or(ilike(schema.messages.body, `%${t}%`), ilike(schema.messages.subject, `%${t}%`), ilike(schema.messages.to, `%${t}%`)) : undefined,
    ))
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit);
}

export async function getMessage(accountId: string, id: string) {
  const rows = await db.select({ message: schema.messages, contact: schema.contacts })
    .from(schema.messages)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.messages.customerId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(eq(schema.messages.id, id), eq(schema.messages.accountId, accountId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Put a failed message back in the queue. */
export async function retryMessage(accountId: string, id: string) {
  await db.update(schema.messages).set({ status: "queued", error: null, updatedAt: new Date() })
    .where(and(eq(schema.messages.id, id), eq(schema.messages.accountId, accountId), eq(schema.messages.status, "failed")));
}

/**
 * Compose to one customer. Merge tags in subject and body are filled in;
 * the customer's contact method is respected.
 */
export async function sendToCustomer(accountId: string, customerId: string, m: { channel: "email" | "sms"; subject?: string | null; body: string; purpose?: string }) {
  if (!m.body.trim()) throw new Error("Enter a message");
  const merge = await loadMergeCustomers(accountId, [customerId]);
  const c = merge.get(customerId);
  if (!c) throw new Error("Customer not found");
  const { channels, reason } = channelsFor(c, m.channel, m.purpose ?? "general");
  if (!channels.includes(m.channel)) throw new Error(reason ?? "Cannot message this customer");
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  const ctx = mergeContextFor(c, account?.businessName ?? "");
  return queueMessage(accountId, {
    customerId, channel: m.channel, reason: "other",
    to: m.channel === "email" ? c.email! : c.phone!,
    subject: m.channel === "email" ? mergeTemplate(m.subject ?? "", ctx) || null : null,
    body: mergeTemplate(m.body, ctx),
  });
}
