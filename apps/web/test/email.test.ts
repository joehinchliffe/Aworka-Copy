import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { saveIntegration } from "@/lib/services/integrations";
import { queueMessage, type Transport } from "@/lib/services/messaging";
import { deliverAllQueued } from "@/lib/services/transports";
import {
  buildMimeMessage, emailAuthorizeUrl, emailOAuthState, exchangeEmailCode, gmailRaw, graphSendMailPayload, oauthAccessToken,
  readEmailOAuthState, ReconnectRequiredError, saveSmtpSettings, setEmailSender, type MailerFactory, type OAuthTokens,
} from "@/lib/services/email";
import { createRateLimiter, idealPostcodes, postcodesIoAddresses, addressProviderFromEnv } from "@/lib/services/address";
import { createCustomerWithJob } from "@/lib/services/customers";

process.env.GOOGLE_CLIENT_ID = "g-client";
process.env.GOOGLE_CLIENT_SECRET = "g-secret";
process.env.MS_CLIENT_ID = "ms-client";
process.env.MS_CLIENT_SECRET = "ms-secret";
process.env.APP_URL = "https://app.test";

type Call = { url: string; init?: RequestInit };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch double that records calls and answers with the first matching handler. */
function mockFetch(handlers: [RegExp, (c: Call) => Response | Promise<Response>][]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const c = { url, init };
    calls.push(c);
    const h = handlers.find(([re]) => re.test(url));
    if (!h) throw new Error(`Unexpected fetch ${url}`);
    return h[1](c);
  });
  return { fetcher: fn as unknown as typeof fetch, calls };
}

const form = (c: Call) => new URLSearchParams(String(c.init?.body ?? ""));
const decodeRaw = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
function decodeMime(mime: string) {
  const [head, body] = mime.split("\r\n\r\n");
  return { head: head!, body: Buffer.from(body!.replace(/\r\n/g, ""), "base64").toString("utf8") };
}
function decodeWords(v: string) {
  return v.split(/\r\n /).map((w) => {
    const m = w.match(/^=\?UTF-8\?B\?(.*)\?=$/);
    return m ? Buffer.from(m[1]!, "base64").toString("utf8") : w;
  }).join("");
}

let accountId = "";
let ownerEmail = "";

beforeAll(async () => {
  await pg`truncate accounts cascade`;
  const { account, user } = await signup({ businessName: "Shine Bright", name: "Jo", email: "jo@shine.test", password: "password123" });
  accountId = account.id;
  ownerEmail = user.email;
});
afterAll(async () => { await pg.end(); });

describe("Gmail raw message", () => {
  const date = new Date(Date.UTC(2026, 9, 20, 9, 30, 0));
  it("builds RFC 822 headers with From name, Reply-To and a base64 UTF-8 body", () => {
    const mime = buildMimeMessage({ to: "ann@example.com", subject: "Your invoice", body: "Hello Ann,\nThanks £15.\n", fromName: "Shine Bright", fromAddress: "jo@gmail.com", replyTo: "office@shine.test", date });
    const { head, body } = decodeMime(mime);
    expect(head.split("\r\n")).toEqual([
      "From: Shine Bright <jo@gmail.com>",
      "To: ann@example.com",
      "Reply-To: Shine Bright <office@shine.test>",
      "Subject: Your invoice",
      "Date: Tue, 20 Oct 2026 09:30:00 +0000",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
    ]);
    expect(body).toBe("Hello Ann,\r\nThanks £15.\r\n");
  });

  it("encodes non-ASCII subjects and names as RFC 2047 words of at most 75 characters", () => {
    const subject = "Facture – reçu pour «nettoyage de vitres» £15 ✨ ".repeat(3).trim();
    const mime = buildMimeMessage({ to: "a@b.test", subject, body: "x", fromName: "Zoë's Windows", fromAddress: "z@b.test", date });
    const subjectHeader = mime.match(/^Subject: ((?:.*)(?:\r\n .*)*)/m)![1]!;
    for (const w of subjectHeader.split("\r\n ")) {
      expect(w).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(w.length).toBeLessThanOrEqual(75);
    }
    expect(decodeWords(subjectHeader)).toBe(subject);
    expect(decodeWords(mime.match(/^From: (.*) <z@b\.test>/m)![1]!)).toBe("Zoë's Windows");
  });

  it("quotes names with specials and strips header line breaks", () => {
    const mime = buildMimeMessage({ to: "a@b.test", subject: "Hi\r\nBcc: evil@x.test", body: "x", fromName: "Smith, J.", fromAddress: "j@b.test", date });
    expect(mime).toContain('From: "Smith, J." <j@b.test>\r\n');
    expect(mime).toContain("Subject: Hi Bcc: evil@x.test\r\n");
    expect(mime).not.toMatch(/^Bcc:/m);
  });

  it("base64url-encodes the whole message for users.messages.send", () => {
    const raw = gmailRaw({ to: "a@b.test", subject: "Ünïcode ✓", body: "Body ✓".repeat(40), fromName: "Shine Bright", fromAddress: "jo@gmail.com", date });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const { head, body } = decodeMime(decodeRaw(raw));
    expect(decodeWords(head.match(/^Subject: (.*)$/m)![1]!)).toBe("Ünïcode ✓");
    expect(body).toBe("Body ✓".repeat(40));
  });
});

describe("Graph sendMail payload", () => {
  it("sends text with recipients and reply-to; the mailbox is the sender", () => {
    expect(graphSendMailPayload({ to: "a@b.test, c@d.test", subject: "Statement", body: "Hi\nthere", fromName: "Shine Bright", replyTo: "office@shine.test" })).toEqual({
      message: {
        subject: "Statement",
        body: { contentType: "Text", content: "Hi\nthere" },
        toRecipients: [{ emailAddress: { address: "a@b.test" } }, { emailAddress: { address: "c@d.test" } }],
        replyTo: [{ emailAddress: { address: "office@shine.test", name: "Shine Bright" } }],
      },
      saveToSentItems: true,
    });
    expect(graphSendMailPayload({ to: "a@b.test", body: "x", fromName: "B" }).message).not.toHaveProperty("replyTo");
  });
});

describe("OAuth connection", () => {
  it("signs state per provider and account", () => {
    const s = emailOAuthState(accountId, "gmail");
    expect(readEmailOAuthState(s, "gmail")).toBe(accountId);
    expect(readEmailOAuthState(s, "outlook")).toBeNull();
    expect(readEmailOAuthState(s.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "gmail")).toBeNull();
  });

  it("builds authorise URLs with offline access", () => {
    const g = new URL(emailAuthorizeUrl(accountId, "gmail"));
    expect(g.origin + g.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(g.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(g.searchParams.get("access_type")).toBe("offline");
    expect(g.searchParams.get("prompt")).toBe("consent");
    expect(g.searchParams.get("redirect_uri")).toBe("https://app.test/api/email/google/callback");
    const m = new URL(emailAuthorizeUrl(accountId, "outlook"));
    expect(m.origin + m.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(m.searchParams.get("scope")).toBe("offline_access User.Read Mail.Send");
    expect(m.searchParams.get("redirect_uri")).toBe("https://app.test/api/email/microsoft/callback");
  });

  it("exchanges a Google code, stores tokens encrypted with the mailbox address and selects Gmail", async () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ email: "jo@gmail.com" })).toString("base64url")}.sig`;
    const { fetcher, calls } = mockFetch([[/oauth2\.googleapis\.com\/token/, () => json({ access_token: "at1", refresh_token: "rt1", expires_in: 3599, id_token: idToken })]]);
    await exchangeEmailCode(accountId, "gmail", "the-code", fetcher, 1_000_000);
    const body = form(calls[0]!);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_secret")).toBe("g-secret");
    const row = await db.query.integrations.findFirst({ where: and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, "gmail")) });
    expect(row!.externalId).toBe("jo@gmail.com");
    expect(row!.secret).not.toContain("rt1");
    expect(decrypt<OAuthTokens>(row!.secret!)).toEqual({ access_token: "at1", refresh_token: "rt1", expires_at: 1_000_000 + 3599_000 });
    const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
    expect(a!.settings.emailSender).toBe("gmail");
  });
});

async function connect(provider: "gmail" | "outlook", tokens: OAuthTokens, address: string, acct = accountId) {
  await saveIntegration(acct, provider, { secret: tokens, externalId: address, config: { address } });
}
const integration = (provider: string, acct = accountId) =>
  db.query.integrations.findFirst({ where: and(eq(schema.integrations.accountId, acct), eq(schema.integrations.provider, provider)) });

describe("token refresh", () => {
  it("uses a valid token without refreshing", async () => {
    await connect("gmail", { access_token: "valid", refresh_token: "rt", expires_at: Date.now() + 3_600_000 }, "jo@gmail.com");
    const { fetcher, calls } = mockFetch([]);
    expect(await oauthAccessToken(accountId, "gmail", { fetcher })).toEqual({ accessToken: "valid", address: "jo@gmail.com" });
    expect(calls).toHaveLength(0);
  });

  it("refreshes a Google token near expiry and keeps the refresh token", async () => {
    const now = 5_000_000;
    await connect("gmail", { access_token: "old", refresh_token: "rt-google", expires_at: now + 60_000 }, "jo@gmail.com");
    const { fetcher, calls } = mockFetch([[/oauth2\.googleapis\.com\/token/, () => json({ access_token: "new", expires_in: 3600, scope: "x" })]]);
    expect((await oauthAccessToken(accountId, "gmail", { fetcher, now })).accessToken).toBe("new");
    expect(form(calls[0]!).get("grant_type")).toBe("refresh_token");
    expect(form(calls[0]!).get("refresh_token")).toBe("rt-google");
    expect(form(calls[0]!).has("scope")).toBe(false);
    const stored = decrypt<OAuthTokens>((await integration("gmail"))!.secret!);
    expect(stored).toEqual({ access_token: "new", refresh_token: "rt-google", expires_at: now + 3_600_000 });
  });

  it("stores Microsoft's rotated refresh token and sends the scope", async () => {
    const now = 5_000_000;
    await connect("outlook", { access_token: "old", refresh_token: "rt-ms-1", expires_at: now - 1 }, "jo@outlook.com");
    const { fetcher, calls } = mockFetch([[/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/token/, () => json({ access_token: "ms-new", refresh_token: "rt-ms-2", expires_in: 3600 })]]);
    await oauthAccessToken(accountId, "outlook", { fetcher, now });
    expect(form(calls[0]!).get("scope")).toBe("offline_access User.Read Mail.Send");
    expect(decrypt<OAuthTokens>((await integration("outlook"))!.secret!).refresh_token).toBe("rt-ms-2");
  });

  it("marks the connection as needing reconnection on invalid_grant", async () => {
    await connect("outlook", { access_token: "old", refresh_token: "revoked", expires_at: 0 }, "jo@outlook.com");
    const { fetcher } = mockFetch([[/microsoftonline/, () => json({ error: "invalid_grant", error_description: "AADSTS70000" }, 400)]]);
    await expect(oauthAccessToken(accountId, "outlook", { fetcher })).rejects.toBeInstanceOf(ReconnectRequiredError);
    const row = await integration("outlook");
    expect(row!.status).toBe("needs_reconnect");
    expect(row!.secret).toBeNull();
    expect(row!.externalId).toBe("jo@outlook.com");
    await expect(oauthAccessToken(accountId, "outlook", { fetcher })).rejects.toBeInstanceOf(ReconnectRequiredError);
  });

  it("reports other token errors without marking the connection", async () => {
    await connect("gmail", { access_token: "old", refresh_token: "rt", expires_at: 0 }, "jo@gmail.com");
    const { fetcher } = mockFetch([[/googleapis/, () => json({ error: "server_error" }, 500)]]);
    await expect(oauthAccessToken(accountId, "gmail", { fetcher })).rejects.toThrow("Gmail token request failed (500: server_error)");
    expect((await integration("gmail"))!.status).toBe("connected");
  });
});

describe("per-account transport selection in delivery", () => {
  let gmailAcct = "", outlookAcct = "", smtpAcct = "", platformAcct = "";
  beforeEach(async () => {
    await pg`truncate accounts cascade`;
    const mk = async (name: string) => (await signup({ businessName: name, name: "Owner", email: `${name.toLowerCase().replace(/\W/g, "")}@owner.test`, password: "password123" })).account.id;
    [gmailAcct, outlookAcct, smtpAcct, platformAcct] = [await mk("Gmail Co"), await mk("Outlook Co"), await mk("Smtp Co"), await mk("Platform Co")];
  });

  function platformSpy() {
    const sent: { to: string; channel: string; from: string; replyTo?: string | null }[] = [];
    const t: Transport = { async send(m) { sent.push({ to: m.to, channel: m.channel, from: m.from, replyTo: m.replyTo }); } };
    return { t, sent };
  }

  it("sends email through Gmail, Outlook or SMTP per account and everything else through the platform", async () => {
    const fresh = { access_token: "tok", refresh_token: "rt", expires_at: Date.now() + 3_600_000 };
    await connect("gmail", fresh, "owner@gmail.com", gmailAcct);
    await setEmailSender(gmailAcct, "gmail");
    await connect("outlook", fresh, "owner@outlook.com", outlookAcct);
    await setEmailSender(outlookAcct, "outlook");
    await saveSmtpSettings(smtpAcct, { host: "smtp.example.com", port: 587, user: "me@smtp.test", password: "pw", startTls: true });
    await setEmailSender(smtpAcct, "smtp");
    // Business email overrides the owner's login as Reply-To.
    const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, gmailAcct) });
    await db.update(schema.accounts).set({ settings: { ...a!.settings, email: "office@gmailco.test" } }).where(eq(schema.accounts.id, gmailAcct));

    for (const acct of [gmailAcct, outlookAcct, smtpAcct, platformAcct]) {
      await queueMessage(acct, { channel: "email", reason: "invoice", to: `cust@${acct.slice(0, 8)}.test`, subject: "Invoice", body: "Please pay" });
    }
    await queueMessage(gmailAcct, { channel: "sms", reason: "reminder", to: "07700900123", body: "See you tomorrow" });

    const { fetcher, calls } = mockFetch([
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/, () => json({ id: "g1" })],
      [/graph\.microsoft\.com\/v1\.0\/me\/sendMail/, () => new Response(null, { status: 202 })],
    ]);
    const smtpSent: Record<string, unknown>[] = [];
    const createMailer: MailerFactory = (cfg, password) => {
      expect(cfg).toMatchObject({ host: "smtp.example.com", port: 587, startTls: true });
      expect(password).toBe("pw");
      return { async sendMail(o) { smtpSent.push(o); } };
    };
    const { t, sent } = platformSpy();
    const result = await deliverAllQueued(t, 100, { fetcher, createMailer });
    expect(result).toEqual({ accounts: 4, attempted: 5 });

    const gmailCall = calls.find((c) => c.url.includes("gmail"))!;
    expect((gmailCall.init!.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const mime = decodeRaw(JSON.parse(String(gmailCall.init!.body)).raw);
    expect(mime).toContain("From: Gmail Co <owner@gmail.com>\r\n");
    expect(mime).toContain(`To: cust@${gmailAcct.slice(0, 8)}.test\r\n`);
    expect(mime).toContain("Reply-To: Gmail Co <office@gmailco.test>\r\n");

    const graphCall = calls.find((c) => c.url.includes("graph.microsoft.com"))!;
    const payload = JSON.parse(String(graphCall.init!.body));
    expect(payload.message.toRecipients[0].emailAddress.address).toBe(`cust@${outlookAcct.slice(0, 8)}.test`);
    expect(payload.message.replyTo[0].emailAddress.address).toBe("outlookco@owner.test");

    expect(smtpSent).toEqual([{
      from: { name: "Smtp Co", address: "me@smtp.test" }, to: `cust@${smtpAcct.slice(0, 8)}.test`, subject: "Invoice", text: "Please pay", replyTo: "smtpco@owner.test",
    }]);

    expect(sent.map((s) => s.channel).sort()).toEqual(["email", "sms"]);
    expect(sent.find((s) => s.channel === "email")).toMatchObject({ to: `cust@${platformAcct.slice(0, 8)}.test`, from: "Platform Co", replyTo: "platformco@owner.test" });
    const statuses = await db.select({ s: schema.messages.status }).from(schema.messages);
    expect(statuses.every((r) => r.s === "sent")).toBe(true);
  });

  it("falls back to the platform when the mailbox needs reconnecting, and records other errors per message", async () => {
    await connect("outlook", { access_token: "x", refresh_token: "revoked", expires_at: 0 }, "owner@outlook.com", outlookAcct);
    await setEmailSender(outlookAcct, "outlook");
    await connect("gmail", { access_token: "tok", refresh_token: "rt", expires_at: Date.now() + 3_600_000 }, "owner@gmail.com", gmailAcct);
    await setEmailSender(gmailAcct, "gmail");
    await setEmailSender(smtpAcct, "smtp"); // chosen but never configured: platform
    const m1 = await queueMessage(outlookAcct, { channel: "email", reason: "other", to: "a@x.test", subject: "S", body: "B" });
    const m2 = await queueMessage(gmailAcct, { channel: "email", reason: "other", to: "b@x.test", subject: "S", body: "B" });
    const m3 = await queueMessage(smtpAcct, { channel: "email", reason: "other", to: "c@x.test", subject: "S", body: "B" });
    const { fetcher } = mockFetch([
      [/microsoftonline/, () => json({ error: "invalid_grant" }, 400)],
      [/gmail\.googleapis\.com/, () => json({ error: { message: "Daily sending quota exceeded" } }, 429)],
    ]);
    const { t, sent } = platformSpy();
    await deliverAllQueued(t, 100, { fetcher });
    expect(sent.map((s) => s.to).sort()).toEqual(["a@x.test", "c@x.test"]);
    const byId = async (id: string) => (await db.query.messages.findFirst({ where: eq(schema.messages.id, id) }))!;
    expect((await byId(m1.id)).status).toBe("sent");
    expect((await byId(m3.id)).status).toBe("sent");
    const failed = await byId(m2.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("Gmail returned 429");
    expect((await integration("outlook", outlookAcct))!.status).toBe("needs_reconnect");
  });

  it("retries once with a refreshed token when Gmail answers 401", async () => {
    await connect("gmail", { access_token: "stale", refresh_token: "rt", expires_at: Date.now() + 3_600_000 }, "owner@gmail.com", gmailAcct);
    await setEmailSender(gmailAcct, "gmail");
    await queueMessage(gmailAcct, { channel: "email", reason: "other", to: "b@x.test", subject: "S", body: "B" });
    const { fetcher, calls } = mockFetch([
      [/oauth2\.googleapis\.com\/token/, () => json({ access_token: "fresh", expires_in: 3600 })],
      [/gmail\.googleapis\.com/, (c) => ((c.init!.headers as Record<string, string>).authorization === "Bearer fresh" ? json({ id: "1" }) : json({}, 401))],
    ]);
    await deliverAllQueued(platformSpy().t, 100, { fetcher });
    expect(calls.map((c) => c.url.includes("token") ? "token" : "send")).toEqual(["send", "token", "send"]);
    expect((await db.select().from(schema.messages))[0]!.status).toBe("sent");
  });

  it("throttles own-SMTP sends and limits how many go per run", async () => {
    await saveSmtpSettings(smtpAcct, { host: "smtp.example.com", port: 465, user: "me@smtp.test", password: "pw", startTls: false, minIntervalSeconds: 20 });
    await setEmailSender(smtpAcct, "smtp");
    for (let i = 0; i < 5; i++) await queueMessage(smtpAcct, { channel: "email", reason: "other", to: `c${i}@x.test`, subject: "S", body: "B" });
    const waits: number[] = [];
    const createMailer: MailerFactory = () => ({ async sendMail() {} });
    const r = await deliverAllQueued(platformSpy().t, 100, { createMailer, sleep: async (ms) => { waits.push(ms); } });
    expect(r.attempted).toBe(3); // floor(60 / 20)
    expect(waits).toHaveLength(2);
    for (const w of waits) expect(w).toBeGreaterThan(19_000);
  });

  it("keeps the stored SMTP password when saved with a blank one", async () => {
    await saveSmtpSettings(smtpAcct, { host: "mail.test", user: "u", password: "secret-1" });
    await saveSmtpSettings(smtpAcct, { host: "mail2.test", user: "u", password: "" });
    const row = (await integration("smtp", smtpAcct))!;
    expect(row.config).toMatchObject({ host: "mail2.test", port: 587, startTls: true, minIntervalSeconds: 0 });
    expect(JSON.stringify(row.config)).not.toContain("secret-1");
    expect(decrypt<{ password: string }>(row.secret!).password).toBe("secret-1");
  });
});

describe("Ideal Postcodes adapter", () => {
  it("parses autocomplete hits", async () => {
    const { fetcher, calls } = mockFetch([[/autocomplete\/addresses/, () => json({
      result: { hits: [
        { suggestion: "10 Downing Street, London, SW1A", udprn: 23747771, urls: { udprn: "/v1/udprn/23747771" } },
        { suggestion: "11 Downing Street, London, SW1A", urls: { udprn: "/v1/udprn/23747772" } },
        { udprn: 1 },
      ] },
      code: 2000, message: "Success",
    })]]);
    const p = idealPostcodes("ak_test", fetcher);
    expect(await p.autocomplete("10 downing")).toEqual([
      { id: "23747771", label: "10 Downing Street, London, SW1A" },
      { id: "23747772", label: "11 Downing Street, London, SW1A" },
    ]);
    const u = new URL(calls[0]!.url);
    expect(u.origin + u.pathname).toBe("https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses");
    expect(u.searchParams.get("api_key")).toBe("ak_test");
    expect(u.searchParams.get("query")).toBe("10 downing");
    expect(await p.autocomplete("1")).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("resolves a UDPRN to address lines, postcode and coordinates", async () => {
    const { fetcher, calls } = mockFetch([[/\/v1\/udprn\/23747771/, () => json({
      result: { line_1: "Prime Minister & First Lord of the Treasury", line_2: "10 Downing Street", line_3: "", post_town: "LONDON", postcode: "SW1A 2AA", latitude: 51.5035398, longitude: -0.1276327, udprn: 23747771 },
      code: 2000,
    })]]);
    const r = await idealPostcodes("ak_test", fetcher).resolve("23747771");
    expect(r).toEqual({ address: "Prime Minister & First Lord of the Treasury\n10 Downing Street\nLondon", postcode: "SW1A 2AA", lat: 51.5035398, lng: -0.1276327 });
    expect(new URL(calls[0]!.url).searchParams.get("api_key")).toBe("ak_test");
  });

  it("rejects bad ids, returns null for unknown ones and throws on key errors", async () => {
    const { fetcher, calls } = mockFetch([
      [/udprn\/404/, () => json({ code: 4044, message: "No UDPRN found" }, 404)],
      [/udprn\/401/, () => json({ code: 4010, message: "Invalid Key" }, 401)],
    ]);
    const p = idealPostcodes("bad", fetcher);
    expect(await p.resolve("../admin")).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await p.resolve("404")).toBeNull();
    await expect(p.resolve("401")).rejects.toThrow("Address lookup failed (401: Invalid Key)");
  });

  it("falls back to postcodes.io for postcode areas only", async () => {
    const { fetcher, calls } = mockFetch([
      [/autocomplete/, () => json({ status: 200, result: ["SW1A 2AA", "SW1A 2AB"] })],
      [/postcodes\/SW1A%202AA$/, () => json({ status: 200, result: { postcode: "SW1A 2AA", admin_ward: "St James's", parish: "Westminster, unparished area", admin_district: "Westminster", latitude: 51.5, longitude: -0.12 } })],
    ]);
    const p = postcodesIoAddresses(fetcher);
    expect(await p.autocomplete("10 Downing Street")).toEqual([]);
    expect(calls).toHaveLength(0);
    expect((await p.autocomplete("sw1a 2a")).map((s) => s.id)).toEqual(["SW1A 2AA", "SW1A 2AB"]);
    expect(await p.resolve("SW1A 2AA")).toEqual({ address: "St James's\nWestminster", postcode: "SW1A 2AA", partial: true });
  });

  it("picks the provider from env", () => {
    expect(addressProviderFromEnv({ IDEAL_POSTCODES_KEY: "k" })!.name).toBe("ideal_postcodes");
    expect(addressProviderFromEnv({})!.name).toBe("postcodes_io");
    expect(addressProviderFromEnv({ ADDRESS_LOOKUP: "off", IDEAL_POSTCODES_KEY: "k" })).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows 60 a minute per key, then resets", () => {
    const rl = createRateLimiter(60, 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 60; i++) expect(rl.take("u1", t0 + i)).toBe(true);
    expect(rl.take("u1", t0 + 100)).toBe(false);
    expect(rl.retryAfterSeconds("u1", t0 + 100)).toBe(60);
    expect(rl.take("u2", t0 + 100)).toBe(true);
    expect(rl.take("u1", t0 + 60_000)).toBe(true);
  });
});

describe("address finder coordinates", () => {
  it("stores coordinates from the finder as geocoded", async () => {
    await pg`truncate accounts cascade`;
    const { account, user } = await signup({ businessName: "Geo", name: "G", email: "g@geo.test", password: "password123" });
    const withCoords = await createCustomerWithJob(account.id, user.id,
      { contact: { firstNames: "Ann", address: "10 Downing Street\nLondon", postcode: "SW1A 2AA", lat: 51.5035, lng: -0.1276 } }, {}, "2026-10-20");
    const without = await createCustomerWithJob(account.id, user.id, { contact: { firstNames: "Bob", address: "1 High St" } }, {}, "2026-10-20");
    const contact = async (id: string) => (await db.query.contacts.findFirst({ where: eq(schema.contacts.id, id) }))!;
    expect(await contact(withCoords.customer.contactId)).toMatchObject({ lat: 51.5035, lng: -0.1276, latLngSource: "geocoded" });
    expect(await contact(without.customer.contactId)).toMatchObject({ lat: null, lng: null, latLngSource: null });
  });
});

void ownerEmail;
