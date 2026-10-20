import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * HMRC Making Tax Digital client: OAuth (user-restricted), fraud-prevention
 * headers and the VAT and Income Tax endpoints the product uses.
 * Env: HMRC_CLIENT_ID, HMRC_CLIENT_SECRET, HMRC_ENV=sandbox|production, APP_URL.
 */
const isProd = () => process.env.HMRC_ENV === "production";
export const hmrcApiBase = () => (isProd() ? "https://api.service.hmrc.gov.uk" : "https://test-api.service.hmrc.gov.uk");
const authBase = () => (isProd() ? "https://www.tax.service.gov.uk" : "https://test-www.tax.service.gov.uk");
const redirectUri = () => `${process.env.APP_URL ?? "http://localhost:3000"}/api/hmrc/callback`;

export const HMRC_SCOPES = {
  vat: "read:vat write:vat",
  income_tax: "read:self-assessment write:self-assessment",
  vat_and_income_tax: "read:vat write:vat read:self-assessment write:self-assessment",
} as const;

function sign(value: string) {
  return createHmac("sha256", process.env.APP_SECRET ?? "dev-only-secret-change-me").update(value).digest("base64url");
}
export function makeState(accountId: string) {
  return `${accountId}.${sign(accountId)}`;
}
export function readState(state: string): string | null {
  const [id, mac] = state.split(".");
  if (!id || !mac) return null;
  const a = Buffer.from(mac), b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function authorizeUrl(accountId: string, scope: keyof typeof HMRC_SCOPES) {
  const q = new URLSearchParams({
    response_type: "code", client_id: process.env.HMRC_CLIENT_ID ?? "", scope: HMRC_SCOPES[scope],
    state: makeState(accountId), redirect_uri: redirectUri(),
  });
  return `${authBase()}/oauth/authorize?${q}`;
}

interface Tokens { access_token: string; refresh_token: string; expires_at: number; scope: string }

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${hmrcApiBase()}/oauth/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.HMRC_CLIENT_ID ?? "", client_secret: process.env.HMRC_CLIENT_SECRET ?? "", ...body }),
  });
  if (!res.ok) throw new Error(`HMRC token request failed (${res.status})`);
  const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; scope: string };
  return { access_token: t.access_token, refresh_token: t.refresh_token, scope: t.scope, expires_at: Date.now() + t.expires_in * 1000 };
}

export async function exchangeCode(accountId: string, code: string) {
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  await db.insert(schema.integrations).values({ accountId, provider: "hmrc", secret: encrypt(tokens), config: { scope: tokens.scope } })
    .onConflictDoUpdate({ target: [schema.integrations.accountId, schema.integrations.provider], set: { secret: encrypt(tokens), status: "connected", config: { scope: tokens.scope }, updatedAt: new Date() } });
}

/** Valid access token, refreshing (single-use rotating refresh token) when within 5 minutes of expiry. */
export async function accessToken(accountId: string): Promise<string> {
  const row = await db.query.integrations.findFirst({ where: and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, "hmrc")) });
  if (!row?.secret) throw new Error("HMRC is not connected");
  let tokens = decrypt<Tokens>(row.secret);
  if (tokens.expires_at - Date.now() < 300_000) {
    tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    await db.update(schema.integrations).set({ secret: encrypt(tokens), updatedAt: new Date() }).where(eq(schema.integrations.id, row.id));
  }
  return tokens.access_token;
}

/** Device and connection facts collected in the browser and at the server for fraud-prevention headers. */
export interface ClientFacts {
  deviceId: string;
  userId: string;
  publicIp: string;
  publicIpTimestamp: string; // ISO 8601 with milliseconds
  publicPort?: string;
  userAgent: string;
  screens: { width: number; height: number; scalingFactor: number; colourDepth: number };
  windowSize: { width: number; height: number };
  timezoneOffsetMinutes: number; // as from Date#getTimezoneOffset (minutes behind UTC)
  multiFactor?: { type: "TOTP" | "AUTH_CODE" | "OTHER"; timestamp: string; uniqueReference: string }[];
}

const pct = (s: string) => encodeURIComponent(s);

function utcOffset(minutesBehind: number) {
  const total = -minutesBehind;
  const sign = total >= 0 ? "+" : "-";
  const abs = Math.abs(total);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Headers required for the WEB_APP_VIA_SERVER connection method. */
export function fraudHeaders(c: ClientFacts, vendor: { publicIp: string; version: string; forwardedHops?: { by: string; for: string }[] }) {
  const h: Record<string, string> = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": c.userAgent,
    "Gov-Client-Device-ID": c.deviceId,
    "Gov-Client-Public-IP": c.publicIp,
    "Gov-Client-Public-IP-Timestamp": c.publicIpTimestamp,
    "Gov-Client-Screens": `width=${c.screens.width}&height=${c.screens.height}&scaling-factor=${c.screens.scalingFactor}&colour-depth=${c.screens.colourDepth}`,
    "Gov-Client-Timezone": utcOffset(c.timezoneOffsetMinutes),
    "Gov-Client-User-IDs": `rounds=${pct(c.userId)}`,
    "Gov-Client-Window-Size": `width=${c.windowSize.width}&height=${c.windowSize.height}`,
    "Gov-Vendor-Product-Name": pct("Rounds"),
    "Gov-Vendor-Version": `rounds-web=${pct(vendor.version)}`,
    "Gov-Vendor-Public-IP": vendor.publicIp,
    "Gov-Vendor-Forwarded": (vendor.forwardedHops ?? [{ by: vendor.publicIp, for: c.publicIp }]).map((f) => `by=${f.by}&for=${f.for}`).join(","),
  };
  if (c.publicPort) h["Gov-Client-Public-Port"] = c.publicPort;
  if (c.multiFactor?.length) {
    h["Gov-Client-Multi-Factor"] = c.multiFactor.map((m) => `type=${m.type}&timestamp=${pct(m.timestamp)}&unique-reference=${pct(m.uniqueReference)}`).join(",");
  }
  return h;
}

async function hmrcFetch(accountId: string, path: string, version: string, fraud: Record<string, string>, init: RequestInit = {}) {
  const token = await accessToken(accountId);
  const res = await fetch(`${hmrcApiBase()}${path}`, {
    ...init,
    headers: { Accept: `application/vnd.hmrc.${version}+json`, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...fraud, ...(init.headers ?? {}) },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HMRC ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export interface VatObligation { periodKey: string; start: string; end: string; due: string; status: "O" | "F"; received?: string }

export async function vatObligations(accountId: string, vrn: string, from: string, to: string, fraud: Record<string, string>) {
  const body = (await hmrcFetch(accountId, `/organisations/vat/${vrn}/obligations?from=${from}&to=${to}`, "1.0", fraud)) as { obligations: VatObligation[] };
  return body.obligations;
}

export async function submitVatReturn(accountId: string, vrn: string, payload: object, fraud: Record<string, string>) {
  return hmrcFetch(accountId, `/organisations/vat/${vrn}/returns`, "1.0", fraud, { method: "POST", body: JSON.stringify(payload) });
}
