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
  send(m: { to: string; subject?: string | null; body: string; channel: "email" | "sms"; from: string }): Promise<void>;
}

export const logTransport: Transport = {
  async send(m) {
    // Development fallback: never log bodies, which contain private links.
    console.log(`[${m.channel}] queued message delivered to log transport (${m.body.length} chars)`);
  },
};

export async function deliverQueued(accountId: string, transport: Transport = logTransport, limit = 100) {
  const queued = await db.select().from(schema.messages)
    .where(and(eq(schema.messages.accountId, accountId), inArray(schema.messages.status, ["queued"])))
    .limit(limit);
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  for (const m of queued) {
    try {
      await transport.send({ ...m, channel: m.channel as "email" | "sms", from: account?.businessName ?? "Rounds" });
      await db.update(schema.messages).set({ status: "sent", sentAt: new Date() }).where(eq(schema.messages.id, m.id));
    } catch (e) {
      await db.update(schema.messages).set({ status: "failed", error: String(e) }).where(eq(schema.messages.id, m.id));
    }
  }
  return queued.length;
}
