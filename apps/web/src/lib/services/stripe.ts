import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { todayIso } from "@/lib/time";
import { getIntegration, integrationSecret, saveIntegration } from "./integrations";
import { claimWebhookEvent, finishWebhookEvent, recordProviderPayment } from "./providerPayments";

const API = "https://api.stripe.com/v1";
/** Stripe's minimum charge in GBP. */
export const STRIPE_MIN_PENCE = 30;
const TOLERANCE_SECONDS = 300;

export interface StripeSecret { secretKey: string; webhookSecret?: string | null }

interface CheckoutSession {
  id: string;
  url?: string | null;
  payment_status?: string;
  status?: string;
  amount_total?: number | null;
  currency?: string;
  client_reference_id?: string | null;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string>;
}

export class StripeError extends Error {}

/** Flatten nested params into Stripe's form encoding: a[b][0][c]=v. */
export function formEncode(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  const walk = (prefix: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((item, i) => walk(`${prefix}[${i}]`, item));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(prefix ? `${prefix}[${k}]` : k, x);
    else out.append(prefix, String(v));
  };
  walk("", params);
  return out.toString();
}

async function stripeFetch<T>(secretKey: string, method: "GET" | "POST", path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? formEncode(body) : undefined });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe request failed (${res.status})`);
  return json;
}

export function isValidStripeKey(key: string) {
  return /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/.test(key);
}

/** Validate and store the business's own Stripe keys. Checks the key against the API first. */
export async function connectStripe(accountId: string, secretKey: string, webhookSecret?: string | null) {
  const key = secretKey.trim();
  const whsec = webhookSecret?.trim() || null;
  if (!isValidStripeKey(key)) throw new StripeError("That doesn't look like a Stripe secret key (it should start sk_test_, sk_live_ or rk_)");
  if (whsec && !whsec.startsWith("whsec_")) throw new StripeError("The webhook signing secret should start whsec_");
  await stripeFetch(key, "GET", "/checkout/sessions?limit=1");
  await saveIntegration(accountId, "stripe", {
    secret: { secretKey: key, webhookSecret: whsec } satisfies StripeSecret,
    config: { mode: key.includes("_live_") ? "live" : "test", keyHint: key.slice(-4), webhook: !!whsec },
  });
}

async function stripeKeys(accountId: string): Promise<StripeSecret | null> {
  const row = await getIntegration(accountId, "stripe");
  return row ? integrationSecret<StripeSecret>(row) : null;
}

export async function stripeConnected(accountId: string) {
  return !!(await getIntegration(accountId, "stripe"));
}

/** Start a hosted card payment. Returns the Stripe-hosted URL to send the payer to. */
export async function createCheckoutSession(
  accountId: string, customerId: string, amountPence: number, description: string, successUrl: string, cancelUrl: string,
  opts: { invoiceId?: string | null; email?: string | null } = {},
): Promise<{ id: string; url: string }> {
  const keys = await stripeKeys(accountId);
  if (!keys) throw new StripeError("Card payments are not set up for this business");
  if (!Number.isInteger(amountPence) || amountPence < STRIPE_MIN_PENCE) throw new StripeError("The amount is too small to pay by card");
  const customer = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
  if (!customer) throw new StripeError("Customer not found");
  const metadata = { accountId, customerId, invoiceId: opts.invoiceId ?? "" };
  const session = await stripeFetch<CheckoutSession>(keys.secretKey, "POST", "/checkout/sessions", {
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: customerId,
    customer_email: opts.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: amountPence, product_data: { name: description.slice(0, 250) || "Payment" } } }],
    metadata,
    payment_intent_data: { description: description.slice(0, 250), metadata },
  });
  if (!session.url) throw new StripeError("Stripe did not return a payment page");
  return { id: session.id, url: session.url };
}

/** Record a paid Checkout Session as a cleared payment (idempotent). */
async function recordSession(accountId: string, session: CheckoutSession) {
  if (session.payment_status !== "paid") return { recorded: false, paid: false, customerId: session.metadata?.customerId ?? null };
  const customerId = session.metadata?.customerId || session.client_reference_id;
  if (!customerId) throw new StripeError("Checkout session has no customer reference");
  if (session.metadata?.accountId && session.metadata.accountId !== accountId) throw new StripeError("Checkout session belongs to another account");
  if ((session.currency ?? "gbp").toLowerCase() !== "gbp") throw new StripeError("Only GBP payments are supported");
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const r = await recordProviderPayment({
    accountId, customerId, invoiceId: session.metadata?.invoiceId || null, provider: "stripe", providerRef: pi ?? session.id,
    amount: session.amount_total ?? 0, status: "cleared", date: todayIso(), reference: "Card (online)",
  });
  return { recorded: r.inserted, paid: true, customerId };
}

/** Called from the success page: look the session up and record it if paid. */
export async function confirmCheckoutSession(accountId: string, sessionId: string) {
  const keys = await stripeKeys(accountId);
  if (!keys) throw new StripeError("Card payments are not set up for this business");
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new StripeError("Invalid checkout session");
  const session = await stripeFetch<CheckoutSession>(keys.secretKey, "GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  return { ...(await recordSession(accountId, session)), amount: session.amount_total ?? 0 };
}

/** Verify a Stripe-Signature header: t=<unix>,v1=<hex hmac of `${t}.${body}`>. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), tolerance = TOLERANCE_SECONDS): boolean {
  if (!header) return false;
  let t: string | undefined;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x?.trim());
    if (k === "t") t = v;
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(nowSeconds - Number(t)) > tolerance) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Build a header Stripe would send (used by tests and local tooling). */
export function signStripePayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex")}`;
}

/** Handle a webhook delivery for one account. Returns the HTTP status and body to send back. */
export async function handleStripeWebhook(accountId: string, rawBody: string, signature: string | null, nowSeconds?: number): Promise<{ status: number; body: string }> {
  const keys = await stripeKeys(accountId).catch(() => null);
  if (!keys?.webhookSecret) return { status: 400, body: "Webhooks are not configured" };
  if (!verifyStripeSignature(rawBody, signature, keys.webhookSecret, nowSeconds)) return { status: 400, body: "Invalid signature" };
  let event: { id?: string; type?: string; data?: { object?: CheckoutSession } };
  try { event = JSON.parse(rawBody); } catch { return { status: 400, body: "Invalid JSON" }; }
  if (!event.id) return { status: 400, body: "Missing event id" };
  const key = `stripe:${event.id}`;
  if (!(await claimWebhookEvent(key, "stripe", accountId, event))) return { status: 200, body: "Already processed" };
  try {
    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && event.data?.object) {
      await recordSession(accountId, event.data.object);
    }
    await finishWebhookEvent(key);
    return { status: 200, body: "ok" };
  } catch (e) {
    await finishWebhookEvent(key, e instanceof Error ? e.message : "error");
    return { status: 500, body: "Processing failed" };
  }
}
