import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { makeState } from "./hmrc";
import { contactName } from "./ledger";

/**
 * QuickBooks Online push sync. Env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENV=sandbox|production, APP_URL.
 * Access tokens last 1 hour; refresh tokens rotate and are stored encrypted.
 */
const apiBase = () => (process.env.QBO_ENV === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com");
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const redirectUri = () => `${process.env.APP_URL ?? "http://localhost:3000"}/api/quickbooks/callback`;
const MINOR = "minorversion=75";

export function qboAuthorizeUrl(accountId: string) {
  const q = new URLSearchParams({ client_id: process.env.QBO_CLIENT_ID ?? "", response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: redirectUri(), state: makeState(accountId, "quickbooks") });
  return `https://appcenter.intuit.com/connect/oauth2?${q}`;
}

interface QboTokens { access_token: string; refresh_token: string; expires_at: number; realmId: string }

async function token(body: Record<string, string>) {
  const basic = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(body) });
  if (!res.ok) throw new Error(`QuickBooks token request failed (${res.status})`);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

export async function qboExchangeCode(accountId: string, code: string, realmId: string) {
  const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  const tokens: QboTokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000, realmId };
  await db.insert(schema.integrations).values({ accountId, provider: "quickbooks", externalId: realmId, secret: encrypt(tokens), config: { maps: {} } })
    .onConflictDoUpdate({ target: [schema.integrations.accountId, schema.integrations.provider], set: { externalId: realmId, secret: encrypt(tokens), status: "connected", updatedAt: new Date() } });
}

async function connection(accountId: string) {
  const row = await db.query.integrations.findFirst({ where: and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, "quickbooks")) });
  if (!row?.secret) throw new Error("QuickBooks is not connected");
  let tokens = decrypt<QboTokens>(row.secret);
  if (tokens.expires_at - Date.now() < 300_000) {
    const t = await token({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    tokens = { ...tokens, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
    await db.update(schema.integrations).set({ secret: encrypt(tokens), updatedAt: new Date() }).where(eq(schema.integrations.id, row.id));
  }
  return { row, tokens };
}

async function qbo(accountId: string, path: string, body?: unknown) {
  const { tokens } = await connection(accountId);
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${apiBase()}/v3/company/${tokens.realmId}/${path}${sep}${MINOR}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`QuickBooks ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

/** Local id -> QuickBooks id, kept in integrations.config.maps to avoid duplicates. */
async function remember(accountId: string, kind: string, localId: string, qboId: string) {
  const { row } = await connection(accountId);
  const maps = ((row.config as { maps?: Record<string, Record<string, string>> }).maps ?? {});
  maps[kind] = { ...(maps[kind] ?? {}), [localId]: qboId };
  await db.update(schema.integrations).set({ config: { ...row.config, maps } }).where(eq(schema.integrations.id, row.id));
}
async function recall(accountId: string, kind: string, localId: string) {
  const { row } = await connection(accountId);
  return (row.config as { maps?: Record<string, Record<string, string>> }).maps?.[kind]?.[localId];
}

export async function pushCustomer(accountId: string, customerId: string): Promise<string> {
  const existing = await recall(accountId, "customer", customerId);
  if (existing) return existing;
  const r = (await db.select({ c: schema.customers, contact: schema.contacts }).from(schema.customers)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId)).where(eq(schema.customers.id, customerId)).limit(1))[0];
  if (!r) throw new Error("Customer not found");
  const name = `${contactName(r.contact)}${r.c.reference ? ` (${r.c.reference})` : ` ${customerId.slice(0, 6)}`}`;
  const res = (await qbo(accountId, "customer", {
    DisplayName: name.slice(0, 100), CompanyName: r.contact.company ?? undefined,
    PrimaryEmailAddr: r.contact.email ? { Address: r.contact.email } : undefined,
    PrimaryPhone: r.contact.phone1 ? { FreeFormNumber: r.contact.phone1 } : undefined,
    BillAddr: r.contact.address ? { Line1: r.contact.address.split("\n")[0], PostalCode: r.contact.postcode ?? undefined } : undefined,
  })) as { Customer: { Id: string } };
  await remember(accountId, "customer", customerId, res.Customer.Id);
  return res.Customer.Id;
}

/** Push an invoice; lines go to the configured income item (QBO_ITEM_ID setting, default "1"). VAT codes per line when VAT applies. */
export async function pushInvoice(accountId: string, invoiceId: string) {
  const existing = await recall(accountId, "invoice", invoiceId);
  if (existing) return existing;
  const inv = await db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.accountId, accountId)) });
  if (!inv) throw new Error("Invoice not found");
  const customerRef = await pushCustomer(accountId, inv.customerId);
  const { row } = await connection(accountId);
  const cfg = row.config as { itemId?: string; vatCode?: string; zeroCode?: string };
  const res = (await qbo(accountId, "invoice", {
    DocNumber: inv.number, TxnDate: inv.issuedOn, DueDate: inv.dueOn ?? undefined, CustomerRef: { value: customerRef },
    GlobalTaxCalculation: inv.vat ? "TaxExcluded" : "NotApplicable",
    Line: inv.lines.map((l) => ({
      DetailType: "SalesItemLineDetail", Amount: l.net / 100, Description: `${l.date} ${l.description}`,
      SalesItemLineDetail: { ItemRef: { value: cfg.itemId ?? "1" }, TaxCodeRef: inv.vat ? { value: l.vat ? cfg.vatCode ?? "2" : cfg.zeroCode ?? "4" } : undefined },
    })),
  })) as { Invoice: { Id: string } };
  await remember(accountId, "invoice", invoiceId, res.Invoice.Id);
  return res.Invoice.Id;
}

export async function pushPayment(accountId: string, paymentId: string) {
  const existing = await recall(accountId, "payment", paymentId);
  if (existing) return existing;
  const p = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, paymentId), eq(schema.payments.accountId, accountId)) });
  if (!p) throw new Error("Payment not found");
  const customerRef = await pushCustomer(accountId, p.customerId);
  const invoiceRef = p.invoiceId ? await recall(accountId, "invoice", p.invoiceId) : undefined;
  const res = (await qbo(accountId, "payment", {
    TxnDate: p.date, TotalAmt: (p.paid - p.tip) / 100, CustomerRef: { value: customerRef },
    Line: invoiceRef ? [{ Amount: (p.paid - p.tip) / 100, LinkedTxn: [{ TxnId: invoiceRef, TxnType: "Invoice" }] }] : undefined,
  })) as { Payment: { Id: string } };
  await remember(accountId, "payment", paymentId, res.Payment.Id);
  return res.Payment.Id;
}

/** Sync all invoices and payments not yet pushed. Nightly step for connected accounts. */
export async function syncQuickBooks(accountId: string) {
  const conn = await db.query.integrations.findFirst({ where: and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, "quickbooks")) });
  if (!conn || conn.status !== "connected") return { skipped: true };
  const invoices = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.accountId, accountId));
  const payments = await db.select({ id: schema.payments.id }).from(schema.payments).where(and(eq(schema.payments.accountId, accountId), eq(schema.payments.status, "cleared")));
  let pushed = 0, failed = 0;
  for (const i of invoices) { try { await pushInvoice(accountId, i.id); pushed++; } catch { failed++; } }
  for (const p of payments) { try { await pushPayment(accountId, p.id); pushed++; } catch { failed++; } }
  return { pushed, failed };
}
