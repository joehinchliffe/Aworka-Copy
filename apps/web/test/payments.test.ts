import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/time";
import { createCustomerWithJob } from "@/lib/services/customers";
import { addJobToDay, completeJob } from "@/lib/services/planning";
import { createInvoice } from "@/lib/services/invoicing";
import { getIntegration } from "@/lib/services/integrations";
import {
  confirmCheckoutSession, connectStripe, createCheckoutSession, handleStripeWebhook, signStripePayload, verifyStripeSignature,
} from "@/lib/services/stripe";
import {
  authorizeUrl, completeConnect, handleGoCardlessWebhook, signGoCardlessPayload, signState, verifyGoCardlessSignature, verifyState,
} from "@/lib/services/gocardless";
import { confirmAppointment, ensurePortalToken, portalView } from "@/lib/services/portal";

const TODAY = todayIso();
const STRIPE_KEY = "sk_test_51abcdefghijklmnop";
const WHSEC = "whsec_testsecret";
const GC_SECRET = "gc_webhook_secret";
let accountId = "";
let userId = "";
let customerId = "";
let jobSpecId = "";

type Handler = (url: string, init: RequestInit) => unknown;
const calls: { url: string; init: RequestInit }[] = [];
/** Stub fetch with a router of [method path-prefix, handler]. */
function mockFetch(routes: Record<string, Handler>) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const method = init.method ?? "GET";
    const hit = Object.entries(routes).find(([k]) => {
      const [m, prefix] = k.split(" ") as [string, string];
      return m === method && url.startsWith(prefix);
    });
    if (!hit) return new Response(JSON.stringify({ error: { message: `unmocked ${method} ${url}` } }), { status: 404 });
    const out = hit[1](url, init);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

const customer = async () => (await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) }))!;
const paymentByRef = (ref: string) => db.query.payments.findFirst({ where: eq(schema.payments.providerRef, ref) });

beforeAll(async () => {
  vi.stubEnv("APP_URL", "https://rounds.test");
  vi.stubEnv("GOCARDLESS_CLIENT_ID", "gc_client");
  vi.stubEnv("GOCARDLESS_CLIENT_SECRET", "gc_client_secret");
  vi.stubEnv("GOCARDLESS_ENV", "sandbox");
  vi.stubEnv("GOCARDLESS_WEBHOOK_SECRET", GC_SECRET);
  await pg`truncate accounts cascade`;
  await pg`truncate webhook_events`;
  const { account, user } = await signup({ businessName: "Shine Ltd", name: "Pat", email: "pat@example.com", password: "password123" });
  accountId = account.id;
  userId = user.id;
  const r = await createCustomerWithJob(accountId, userId,
    { contact: { firstNames: "Jo", lastName: "Bloggs", address: "4 Elm Rd\nLeeds", postcode: "LS1 1AA", email: "jo@example.com" }, paymentMethod: "on_day" },
    { price: 20, appointments: "confirm_day_before", numPeriods: 4, periodUnit: "week", firstDueOn: TODAY }, TODAY);
  customerId = r.customer.id;
  jobSpecId = r.jobSpec.id;
  const job = await addJobToDay(accountId, userId, jobSpecId, TODAY, 0);
  await completeJob(accountId, userId, job.id, { status: "done" }, TODAY);
});
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(async () => { vi.unstubAllEnvs(); await pg.end(); });

describe("stripe signature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "ping" });
  const now = 1_800_000_000;
  it("accepts a valid signature", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, WHSEC, now), WHSEC, now + 10)).toBe(true);
    expect(verifyStripeSignature(body, `t=${now},v1=deadbeef,${signStripePayload(body, WHSEC, now).split(",")[1]}`, WHSEC, now)).toBe(true);
  });
  it("rejects a tampered body or wrong secret", () => {
    const h = signStripePayload(body, WHSEC, now);
    expect(verifyStripeSignature(body.replace("ping", "pong"), h, WHSEC, now)).toBe(false);
    expect(verifyStripeSignature(body, h, "whsec_other", now)).toBe(false);
    expect(verifyStripeSignature(body, null, WHSEC, now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", WHSEC, now)).toBe(false);
  });
  it("rejects a stale timestamp", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, WHSEC, now), WHSEC, now + 301)).toBe(false);
    expect(verifyStripeSignature(body, signStripePayload(body, WHSEC, now), WHSEC, now + 299)).toBe(true);
  });
});

describe("stripe payments", () => {
  it("rejects bad keys and stores good ones encrypted", async () => {
    await expect(connectStripe(accountId, "pk_test_abcdefghijkl")).rejects.toThrow(/secret key/);
    mockFetch({ "GET https://api.stripe.com/v1/checkout/sessions": () => ({ data: [] }) });
    await connectStripe(accountId, STRIPE_KEY, WHSEC);
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: `Bearer ${STRIPE_KEY}` });
    const row = await getIntegration(accountId, "stripe");
    expect(row?.config).toMatchObject({ mode: "test", keyHint: "mnop", webhook: true });
    expect(row?.secret).not.toContain("sk_test");
  });

  it("creates a checkout session for the amount owed", async () => {
    expect((await customer()).balance).toBe(-2000);
    mockFetch({ "POST https://api.stripe.com/v1/checkout/sessions": () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }) });
    const s = await createCheckoutSession(accountId, customerId, 2000, "Balance", "https://rounds.test/ok?session_id={CHECKOUT_SESSION_ID}", "https://rounds.test/no");
    expect(s.url).toContain("checkout.stripe.com");
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][currency]")).toBe("gbp");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("2000");
    expect(form.get("client_reference_id")).toBe(customerId);
    expect(form.get("metadata[customerId]")).toBe(customerId);
    expect(form.get("success_url")).toBe("https://rounds.test/ok?session_id={CHECKOUT_SESSION_ID}");
    await expect(createCheckoutSession(accountId, customerId, 10, "x", "a", "b")).rejects.toThrow(/too small/);
  });

  it("confirms a paid session exactly once", async () => {
    const session = { id: "cs_test_1", payment_status: "paid", amount_total: 1500, currency: "gbp", payment_intent: "pi_1", client_reference_id: customerId, metadata: { accountId, customerId, invoiceId: "" } };
    mockFetch({ "GET https://api.stripe.com/v1/checkout/sessions/cs_test_1": () => session });
    const first = await confirmCheckoutSession(accountId, "cs_test_1");
    const second = await confirmCheckoutSession(accountId, "cs_test_1");
    expect(first).toMatchObject({ paid: true, recorded: true, amount: 1500 });
    expect(second).toMatchObject({ paid: true, recorded: false });
    const pays = await db.select().from(schema.payments).where(and(eq(schema.payments.provider, "stripe"), eq(schema.payments.providerRef, "pi_1")));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ status: "cleared", paid: 1500, method: "stripe" });
    expect((await customer()).balance).toBe(-500);
  });

  it("ignores unpaid sessions", async () => {
    mockFetch({ "GET https://api.stripe.com/v1/checkout/sessions/cs_test_2": () => ({ id: "cs_test_2", payment_status: "unpaid", amount_total: 500, metadata: { customerId } }) });
    expect(await confirmCheckoutSession(accountId, "cs_test_2")).toMatchObject({ paid: false, recorded: false });
  });

  it("records checkout.session.completed webhooks idempotently", async () => {
    const event = { id: "evt_paid_1", type: "checkout.session.completed", data: { object: {
      id: "cs_test_3", payment_status: "paid", amount_total: 500, currency: "gbp", payment_intent: "pi_3", metadata: { accountId, customerId, invoiceId: "" },
    } } };
    const raw = JSON.stringify(event);
    expect((await handleStripeWebhook(accountId, raw, "t=1,v1=00")).status).toBe(400);
    const ok = await handleStripeWebhook(accountId, raw, signStripePayload(raw, WHSEC));
    expect(ok.status).toBe(200);
    const again = await handleStripeWebhook(accountId, raw, signStripePayload(raw, WHSEC));
    expect(again).toMatchObject({ status: 200, body: "Already processed" });
    expect(await paymentByRef("pi_3")).toMatchObject({ paid: 500, status: "cleared" });
    expect((await customer()).balance).toBe(0);
    const ev = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, "stripe:evt_paid_1") });
    expect(ev?.processedAt).toBeTruthy();
  });
});

describe("gocardless connect", () => {
  it("signs and verifies OAuth state", () => {
    const s = signState(accountId, 1000);
    expect(verifyState(s, 2000)).toBe(accountId);
    const mid = Math.floor(s.length * 0.75);
    expect(verifyState(s.slice(0, mid) + (s[mid] === "A" ? "B" : "A") + s.slice(mid + 1), 2000)).toBeNull();
    expect(verifyState(s, 1000 + 3_600_001)).toBeNull();
    const url = new URL(authorizeUrl(accountId, { email: "pat@example.com" }));
    expect(url.origin).toBe("https://connect-sandbox.gocardless.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://rounds.test/api/gocardless/callback");
    expect(url.searchParams.get("scope")).toBe("read_write");
    expect(url.searchParams.get("initial_view")).toBe("signup");
    expect(verifyState(url.searchParams.get("state"))).toBe(accountId);
  });

  it("exchanges the code and stores the token encrypted", async () => {
    mockFetch({ "POST https://connect-sandbox.gocardless.com/oauth/access_token": () => ({ access_token: "gc_live_token_xyz", organisation_id: "OR123", scope: "read_write", token_type: "bearer" }) });
    await completeConnect(accountId, "code123");
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("code123");
    const row = await getIntegration(accountId, "gocardless");
    expect(row?.externalId).toBe("OR123");
    expect(row?.secret).not.toContain("gc_live_token_xyz");
  });
});

describe("gocardless webhooks", () => {
  const deliver = (events: unknown[], sig?: string) => {
    const raw = JSON.stringify({ events });
    return handleGoCardlessWebhook(raw, sig ?? signGoCardlessPayload(raw, GC_SECRET));
  };

  it("verifies the signature", async () => {
    const raw = JSON.stringify({ events: [] });
    expect(verifyGoCardlessSignature(raw, signGoCardlessPayload(raw, GC_SECRET), GC_SECRET)).toBe(true);
    expect(verifyGoCardlessSignature(raw + " ", signGoCardlessPayload(raw, GC_SECRET), GC_SECRET)).toBe(false);
    expect((await deliver([], "abc123")).status).toBe(498);
    expect((await deliver([])).status).toBe(200);
  });

  it("stores the mandate when a billing request is fulfilled, then tracks its status", async () => {
    mockFetch({
      "GET https://api-sandbox.gocardless.com/billing_requests/BRQ1": () => ({ billing_requests: { id: "BRQ1", metadata: { rounds_customer_id: customerId }, links: { customer: "CU1", mandate_request_mandate: "MD1" } } }),
      "GET https://api-sandbox.gocardless.com/mandates/MD1": () => ({ mandates: { id: "MD1", status: "pending_submission" } }),
    });
    const r = await deliver([{ id: "EV1", resource_type: "billing_requests", action: "fulfilled", links: { organisation: "OR123", billing_request: "BRQ1", mandate_request_mandate: "MD1", customer: "CU1" } }]);
    expect(r.status).toBe(200);
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: "Bearer gc_live_token_xyz", "GoCardless-Version": "2015-07-06" });
    let c = await customer();
    expect(c).toMatchObject({ gocardlessMandateId: "MD1", gocardlessCustomerId: "CU1", mandateStatus: "pending" });

    await deliver([{ id: "EV2", resource_type: "mandates", action: "active", links: { organisation: "OR123", mandate: "MD1" } }]);
    c = await customer();
    expect(c.mandateStatus).toBe("active");
    // Events for an unknown organisation are ignored.
    await deliver([{ id: "EV3", resource_type: "mandates", action: "cancelled", links: { organisation: "OR999", mandate: "MD1" } }]);
    expect((await customer()).mandateStatus).toBe("active");
  });

  it("collects invoices automatically for Direct Debit customers", async () => {
    await db.update(schema.customers).set({ paymentMethod: "direct_debit" }).where(eq(schema.customers.id, customerId));
    const job = await addJobToDay(accountId, userId, jobSpecId, addDays(TODAY, 1), 0);
    await completeJob(accountId, userId, job.id, { status: "done" }, addDays(TODAY, 1));
    expect((await customer()).balance).toBe(-2000);
    mockFetch({ "POST https://api-sandbox.gocardless.com/payments": () => ({ payments: { id: "PM1", status: "pending_submission", charge_date: addDays(TODAY, 4) } }) });
    const inv = await createInvoice(accountId, customerId, addDays(TODAY, 1));
    expect(inv).not.toBeNull();
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.payments).toMatchObject({ amount: inv!.gross, currency: "GBP", links: { mandate: "MD1" } });
    expect(calls[0]!.init.headers).toMatchObject({ "Idempotency-Key": `invoice-${inv!.id}` });
    expect(await paymentByRef("PM1")).toMatchObject({ status: "pending", provider: "gocardless", invoiceId: inv!.id });
    expect((await customer()).balance).toBe(inv!.gross - 2000);
  });

  it("moves payments through confirmed and failed, keeping the balance right", async () => {
    await deliver([{ id: "EV4", resource_type: "payments", action: "confirmed", links: { organisation: "OR123", payment: "PM1" } }]);
    const pay = await paymentByRef("PM1");
    expect(pay?.status).toBe("cleared");
    expect((await customer()).balance).toBe(pay!.paid - 2000);
    expect((await db.query.invoices.findFirst({ where: eq(schema.invoices.id, pay!.invoiceId!) }))?.paidAt).toBeTruthy();

    const failed = [{ id: "EV5", resource_type: "payments", action: "charged_back", links: { organisation: "OR123", payment: "PM1" } }];
    await deliver(failed);
    await deliver(failed); // duplicate delivery is a no-op
    expect((await paymentByRef("PM1"))?.status).toBe("failed");
    expect((await customer()).balance).toBe(-2000);
    expect((await db.query.invoices.findFirst({ where: eq(schema.invoices.id, pay!.invoiceId!) }))?.paidAt).toBeNull();
  });

  it("updates mandate status on cancellation and handles disconnection", async () => {
    await deliver([{ id: "EV6", resource_type: "mandates", action: "cancelled", links: { organisation: "OR123", mandate: "MD1" } }]);
    expect((await customer()).mandateStatus).toBe("cancelled");
    await deliver([{ id: "EV7", resource_type: "organisations", action: "disconnected", links: { organisation: "OR123" } }]);
    expect(await getIntegration(accountId, "gocardless")).toBeNull();
  });
});

describe("customer portal", () => {
  it("creates a stable portal token", async () => {
    const t1 = await ensurePortalToken(customerId);
    const t2 = await ensurePortalToken(customerId);
    expect(t1).toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(24);
  });

  it("shows balance, invoices and appointments, and lets the customer confirm", async () => {
    const token = await ensurePortalToken(customerId);
    const next = addDays(TODAY, 14);
    const job = await addJobToDay(accountId, userId, jobSpecId, next, 0);
    expect(job.confirmed).toBe(false);
    const v = await portalView(token, TODAY);
    expect(v?.owed).toBe(2000);
    expect(v?.name).toBe("Jo Bloggs");
    expect(v?.invoices).toHaveLength(1);
    expect(v?.canPayByCard).toBe(true);
    expect(v?.canSetUpDirectDebit).toBe(false); // GoCardless was disconnected
    expect(v?.jobs.find((j) => j.id === job.id)?.confirmed).toBe(false);

    expect(await confirmAppointment("x".repeat(32), job.id)).toBe(false);
    expect(await confirmAppointment(token, job.id)).toBe(true);
    expect(await confirmAppointment(token, job.id)).toBe(false);
    expect((await db.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) }))?.confirmed).toBe(true);
    expect(await portalView("not-a-real-token-at-all", TODAY)).toBeNull();
  });
});
