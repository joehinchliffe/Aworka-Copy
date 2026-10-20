import nodemailer from "nodemailer";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { AccountSettings } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { makeState, readState } from "./hmrc";
import { appUrl, saveIntegration } from "./integrations";
import type { Transport } from "./messaging";

/**
 * Per-account email sending: the platform transport (default), the business's
 * own SMTP server, Gmail (Gmail API, gmail.send scope) or Outlook (Microsoft
 * Graph sendMail). Credentials live encrypted in `integrations` under the
 * providers smtp | gmail | outlook; the choice lives in account settings.
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MS_CLIENT_ID, MS_CLIENT_SECRET, APP_URL.
 */

type Fetch = typeof fetch;
type Env = Record<string, string | undefined>;
export type EmailSender = NonNullable<AccountSettings["emailSender"]>;
export type OAuthEmailProvider = "gmail" | "outlook";
export const EMAIL_SENDERS: EmailSender[] = ["platform", "smtp", "gmail", "outlook"];
export const NEEDS_RECONNECT = "needs_reconnect";

/** Raised when an OAuth connection can no longer be used (revoked, expired or missing). */
export class ReconnectRequiredError extends Error {
  constructor(public readonly provider: string, message = `${provider === "gmail" ? "Gmail" : provider === "outlook" ? "Outlook" : provider} needs to be reconnected`) {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}

// ---------------------------------------------------------------------------
// Message building

export interface EmailMessage {
  to: string;
  subject?: string | null;
  body: string;
  fromName: string;
  fromAddress?: string | null;
  replyTo?: string | null;
  date?: Date;
}

/** Header values must never carry line breaks (header injection). */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const isPrintableAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** RFC 2047 encoded-words (UTF-8, base64) for non-ASCII header text, split so each word stays within 75 chars. */
export function encodeHeaderText(value: string): string {
  const s = oneLine(value);
  if (isPrintableAscii(s)) return s;
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    // 45 bytes of UTF-8 -> 60 base64 chars; with "=?UTF-8?B?" and "?=" that is 72.
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) { words.push(chunk); chunk = ""; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

function displayName(name: string): string {
  const s = oneLine(name);
  if (!isPrintableAscii(s)) return encodeHeaderText(s);
  return /[()<>[\]:;@\\,."]/.test(s) ? `"${s.replace(/(["\\])/g, "\\$1")}"` : s;
}

const mailbox = (name: string | null | undefined, address: string) =>
  name ? `${displayName(name)} <${oneLine(address)}>` : oneLine(address);

export const splitAddresses = (to: string) => to.split(/[,;]/).map((a) => a.trim()).filter(Boolean);

function rfc5322Date(d: Date) {
  return d.toUTCString().replace(/GMT$/, "+0000");
}

/** A plain-text RFC 822 / 5322 message with a base64 UTF-8 body and CRLF line endings. */
export function buildMimeMessage(m: EmailMessage): string {
  const headers: string[] = [];
  if (m.fromAddress) headers.push(`From: ${mailbox(m.fromName, m.fromAddress)}`);
  headers.push(`To: ${splitAddresses(m.to).map((a) => oneLine(a)).join(", ")}`);
  if (m.replyTo) headers.push(`Reply-To: ${mailbox(m.fromName, m.replyTo)}`);
  headers.push(`Subject: ${encodeHeaderText(m.subject ?? "")}`);
  headers.push(`Date: ${rfc5322Date(m.date ?? new Date())}`);
  headers.push("MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
  const body = Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

/** The `raw` field for Gmail users.messages.send: the RFC 822 message, base64url encoded. */
export function gmailRaw(m: EmailMessage): string {
  return Buffer.from(buildMimeMessage(m), "utf8").toString("base64url");
}

/** Request body for Microsoft Graph POST /me/sendMail. The sender is always the signed-in mailbox. */
export function graphSendMailPayload(m: EmailMessage) {
  return {
    message: {
      subject: m.subject ?? "",
      body: { contentType: "Text", content: m.body },
      toRecipients: splitAddresses(m.to).map((address) => ({ emailAddress: { address } })),
      ...(m.replyTo ? { replyTo: [{ emailAddress: { address: m.replyTo, name: m.fromName } }] } : {}),
    },
    saveToSentItems: true,
  };
}

// ---------------------------------------------------------------------------
// OAuth (Google and Microsoft identity platform)

interface OAuthApp {
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
  callbackPath: string;
  authParams: Record<string, string>;
  /** Microsoft wants the scope repeated on token requests. */
  scopeOnTokenRequest: boolean;
}

export function oauthApp(p: OAuthEmailProvider, env: Env = process.env): OAuthApp {
  if (p === "gmail") {
    return {
      label: "Gmail",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      // openid email lets us read the connected address from the id_token; gmail.send is the only Gmail scope.
      scope: "openid email https://www.googleapis.com/auth/gmail.send",
      clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackPath: "/api/email/google/callback",
      authParams: { access_type: "offline", prompt: "consent" },
      scopeOnTokenRequest: false,
    };
  }
  return {
    label: "Outlook",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Mail.Send",
    clientId: env.MS_CLIENT_ID, clientSecret: env.MS_CLIENT_SECRET,
    callbackPath: "/api/email/microsoft/callback",
    authParams: { response_mode: "query", prompt: "select_account" },
    scopeOnTokenRequest: true,
  };
}

export const oauthConfigured = (p: OAuthEmailProvider, env: Env = process.env) => {
  const a = oauthApp(p, env);
  return !!(a.clientId && a.clientSecret);
};

const redirectUri = (p: OAuthEmailProvider) => `${appUrl()}${oauthApp(p).callbackPath}`;

/** Signed state binds the provider and the account, so a callback can only connect the logged-in account. */
export const emailOAuthState = (accountId: string, p: OAuthEmailProvider) => makeState(`${p}:${accountId}`);
export function readEmailOAuthState(state: string, p: OAuthEmailProvider): string | null {
  const v = readState(state);
  if (!v?.startsWith(`${p}:`)) return null;
  return v.slice(p.length + 1) || null;
}

export function emailAuthorizeUrl(accountId: string, p: OAuthEmailProvider): string {
  const a = oauthApp(p);
  if (!a.clientId || !a.clientSecret) throw new Error(`${a.label} sending is not configured on this server`);
  const q = new URLSearchParams({
    client_id: a.clientId, response_type: "code", redirect_uri: redirectUri(p), scope: a.scope,
    state: emailOAuthState(accountId, p), ...a.authParams,
  });
  return `${a.authorizeUrl}?${q}`;
}

export interface OAuthTokens { access_token: string; refresh_token: string; expires_at: number; id_token?: string }

async function tokenRequest(p: OAuthEmailProvider, body: Record<string, string>, fetcher: Fetch, now: number): Promise<OAuthTokens> {
  const a = oauthApp(p);
  const res = await fetcher(a.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: a.clientId ?? "", client_secret: a.clientSecret ?? "",
      ...(a.scopeOnTokenRequest ? { scope: a.scope } : {}), ...body,
    }),
  });
  let json: Record<string, unknown> = {};
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* non-JSON error page */ }
  if (!res.ok || typeof json.access_token !== "string") {
    // Only the error code is surfaced: token responses may echo credentials.
    if (json.error === "invalid_grant") throw new ReconnectRequiredError(p);
    throw new Error(`${a.label} token request failed (${res.status}${typeof json.error === "string" ? `: ${json.error}` : ""})`);
  }
  return {
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : "",
    expires_at: now + Number(json.expires_in ?? 3600) * 1000,
    ...(typeof json.id_token === "string" ? { id_token: json.id_token } : {}),
  };
}

/** Email claim from a Google id_token received directly from the token endpoint over TLS. */
function idTokenEmail(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string };
    return claims.email ?? null;
  } catch { return null; }
}

async function mailboxAddress(p: OAuthEmailProvider, t: OAuthTokens, fetcher: Fetch): Promise<string | null> {
  if (p === "gmail") return idTokenEmail(t.id_token);
  const res = await fetcher("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { authorization: `Bearer ${t.access_token}`, accept: "application/json" },
  });
  if (!res.ok) return null;
  const me = (await res.json()) as { mail?: string | null; userPrincipalName?: string | null };
  return me.mail || me.userPrincipalName || null;
}

/** Complete the OAuth callback: store tokens encrypted and switch the account to this sender. */
export async function exchangeEmailCode(accountId: string, p: OAuthEmailProvider, code: string, fetcher: Fetch = fetch, now = Date.now()) {
  const t = await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p) }, fetcher, now);
  if (!t.refresh_token) throw new Error(`${oauthApp(p).label} did not grant offline access; please try again`);
  const address = await mailboxAddress(p, t, fetcher);
  const { id_token: _drop, ...secret } = t;
  await saveIntegration(accountId, p, { secret, externalId: address, config: { address, connectedAt: new Date(now).toISOString() } });
  await setEmailSender(accountId, p);
  return { address };
}

async function emailIntegration(accountId: string, provider: string) {
  return db.query.integrations.findFirst({
    where: and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, provider)),
  });
}

/** Mark an OAuth connection as unusable so the settings page asks the user to reconnect. */
export async function markNeedsReconnect(accountId: string, p: OAuthEmailProvider) {
  await db.update(schema.integrations).set({ status: NEEDS_RECONNECT, secret: null, updatedAt: new Date() })
    .where(and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, p)));
}

/** A valid access token (refreshed when within 5 minutes of expiry, or when forced) and the mailbox address. */
export async function oauthAccessToken(accountId: string, p: OAuthEmailProvider, opts: { fetcher?: Fetch; now?: number; force?: boolean } = {}) {
  const fetcher = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now();
  const row = await emailIntegration(accountId, p);
  if (!row || row.status !== "connected" || !row.secret) throw new ReconnectRequiredError(p);
  let tokens = decrypt<OAuthTokens>(row.secret);
  if (opts.force || tokens.expires_at - now < 300_000) {
    try {
      const fresh = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: tokens.refresh_token }, fetcher, now);
      // Google keeps the refresh token; Microsoft rotates it.
      tokens = { access_token: fresh.access_token, expires_at: fresh.expires_at, refresh_token: fresh.refresh_token || tokens.refresh_token };
    } catch (e) {
      if (e instanceof ReconnectRequiredError) await markNeedsReconnect(accountId, p);
      throw e;
    }
    await db.update(schema.integrations).set({ secret: encrypt(tokens), updatedAt: new Date() }).where(eq(schema.integrations.id, row.id));
  }
  return { accessToken: tokens.access_token, address: row.externalId };
}

async function authedPost(accountId: string, p: OAuthEmailProvider, url: string, body: unknown, fetcher: Fetch) {
  const post = (token: string) => fetcher(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  let { accessToken, address } = await oauthAccessToken(accountId, p, { fetcher });
  let res = await post(accessToken);
  if (res.status === 401) {
    ({ accessToken, address } = await oauthAccessToken(accountId, p, { fetcher, force: true }));
    res = await post(accessToken);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${oauthApp(p).label} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return { address };
}

/** Gmail API users.messages.send for the connected Google account. */
export function gmailTransport(accountId: string, fetcher: Fetch = fetch): Transport {
  return {
    async send(m) {
      if (m.channel !== "email") throw new Error("Gmail can only send email");
      const { address } = await oauthAccessToken(accountId, "gmail", { fetcher });
      const raw = gmailRaw({ to: m.to, subject: m.subject, body: m.body, fromName: m.from, fromAddress: address, replyTo: m.replyTo });
      await authedPost(accountId, "gmail", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { raw }, fetcher);
    },
  };
}

/** Microsoft Graph sendMail for the connected Microsoft 365 / Outlook.com mailbox. */
export function outlookTransport(accountId: string, fetcher: Fetch = fetch): Transport {
  return {
    async send(m) {
      if (m.channel !== "email") throw new Error("Outlook can only send email");
      const payload = graphSendMailPayload({ to: m.to, subject: m.subject, body: m.body, fromName: m.from, replyTo: m.replyTo });
      await authedPost(accountId, "outlook", "https://graph.microsoft.com/v1.0/me/sendMail", payload, fetcher);
    },
  };
}

// ---------------------------------------------------------------------------
// The business's own SMTP server

export const smtpInput = z.object({
  host: z.string().trim().min(1, "Enter the SMTP server name").regex(/^[A-Za-z0-9.-]+$/, "Enter a valid server name"),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  user: z.string().trim().default(""),
  password: z.string().default(""),
  startTls: z.boolean().default(true),
  fromAddress: z.string().trim().email("Enter a valid from address").optional().or(z.literal("")).transform((s) => s || undefined),
  minIntervalSeconds: z.coerce.number().int().min(0).max(3600).default(0),
});
export type SmtpInput = z.input<typeof smtpInput>;
export interface SmtpConfig { host: string; port: number; user: string; startTls: boolean; fromAddress?: string; minIntervalSeconds: number }

export interface Mailer { sendMail(o: Record<string, unknown>): Promise<unknown>; verify?(): Promise<unknown> }
export type MailerFactory = (cfg: SmtpConfig, password: string) => Mailer;

export const nodemailerFactory: MailerFactory = (cfg, password) => nodemailer.createTransport({
  host: cfg.host, port: cfg.port,
  secure: cfg.port === 465, // implicit TLS; otherwise plain connection upgraded with STARTTLS
  requireTLS: cfg.startTls && cfg.port !== 465,
  auth: cfg.user ? { user: cfg.user, pass: password } : undefined,
  connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
});

const lastSmtpSend = new Map<string, number>();
const realSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** SMTP transport honouring the minimum gap between sends (tracked per account in this process). */
export function accountSmtpTransport(
  accountId: string, cfg: SmtpConfig, password: string,
  opts: { createMailer?: MailerFactory; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Transport {
  const mailer = (opts.createMailer ?? nodemailerFactory)(cfg, password);
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  return {
    async send(m) {
      if (m.channel !== "email") throw new Error("SMTP can only send email");
      const gap = cfg.minIntervalSeconds * 1000;
      const last = lastSmtpSend.get(accountId);
      if (gap > 0 && last != null && now() - last < gap) await sleep(gap - (now() - last));
      lastSmtpSend.set(accountId, now());
      const fromAddress = cfg.fromAddress ?? (cfg.user.includes("@") ? cfg.user : undefined);
      await mailer.sendMail({
        from: fromAddress ? { name: m.from, address: fromAddress } : undefined,
        to: m.to, subject: m.subject ?? "", text: m.body,
        replyTo: m.replyTo ?? undefined,
      });
    },
  };
}

/** Save the account's SMTP server. A blank password keeps the stored one. */
export async function saveSmtpSettings(accountId: string, raw: SmtpInput) {
  const v = smtpInput.parse(raw);
  let password = v.password;
  if (!password) {
    const existing = await emailIntegration(accountId, "smtp");
    if (existing?.secret) password = decrypt<{ password: string }>(existing.secret).password;
  }
  const cfg: SmtpConfig = { host: v.host, port: v.port, user: v.user, startTls: v.startTls, fromAddress: v.fromAddress, minIntervalSeconds: v.minIntervalSeconds };
  await saveIntegration(accountId, "smtp", { secret: { password }, externalId: v.fromAddress ?? (v.user || null), config: { ...cfg } });
  return { cfg, password };
}

export async function smtpSettings(accountId: string): Promise<{ cfg: SmtpConfig; password: string } | null> {
  const row = await emailIntegration(accountId, "smtp");
  if (!row || row.status !== "connected" || !row.secret) return null;
  return { cfg: row.config as unknown as SmtpConfig, password: decrypt<{ password: string }>(row.secret).password };
}

/** Check the SMTP server accepts a connection and login. */
export async function verifySmtp(cfg: SmtpConfig, password: string, createMailer: MailerFactory = nodemailerFactory) {
  const mailer = createMailer(cfg, password);
  if (mailer.verify) await mailer.verify();
}

// ---------------------------------------------------------------------------
// Choosing a sender

export async function setEmailSender(accountId: string, sender: EmailSender) {
  const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  if (!a) throw new Error("Account not found");
  await db.update(schema.accounts).set({ settings: { ...a.settings, emailSender: sender }, updatedAt: new Date() })
    .where(eq(schema.accounts.id, accountId));
}

/** Remove a sender's credentials; if it was in use the account goes back to the platform sender. */
export async function disconnectEmailSender(accountId: string, sender: Exclude<EmailSender, "platform">) {
  await db.update(schema.integrations).set({ status: "disconnected", secret: null, updatedAt: new Date() })
    .where(and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, sender)));
  const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  if (a?.settings.emailSender === sender) await setEmailSender(accountId, "platform");
}

export interface EmailDeps { fetcher?: Fetch; createMailer?: MailerFactory; sleep?: (ms: number) => Promise<void> }

/**
 * The transport for the account's chosen sender, without any fallback, or null
 * when that sender is not connected. Used directly by "Send test email".
 */
export async function senderTransport(accountId: string, sender: Exclude<EmailSender, "platform">, deps: EmailDeps = {}): Promise<{ transport: Transport; minIntervalSeconds: number } | null> {
  if (sender === "smtp") {
    const s = await smtpSettings(accountId);
    if (!s) return null;
    return { transport: accountSmtpTransport(accountId, s.cfg, s.password, deps), minIntervalSeconds: s.cfg.minIntervalSeconds };
  }
  const row = await emailIntegration(accountId, sender);
  if (!row || row.status !== "connected" || !row.secret) return null;
  return { transport: sender === "gmail" ? gmailTransport(accountId, deps.fetcher) : outlookTransport(accountId, deps.fetcher), minIntervalSeconds: 0 };
}

/**
 * Transport used to deliver an account's queued messages: email goes through
 * the account's chosen sender, SMS and anything unavailable through `platform`.
 * A connection that turns out to need reconnecting falls back to the platform
 * for that message; other send errors are recorded on the message.
 * `maxPerRun` keeps throttled SMTP sends within about a minute per run.
 */
export async function emailTransportFor(accountId: string, platform: Transport, deps: EmailDeps = {}): Promise<{ sender: EmailSender; transport: Transport; maxPerRun?: number }> {
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  const chosen = account?.settings.emailSender ?? "platform";
  if (chosen === "platform") return { sender: "platform", transport: platform };
  const own = await senderTransport(accountId, chosen, deps);
  if (!own) return { sender: "platform", transport: platform };
  return {
    sender: chosen,
    maxPerRun: own.minIntervalSeconds > 0 ? Math.max(1, Math.floor(60 / own.minIntervalSeconds)) : undefined,
    transport: {
      async send(m) {
        if (m.channel !== "email") return platform.send(m);
        try {
          await own.transport.send(m);
        } catch (e) {
          if (e instanceof ReconnectRequiredError) return platform.send(m);
          throw e;
        }
      },
    },
  };
}
