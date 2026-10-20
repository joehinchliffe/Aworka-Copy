import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deliverQueued, logTransport, type Transport } from "./messaging";
import { toE164 } from "@/lib/sms";
import { emailTransportFor, type EmailDeps } from "./email";

export { smsSegments, toE164, type SmsCount } from "@/lib/sms";

// ---------------------------------------------------------------------------
// SMS adapters

export interface SmsAdapter {
  readonly name: string;
  send(m: { to: string; body: string; from?: string | null }): Promise<{ providerId?: string }>;
  /** Remaining credit or balance, or null when the provider has no such concept or it is unknown. */
  credits(): Promise<number | null>;
  /** Sender IDs/numbers the account may use. */
  senders(): Promise<string[]>;
}

type Fetch = typeof fetch;
type Env = Record<string, string | undefined>;

async function postJson(fetcher: Fetch, url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SMS provider returned ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

function e164OrThrow(to: string) {
  const n = toE164(to);
  if (!n) throw new Error(`Not a valid phone number: ${to}`);
  return n;
}

const envSenders = () => (process.env.SMS_SENDERS ?? process.env.SMS_FROM ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Webex Interact (formerly Sprint/Imimobile UK): X-AUTH-KEY header. */
export function webexInteractAdapter(apiKey: string, defaultFrom: string | undefined, fetcher: Fetch = fetch): SmsAdapter {
  const base = "https://api.webexinteract.com/v1";
  return {
    name: "webex_interact",
    async send(m) {
      const json = await postJson(fetcher, `${base}/sms`, { "X-AUTH-KEY": apiKey }, {
        message_body: m.body,
        from: m.from || defaultFrom,
        to: [{ phone: [e164OrThrow(m.to)] }],
      });
      const id = (json.messages as { message_id?: string }[] | undefined)?.[0]?.message_id ?? (json.id as string | undefined);
      return { providerId: id };
    },
    async credits() {
      // Balance lookup endpoint is not part of the public send API; report unknown.
      return null;
    },
    async senders() { return envSenders(); },
  };
}

/** Esendex REST v2: X-Api-Key header and an account reference. */
export function esendexAdapter(apiKey: string, accountReference: string | undefined, defaultFrom: string | undefined, fetcher: Fetch = fetch): SmsAdapter {
  return {
    name: "esendex",
    async send(m) {
      const json = await postJson(fetcher, "https://api.esendex.co.uk/v2/messages", { "X-Api-Key": apiKey }, {
        accountReference,
        channels: ["SMS"],
        from: m.from || defaultFrom,
        recipients: [{ address: { msisdn: e164OrThrow(m.to) } }],
        body: { text: { value: m.body } },
      });
      return { providerId: (json.id as string | undefined) ?? (json.messageId as string | undefined) };
    },
    async credits() { return null; },
    async senders() { return envSenders(); },
  };
}

/** httpSMS: sends from the tenant's own Android phone; `from` must be that phone's number. */
export function httpSmsAdapter(apiKey: string, fromNumber: string, fetcher: Fetch = fetch): SmsAdapter {
  return {
    name: "httpsms",
    async send(m) {
      const json = await postJson(fetcher, "https://api.httpsms.com/v1/messages/send", { "x-api-key": apiKey }, {
        from: e164OrThrow(m.from && /^\+?\d/.test(m.from) ? m.from : fromNumber),
        to: e164OrThrow(m.to),
        content: m.body,
      });
      return { providerId: (json.data as { id?: string } | undefined)?.id };
    },
    async credits() { return null; }, // Billed by the phone's own network plan.
    async senders() { return [fromNumber]; },
  };
}

/** Pick the SMS adapter from env SMS_PROVIDER; null when unconfigured. */
export function smsAdapterFromEnv(env: Env = process.env, fetcher: Fetch = fetch): SmsAdapter | null {
  const key = env.SMS_API_KEY;
  switch (env.SMS_PROVIDER) {
    case "webex_interact":
    case "webex":
      return key ? webexInteractAdapter(key, env.SMS_FROM, fetcher) : null;
    case "esendex":
      return key ? esendexAdapter(key, env.ESENDEX_ACCOUNT_REFERENCE, env.SMS_FROM, fetcher) : null;
    case "httpsms":
      return key && env.SMS_FROM ? httpSmsAdapter(key, env.SMS_FROM, fetcher) : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Email

/** SMTP transport from a URL such as smtps://user:pass@smtp.example.com:465 */
export function smtpTransport(url: string, fromAddress: string | undefined): Transport {
  const mailer = nodemailer.createTransport(url);
  return {
    async send(m) {
      if (m.channel !== "email") throw new Error("SMTP can only send email");
      const address = fromAddress ?? new URL(url).username ?? undefined;
      await mailer.sendMail({
        from: address ? { name: m.from, address: decodeURIComponent(address) } : undefined,
        to: m.to,
        subject: m.subject ?? "",
        text: m.body,
        replyTo: m.replyTo ?? undefined,
      });
    },
  };
}

/** Wrap an SMS adapter as a Transport. */
export function smsTransport(adapter: SmsAdapter): Transport {
  return {
    async send(m) {
      if (m.channel !== "sms") throw new Error("SMS adapter can only send SMS");
      await adapter.send({ to: m.to, body: m.body });
    },
  };
}

/** Route email and SMS to their configured transports, logging when either is unconfigured. */
export function transportFromEnv(env: Env = process.env): Transport {
  const email = env.SMTP_URL ? smtpTransport(env.SMTP_URL, env.SMTP_FROM) : logTransport;
  const sms = smsAdapterFromEnv(env);
  const smsT = sms ? smsTransport(sms) : logTransport;
  return {
    send: (m) => (m.channel === "sms" ? smsT.send(m) : email.send(m)),
  };
}

/**
 * Deliver queued messages for every account (cron entry point). Email goes
 * through each account's chosen sender (own SMTP, Gmail, Outlook), falling
 * back to the platform `transport`; failures are recorded per message.
 */
export async function deliverAllQueued(transport: Transport = transportFromEnv(), perAccountLimit = 100, deps: EmailDeps = {}) {
  const accounts = await db.selectDistinct({ accountId: schema.messages.accountId }).from(schema.messages)
    .where(eq(schema.messages.status, "queued"));
  let attempted = 0;
  for (const { accountId } of accounts) {
    let t = transport;
    let limit = perAccountLimit;
    try {
      const chosen = await emailTransportFor(accountId, transport, deps);
      t = chosen.transport;
      if (chosen.maxPerRun) limit = Math.min(limit, chosen.maxPerRun);
    } catch {
      /* unreadable settings or credentials: use the platform transport */
    }
    attempted += await deliverQueued(accountId, t, limit);
  }
  return { accounts: accounts.length, attempted };
}
