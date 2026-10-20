import { and, eq, sql } from "drizzle-orm";
import { db, schema, type Db } from "@/db";
import { logActivity, recomputeBalance } from "./ledger";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
export type PaymentStatus = "pending" | "cleared" | "failed";

const LABEL: Record<string, string> = { stripe: "Card payment (Stripe)", gocardless: "Direct Debit (GoCardless)" };

/** Mark an invoice paid once its cleared payments cover it, or unpaid again if they no longer do. */
async function syncInvoicePaid(tx: Tx, invoiceId: string | null) {
  if (!invoiceId) return;
  const inv = await tx.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv) return;
  const [sum] = await tx.select({ total: sql<number>`coalesce(sum(${schema.payments.paid}), 0)::int` }).from(schema.payments)
    .where(and(eq(schema.payments.invoiceId, invoiceId), eq(schema.payments.status, "cleared")));
  const covered = (sum?.total ?? 0) >= inv.gross;
  if (covered && !inv.paidAt) await tx.update(schema.invoices).set({ paidAt: new Date(), updatedAt: new Date() }).where(eq(schema.invoices.id, invoiceId));
  if (!covered && inv.paidAt) await tx.update(schema.invoices).set({ paidAt: null, updatedAt: new Date() }).where(eq(schema.invoices.id, invoiceId));
}

/**
 * Record a payment taken through an online provider. Idempotent on (provider, providerRef):
 * returns inserted=false when the payment was already recorded.
 */
export async function recordProviderPayment(p: {
  accountId: string; customerId: string; invoiceId?: string | null; provider: "stripe" | "gocardless"; providerRef: string;
  amount: number; status: PaymentStatus; date: string; reference?: string | null; fee?: number | null;
}): Promise<{ inserted: boolean; paymentId: string }> {
  return db.transaction(async (tx) => {
    const customer = await tx.query.customers.findFirst({
      where: and(eq(schema.customers.id, p.customerId), eq(schema.customers.accountId, p.accountId)),
    });
    if (!customer) throw new Error("Customer not found");
    let invoiceId = p.invoiceId ?? null;
    if (invoiceId) {
      const inv = await tx.query.invoices.findFirst({ where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.customerId, p.customerId)) });
      if (!inv) invoiceId = null;
    }
    const [row] = await tx.insert(schema.payments).values({
      accountId: p.accountId, customerId: p.customerId, invoiceId, date: p.date, paid: p.amount, method: p.provider,
      reference: p.reference ?? null, status: p.status, provider: p.provider, providerRef: p.providerRef, fee: p.fee ?? null,
    }).onConflictDoNothing({ target: [schema.payments.provider, schema.payments.providerRef] }).returning({ id: schema.payments.id });
    if (!row) {
      const existing = await tx.query.payments.findFirst({
        where: and(eq(schema.payments.provider, p.provider), eq(schema.payments.providerRef, p.providerRef)),
      });
      return { inserted: false, paymentId: existing!.id };
    }
    await recomputeBalance(p.customerId, p.date, tx);
    await logActivity(tx, {
      accountId: p.accountId, customerId: p.customerId, date: p.date, category: "payments", subcategory: p.provider,
      summary: `${LABEL[p.provider]}${p.status === "pending" ? " requested" : ""}`, amount: p.amount,
    });
    if (p.status === "cleared") await syncInvoicePaid(tx, invoiceId);
    return { inserted: true, paymentId: row.id };
  });
}

/** Move a provider payment to a new status and keep the customer's balance in step. Returns false if unknown. */
export async function setProviderPaymentStatus(provider: "stripe" | "gocardless", providerRef: string, status: PaymentStatus, today: string, accountId?: string) {
  return db.transaction(async (tx) => {
    const pay = await tx.query.payments.findFirst({
      where: and(eq(schema.payments.provider, provider), eq(schema.payments.providerRef, providerRef),
        accountId ? eq(schema.payments.accountId, accountId) : undefined),
    });
    if (!pay) return false;
    if (pay.status === status) return true;
    await tx.update(schema.payments).set({ status, updatedAt: new Date() }).where(eq(schema.payments.id, pay.id));
    await recomputeBalance(pay.customerId, today, tx);
    if (status === "failed") {
      await logActivity(tx, {
        accountId: pay.accountId, customerId: pay.customerId, date: today, category: "payments", subcategory: provider,
        summary: `${LABEL[provider]} failed`, amount: -pay.paid,
      });
    }
    await syncInvoicePaid(tx, pay.invoiceId);
    return true;
  });
}

/** Store an inbound webhook event once. Returns false when it was already processed successfully. */
export async function claimWebhookEvent(id: string, provider: string, accountId: string | null, payload: unknown): Promise<boolean> {
  const [row] = await db.insert(schema.webhookEvents).values({ id, provider, accountId, payload: payload as object })
    .onConflictDoNothing().returning({ id: schema.webhookEvents.id });
  if (row) return true;
  const existing = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, id) });
  return !existing?.processedAt;
}

export async function finishWebhookEvent(id: string, error?: string | null) {
  await db.update(schema.webhookEvents)
    .set(error ? { error } : { processedAt: new Date(), error: null })
    .where(eq(schema.webhookEvents.id, id));
}
