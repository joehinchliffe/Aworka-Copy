import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export interface OutgoingMessage {
  customerId?: string | null;
  channel: "email" | "sms";
  reason: string;
  to: string;
  subject?: string | null;
  body: string;
}

export async function queueMessage(accountId: string, m: OutgoingMessage) {
  const [row] = await db.insert(schema.messages).values({
    accountId, customerId: m.customerId ?? null, channel: m.channel, reason: m.reason,
    to: m.to, subject: m.subject ?? null, body: m.body, status: "queued",
  }).returning();
  return row!;
}

/** A transport delivers one message; adapters exist for SMTP, providers and a dev log. */
export interface Transport {
  /** `from` is the business name (display name); `replyTo` the business email address when known. */
  send(m: { to: string; subject?: string | null; body: string; channel: "email" | "sms"; from: string; replyTo?: string | null }): Promise<void>;
}

export const logTransport: Transport = {
  async send(m) {
    console.log(`[${m.channel}] to=${m.to} subject=${m.subject ?? ""}\n${m.body}`);
  },
};

export async function deliverQueued(accountId: string, transport: Transport = logTransport, limit = 100) {
  const queued = await db.select().from(schema.messages)
    .where(and(eq(schema.messages.accountId, accountId), inArray(schema.messages.status, ["queued"])))
    .limit(limit);
  if (!queued.length) return 0;
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  const replyTo = await businessReplyTo(accountId, account?.settings.email);
  for (const m of queued) {
    try {
      await transport.send({ ...m, channel: m.channel as "email" | "sms", from: account?.businessName ?? "Rounds", replyTo });
      await db.update(schema.messages).set({ status: "sent", sentAt: new Date() }).where(eq(schema.messages.id, m.id));
    } catch (e) {
      await db.update(schema.messages).set({ status: "failed", error: String(e) }).where(eq(schema.messages.id, m.id));
    }
  }
  return queued.length;
}

/** The business email (settings), else the account owner's login email. */
export async function businessReplyTo(accountId: string, settingsEmail?: string | null): Promise<string | null> {
  if (settingsEmail) return settingsEmail;
  const owner = await db.query.users.findFirst({ where: and(eq(schema.users.accountId, accountId), eq(schema.users.isOwner, true)) });
  return owner?.email ?? null;
}
