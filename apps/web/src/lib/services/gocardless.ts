import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { todayIso } from "@/lib/time";
import { appUrl, disconnectIntegration, getIntegration, integrationSecret, saveIntegration } from "./integrations";
import { claimWebhookEvent, finishWebhookEvent, recordProviderPayment, setProviderPaymentStatus } from "./providerPayments";

/** GoCardless partner app integration (OAuth connect, Billing Request Flow mandates, payments, webhooks). */

export class GoCardlessError extends Error {}

interface GcSecret { accessToken: string }

const live = () => process.env.GOCARDLESS_ENV === "live";
export const gcApiBase = () => (live() ? "https://api.gocardless.com" : "https://api-sandbox.gocardless.com");
export const gcConnectBase = () => (live() ? "https://connect.gocardless.com" : "https://connect-sandbox.gocardless.com");
export const gcRedirectUri = () => `${appUrl()}/api/gocardless/callback`;
export const gcConfigured = () => !!(process.env.GOCARDLESS_CLIENT_ID && process.env.GOCARDLESS_CLIENT_SECRET);

function stateKey() {
  const secret = process.env.APP_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set in production");
  return secret ?? "dev-only-secret-change-me";
}

/** OAuth state: accountId.issuedAt.hmac — ties the callback to the account that started it. */
export function signState(accountId: string, now = Date.now()) {
  const body = `${accountId}.${now}`;
  return `${body}.${createHmac("sha256", stateKey()).update(body).digest("base64url")}`;
}

export function verifyState(state: string | null, now = Date.now(), maxAgeMs = 3_600_000): string | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [accountId, issued, sig] = parts as [string, string, string];
  const expected = createHmac("sha256", stateKey()).update(`${accountId}.${issued}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  if (!(now - Number(issued) <= maxAgeMs && Number(issued) <= now + 60_000)) return null;
  return accountId;
}

export function authorizeUrl(accountId: string, prefill: { email?: string | null; organisationName?: string | null } = {}) {
  if (!gcConfigured()) throw new GoCardlessError("GoCardless is not configured on this server");
  const q = new URLSearchParams({
    client_id: process.env.GOCARDLESS_CLIENT_ID!, redirect_uri: gcRedirectUri(), response_type: "code",
    scope: "read_write", initial_view: "signup", state: signState(accountId),
  });
  if (prefill.email) q.set("prefill[email]", prefill.email);
  if (prefill.organisationName) q.set("prefill[organisation_name]", prefill.organisationName);
  return `${gcConnectBase()}/oauth/authorize?${q}`;
}

/** Exchange the OAuth code for a permanent access token and store it for the account. */
export async function completeConnect(accountId: string, code: string) {
  if (!gcConfigured()) throw new GoCardlessError("GoCardless is not configured on this server");
  const res = await fetch(`${gcConnectBase()}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: gcRedirectUri(),
      client_id: process.env.GOCARDLESS_CLIENT_ID!, client_secret: process.env.GOCARDLESS_CLIENT_SECRET!,
    }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; organisation_id?: string; email?: string; error_description?: string; error?: string };
  if (!res.ok || !json.access_token || !json.organisation_id) {
    throw new GoCardlessError(json.error_description ?? json.error ?? `GoCardless connection failed (${res.status})`);
  }
  await saveIntegration(accountId, "gocardless", {
    secret: { accessToken: json.access_token } satisfies GcSecret, externalId: json.organisation_id,
    config: { environment: live() ? "live" : "sandbox", email: json.email ?? null },
  });
}

async function gcToken(accountId: string): Promise<string | null> {
  const row = await getIntegration(accountId, "gocardless");
  return row ? integrationSecret<GcSecret>(row).accessToken : null;
}

export async function gocardlessConnected(accountId: string) {
  return gcConfigured() && !!(await getIntegration(accountId, "gocardless"));
}

async function gcFetch<T>(token: string, method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`, "GoCardless-Version": "2015-07-06", Accept: "application/json",
  };
  if (body) headers["Content-Type"] = "application/json";
  if (method === "POST") headers["Idempotency-Key"] = idempotencyKey ?? randomUUID();
  const res = await fetch(`${gcApiBase()}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { message?: string; field?: string }[] } } & T;
  if (!res.ok) {
    const detail = json.error?.errors?.map((e) => [e.field, e.message].filter(Boolean).join(" ")).join("; ");
    throw new GoCardlessError(detail || json.error?.message || `GoCardless request failed (${res.status})`);
  }
  return json;
}

/** Create a hosted Direct Debit setup link (Billing Request Flow) for a customer. */
export async function createMandateSetupLink(accountId: string, customerId: string, redirectUri: string, exitUri: string): Promise<string> {
  const token = await gcToken(accountId);
  if (!token || !gcConfigured()) throw new GoCardlessError("Direct Debit is not set up for this business");
  const row = (await db.select({ customer: schema.customers, contact: schema.contacts }).from(schema.customers)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .where(and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId))).limit(1))[0];
  if (!row) throw new GoCardlessError("Customer not found");
  const { customer, contact } = row;
  const br = await gcFetch<{ billing_requests: { id: string } }>(token, "POST", "/billing_requests", {
    billing_requests: {
      mandate_request: { scheme: "bacs", currency: "GBP" },
      metadata: { rounds_customer_id: customerId },
      ...(customer.gocardlessCustomerId ? { links: { customer: customer.gocardlessCustomerId } } : {}),
    },
  });
  const lines = (contact.address ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const prefilled = Object.fromEntries(Object.entries({
    given_name: contact.firstNames, family_name: contact.lastName, email: contact.email, company_name: contact.company,
    address_line1: lines[0], address_line2: lines.length > 2 ? lines[1] : undefined, city: lines.length > 1 ? lines[lines.length - 1] : undefined,
    postal_code: contact.postcode, country_code: "GB",
  }).filter(([, v]) => !!v));
  const flow = await gcFetch<{ billing_request_flows: { authorisation_url: string } }>(token, "POST", "/billing_request_flows", {
    billing_request_flows: { redirect_uri: redirectUri, exit_uri: exitUri, links: { billing_request: br.billing_requests.id }, prefilled_customer: prefilled },
  });
  return flow.billing_request_flows.authorisation_url;
}

/** Take a Direct Debit payment against the customer's mandate and record it as pending. */
export async function collectPayment(
  accountId: string, customerId: string, amountPence: number, description: string, chargeDate?: string | null,
  opts: { invoiceId?: string | null; idempotencyKey?: string } = {},
) {
  const token = await gcToken(accountId);
  if (!token || !gcConfigured()) throw new GoCardlessError("Direct Debit is not set up for this business");
  const customer = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)) });
  if (!customer) throw new GoCardlessError("Customer not found");
  if (!customer.gocardlessMandateId || !["active", "pending"].includes(customer.mandateStatus ?? "")) {
    throw new GoCardlessError("This customer has no usable Direct Debit mandate");
  }
  if (!Number.isInteger(amountPence) || amountPence < 100) throw new GoCardlessError("Direct Debit payments must be at least £1.00");
  const res = await gcFetch<{ payments: { id: string; charge_date?: string; status?: string } }>(token, "POST", "/payments", {
    payments: {
      amount: amountPence, currency: "GBP", description: description.slice(0, 100),
      ...(chargeDate ? { charge_date: chargeDate } : {}),
      metadata: { rounds_customer_id: customerId, ...(opts.invoiceId ? { rounds_invoice_id: opts.invoiceId } : {}) },
      links: { mandate: customer.gocardlessMandateId },
    },
  }, opts.idempotencyKey);
  const p = res.payments;
  await recordProviderPayment({
    accountId, customerId, invoiceId: opts.invoiceId ?? null, provider: "gocardless", providerRef: p.id, amount: amountPence,
    status: "pending", date: p.charge_date ?? chargeDate ?? todayIso(), reference: "Direct Debit",
  });
  return p;
}

/**
 * Hook for the invoicing service: when a Direct Debit customer with an active mandate is
 * invoiced, collect the invoice total automatically. Never throws.
 */
export async function onInvoiceCreated(accountId: string, invoiceId: string): Promise<string | null> {
  try {
    const inv = await db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.accountId, accountId)) });
    if (!inv || inv.kind !== "invoice" || inv.gross <= 0) return null;
    const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, inv.customerId) });
    if (!customer || customer.paymentMethod !== "direct_debit" || customer.mandateStatus !== "active" || !customer.gocardlessMandateId) return null;
    if (!(await gocardlessConnected(accountId))) return null;
    const p = await collectPayment(accountId, customer.id, inv.gross, `Invoice ${inv.number}`, null, { invoiceId: inv.id, idempotencyKey: `invoice-${inv.id}` });
    return p.id;
  } catch (e) {
    console.error(`Direct Debit collection for invoice ${invoiceId} failed: ${e instanceof Error ? e.message : "error"}`);
    return null;
  }
}

export function signGoCardlessPayload(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyGoCardlessSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !/^[0-9a-f]+$/i.test(header)) return false;
  const expected = Buffer.from(signGoCardlessPayload(rawBody, secret), "hex");
  const got = Buffer.from(header, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

interface GcEvent {
  id: string;
  resource_type: string;
  action: string;
  links?: Record<string, string | undefined>;
  details?: { cause?: string; description?: string };
}

const MANDATE_STATUS: Record<string, string> = {
  created: "pending", submitted: "pending", customer_approval_granted: "pending", resubmission_requested: "pending",
  active: "active", reinstated: "active",
  cancelled: "cancelled", expired: "cancelled", consumed: "cancelled", blocked: "cancelled",
  failed: "failed",
};
const MANDATE_API_STATUS: Record<string, string> = {
  pending_customer_approval: "pending", pending_submission: "pending", submitted: "pending", active: "active",
  suspended_by_payer: "cancelled", cancelled: "cancelled", expired: "cancelled", consumed: "cancelled", blocked: "cancelled", failed: "failed",
};
const PAYMENT_STATUS: Record<string, "pending" | "cleared" | "failed"> = {
  confirmed: "cleared", paid_out: "cleared",
  failed: "failed", cancelled: "failed", charged_back: "failed", late_failure_settled: "failed",
  resubmission_requested: "pending", chargeback_cancelled: "cleared",
};

async function handleEvent(accountId: string, ev: GcEvent) {
  const today = todayIso();
  const links = ev.links ?? {};
  if (ev.resource_type === "mandates" && links.mandate) {
    const status = MANDATE_STATUS[ev.action];
    if (status) {
      await db.update(schema.customers).set({ mandateStatus: status, updatedAt: new Date() })
        .where(and(eq(schema.customers.accountId, accountId), eq(schema.customers.gocardlessMandateId, links.mandate)));
    }
    if (ev.action === "replaced" && links.new_mandate) {
      await db.update(schema.customers).set({ gocardlessMandateId: links.new_mandate, mandateStatus: "active", updatedAt: new Date() })
        .where(and(eq(schema.customers.accountId, accountId), eq(schema.customers.gocardlessMandateId, links.mandate)));
    }
  } else if (ev.resource_type === "billing_requests" && ev.action === "fulfilled" && links.billing_request) {
    const token = await gcToken(accountId);
    if (!token) return;
    const br = await gcFetch<{ billing_requests: { metadata?: Record<string, string>; links?: Record<string, string> } }>(
      token, "GET", `/billing_requests/${encodeURIComponent(links.billing_request)}`);
    const customerId = br.billing_requests.metadata?.rounds_customer_id;
    const mandateId = links.mandate_request_mandate ?? br.billing_requests.links?.mandate_request_mandate;
    if (!customerId || !mandateId) return;
    let status = "pending";
    try {
      const m = await gcFetch<{ mandates: { status: string } }>(token, "GET", `/mandates/${encodeURIComponent(mandateId)}`);
      status = MANDATE_API_STATUS[m.mandates.status] ?? "pending";
    } catch { /* keep pending; mandate events will update it */ }
    await db.update(schema.customers).set({
      gocardlessMandateId: mandateId, mandateStatus: status,
      gocardlessCustomerId: links.customer ?? br.billing_requests.links?.customer ?? undefined, updatedAt: new Date(),
    }).where(and(eq(schema.customers.id, customerId), eq(schema.customers.accountId, accountId)));
  } else if (ev.resource_type === "payments" && links.payment) {
    const status = PAYMENT_STATUS[ev.action];
    if (status) await setProviderPaymentStatus("gocardless", links.payment, status, today, accountId);
  } else if (ev.resource_type === "organisations" && ev.action === "disconnected") {
    await disconnectIntegration(accountId, "gocardless");
  }
}

/** Handle a delivery to the single partner webhook endpoint. */
export async function handleGoCardlessWebhook(rawBody: string, signature: string | null): Promise<{ status: number; body: string }> {
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret) return { status: 500, body: "Webhook secret not configured" };
  if (!verifyGoCardlessSignature(rawBody, signature, secret)) return { status: 498, body: "Invalid signature" };
  let events: GcEvent[];
  try { events = (JSON.parse(rawBody) as { events?: GcEvent[] }).events ?? []; } catch { return { status: 400, body: "Invalid JSON" }; }
  let failed = false;
  for (const ev of events) {
    if (!ev?.id) continue;
    const org = ev.links?.organisation;
    const integ = org ? await db.query.integrations.findFirst({
      where: and(eq(schema.integrations.provider, "gocardless"), eq(schema.integrations.externalId, org)),
    }) : null;
    const key = `gocardless:${ev.id}`;
    if (!(await claimWebhookEvent(key, "gocardless", integ?.accountId ?? null, ev))) continue;
    if (!integ) { await finishWebhookEvent(key, "Unknown organisation"); continue; }
    try {
      await handleEvent(integ.accountId, ev);
      await finishWebhookEvent(key);
    } catch (e) {
      failed = true;
      await finishWebhookEvent(key, e instanceof Error ? e.message : "error");
    }
  }
  return failed ? { status: 500, body: "Some events failed" } : { status: 200, body: "ok" };
}
