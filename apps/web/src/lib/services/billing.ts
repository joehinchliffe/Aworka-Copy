import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * Billing for the product itself via Stripe Billing on the platform's own Stripe
 * account (STRIPE_PLATFORM_KEY, STRIPE_PLATFORM_WEBHOOK_SECRET). Without a key
 * (development) plan changes apply immediately.
 */
export const billingConfigured = () => Boolean(process.env.STRIPE_PLATFORM_KEY);

export async function startSubscription(accountId: string, email: string, plan: PlanId, cycle: "monthly" | "yearly", extraUsers: number) {
  if (!billingConfigured()) {
    await db.update(schema.accounts).set({ plan, updatedAt: new Date() }).where(eq(schema.accounts.id, accountId));
    return null;
  }
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const p = PLANS[plan];
  const form = new URLSearchParams({
    mode: "subscription", customer_email: email, client_reference_id: accountId,
    success_url: `${base}/subscription?done=1`, cancel_url: `${base}/subscription`,
    "metadata[accountId]": accountId, "metadata[plan]": plan,
    "subscription_data[metadata][accountId]": accountId, "subscription_data[metadata][plan]": plan,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": String(cycle === "yearly" ? p.yearly : p.monthly),
    "line_items[0][price_data][recurring][interval]": cycle === "yearly" ? "year" : "month",
    "line_items[0][price_data][product_data][name]": `${p.name} plan`,
  });
  if (p.perUser && extraUsers > 0) {
    form.set("line_items[1][quantity]", String(extraUsers));
    form.set("line_items[1][price_data][currency]", "gbp");
    form.set("line_items[1][price_data][unit_amount]", String(cycle === "yearly" ? p.perUser * 10 : p.perUser));
    form.set("line_items[1][price_data][recurring][interval]", cycle === "yearly" ? "year" : "month");
    form.set("line_items[1][price_data][product_data][name]", "Additional user");
  }
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST", headers: { authorization: `Bearer ${process.env.STRIPE_PLATFORM_KEY}`, "content-type": "application/x-www-form-urlencoded" }, body: form,
  });
  const body = (await res.json()) as { url?: string; error?: { message: string } };
  if (!res.ok || !body.url) throw new Error(body.error?.message ?? "Could not start checkout");
  return body.url;
}

export function verifyStripeSignature(raw: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(nowSec - t) > 300 || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Apply a platform Stripe Billing event to the account's plan. */
export async function applyBillingEvent(event: { type: string; data: { object: { metadata?: Record<string, string>; status?: string } } }) {
  const obj = event.data.object;
  const accountId = obj.metadata?.accountId;
  const plan = obj.metadata?.plan as PlanId | undefined;
  if (!accountId) return;
  if (event.type === "checkout.session.completed" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const active = !obj.status || ["active", "trialing", "complete"].includes(obj.status);
    await db.update(schema.accounts).set({ plan: active && plan ? plan : "lapsed", updatedAt: new Date() }).where(eq(schema.accounts.id, accountId));
  }
  if (event.type === "customer.subscription.deleted") {
    await db.update(schema.accounts).set({ plan: "lapsed", updatedAt: new Date() }).where(eq(schema.accounts.id, accountId));
  }
}
