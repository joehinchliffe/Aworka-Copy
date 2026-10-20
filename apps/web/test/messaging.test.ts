import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { createCustomerWithJob } from "@/lib/services/customers";
import { addJobToDay, completeJob } from "@/lib/services/planning";
import { mergeContextFor, mergeTemplate, saveTemplate, unknownTags } from "@/lib/services/templates";
import { smsSegments, toE164 } from "@/lib/sms";
import { buildDrafts, channelsFor, deliverDrafts, listDrafts, selectCustomers } from "@/lib/services/drafts";
import { jobSheet, jobSheetText, saveDayNotes } from "@/lib/services/jobSheets";
import { deliverQueued } from "@/lib/services/messaging";
import { esendexAdapter, httpSmsAdapter, smsAdapterFromEnv, webexInteractAdapter } from "@/lib/services/transports";
import { listMessages, sendToCustomer } from "@/lib/services/messageHistory";
import { periodRange } from "@/lib/period";
import { addTimeOff, listEvents, saveEvent, setToDoDone } from "@/lib/services/calendar";

const TODAY = "2026-10-20";
let accountId = "";
let userId = "";

beforeAll(async () => {
  await pg`truncate accounts cascade`;
  const { account, user } = await signup({ businessName: "Shine Bright", name: "Jo", email: "jo@example.com", password: "password123" });
  accountId = account.id;
  userId = user.id;
});
afterAll(async () => { await pg.end(); });

describe("template merge", () => {
  const ctx = mergeContextFor(
    { contact: { title: "Mrs", firstNames: "Ann Marie", lastName: "Smith", address: "1 High St\nTown" }, balance: -1250, nextDueOn: "2026-11-17", jobPrice: 1500, invoiceToken: "tok" },
    "Shine Bright", "https://app.test",
  );
  it("fills every merge tag", () => {
    expect(mergeTemplate("Hi #first_name (#name), #address owes #balance. Next #next_due at #job_price. #business_name #invoice_link", ctx))
      .toBe("Hi Ann (Mrs Ann Marie Smith), 1 High St owes £12.50. Next 17 Nov 2026 at £15.00. Shine Bright https://app.test/v/tok");
  });
  it("leaves unknown tags visible and reports them", () => {
    expect(mergeTemplate("#first_name #nope", ctx)).toBe("Ann #nope");
    expect(unknownTags("#first_name #nope #nope")).toEqual(["nope"]);
  });
  it("shows a zero balance for customers in credit and blanks missing values", () => {
    const c = mergeContextFor({ contact: { company: "Acme Ltd" }, balance: 500 }, "B");
    expect(mergeTemplate("#first_name|#balance|#next_due|#invoice_link", c)).toBe("Acme Ltd|£0.00||");
  });
});

describe("SMS counting", () => {
  it("counts GSM-7 single and multipart", () => {
    expect(smsSegments("")).toMatchObject({ segments: 0, encoding: "GSM-7" });
    expect(smsSegments("a".repeat(160))).toMatchObject({ segments: 1, units: 160, remaining: 0 });
    expect(smsSegments("a".repeat(161))).toMatchObject({ segments: 2, remaining: 306 - 161 });
    expect(smsSegments("a".repeat(306)).segments).toBe(2);
    expect(smsSegments("a".repeat(307)).segments).toBe(3);
  });
  it("counts extension characters as two and £ as one", () => {
    expect(smsSegments("€10 [£5]").units).toBe(2 + 1 + 1 + 1 + 2 + 1 + 1 + 2);
    expect(smsSegments("€".repeat(80)).segments).toBe(1);
    expect(smsSegments("€".repeat(81)).segments).toBe(2);
  });
  it("switches to UCS-2 for other characters", () => {
    expect(smsSegments("Thanks 😊")).toMatchObject({ encoding: "UCS-2", units: 9, segments: 1 });
    expect(smsSegments("ç".repeat(70)).segments).toBe(1);
    expect(smsSegments("ç".repeat(71)).segments).toBe(2);
    expect(smsSegments("ç".repeat(134)).segments).toBe(2);
    expect(smsSegments("ç".repeat(135)).segments).toBe(3);
  });
  it("normalises UK numbers to E.164", () => {
    expect(toE164("07700 900123")).toBe("+447700900123");
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
    expect(toE164("0044 7700 900123")).toBe("+447700900123");
    expect(toE164("not a phone")).toBeNull();
  });
});

describe("SMS adapters", () => {
  const okFetch = (json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  it("Webex Interact posts message_body, from and E.164 recipients with X-AUTH-KEY", async () => {
    const f = okFetch({ messages: [{ message_id: "w1" }] });
    const r = await webexInteractAdapter("key", "ShineBrt", f).send({ to: "07700900123", body: "Hello" });
    expect(r.providerId).toBe("w1");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.webexinteract.com/v1/sms");
    expect((init as RequestInit).headers).toMatchObject({ "X-AUTH-KEY": "key" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ message_body: "Hello", from: "ShineBrt", to: [{ phone: ["+447700900123"] }] });
  });
  it("Esendex and httpSMS use their endpoints and keys", async () => {
    const f1 = okFetch({ id: "e1" });
    await esendexAdapter("ek", "EX0001", "Shine", f1).send({ to: "07700900123", body: "Hi" });
    expect(f1.mock.calls[0]![0]).toBe("https://api.esendex.co.uk/v2/messages");
    expect((f1.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ "X-Api-Key": "ek" });
    const f2 = okFetch({ data: { id: "h1" } });
    const r2 = await httpSmsAdapter("hk", "07700900999", f2).send({ to: "07700900123", body: "Hi" });
    expect(r2.providerId).toBe("h1");
    expect(f2.mock.calls[0]![0]).toBe("https://api.httpsms.com/v1/messages/send");
    expect(JSON.parse((f2.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ from: "+447700900999", to: "+447700900123", content: "Hi" });
  });
  it("throws on provider errors and selects by env", async () => {
    const bad = vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(webexInteractAdapter("k", "x", bad).send({ to: "07700900123", body: "x" })).rejects.toThrow(/401/);
    expect(smsAdapterFromEnv({})).toBeNull();
    expect(smsAdapterFromEnv({ SMS_PROVIDER: "esendex", SMS_API_KEY: "k" })?.name).toBe("esendex");
    expect(smsAdapterFromEnv({ SMS_PROVIDER: "httpsms", SMS_API_KEY: "k" })).toBeNull();
  });
});

describe("contact rules", () => {
  const base = { contactMethod: "email", acceptsMarketing: true, email: "a@b.c", phone: "07700900123" };
  it("respects contact method, marketing opt-out and missing details", () => {
    expect(channelsFor(base, "preferred", "general").channels).toEqual(["email"]);
    expect(channelsFor({ ...base, contactMethod: "both" }, "preferred", "general").channels).toEqual(["email", "sms"]);
    expect(channelsFor(base, "sms", "general")).toMatchObject({ channels: [], reason: "Prefers email" });
    expect(channelsFor({ ...base, contactMethod: "none" }, "email", "general").reason).toBe("Contact method is none");
    expect(channelsFor({ ...base, acceptsMarketing: false }, "email", "marketing").reason).toBe("Does not accept marketing");
    expect(channelsFor({ ...base, acceptsMarketing: false }, "email", "general").channels).toEqual(["email"]);
    expect(channelsFor({ ...base, email: null }, "email", "general").reason).toBe("No email address");
    expect(channelsFor({ ...base, contactMethod: "both", email: null }, "preferred", "general").channels).toEqual(["sms"]);
  });
});

describe("job sheets and drafts", () => {
  let ann = "", bob = "", cat = "", dan = "";
  let annJob = "", bobJob = "";
  beforeAll(async () => {
    const mk = async (first: string, contact: Record<string, string>, customer: Record<string, unknown>, price: number) => {
      const r = await createCustomerWithJob(accountId, userId,
        { contact: { firstNames: first, lastName: "Test", address: `${first} House\nTown`, ...contact }, ...customer },
        { price, newRoundName: "Tuesday", firstDueOn: TODAY }, TODAY);
      return r;
    };
    const a = await mk("Ann", { email: "ann@example.com", phone1: "07700900001" }, { contactMethod: "email", paymentMethod: "on_day" }, 15);
    const b = await mk("Bob", { phone1: "07700900002" }, { contactMethod: "sms", paymentMethod: "paper_invoice", invoiceFrequency: "manually" }, 20);
    const c = await mk("Cat", { email: "cat@example.com" }, { contactMethod: "email", acceptsMarketing: false, startingBalance: -10 }, 12);
    const d = await mk("Dan", {}, { contactMethod: "email" }, 10);
    ann = a.customer.id; bob = b.customer.id; cat = c.customer.id; dan = d.customer.id;
    annJob = (await addJobToDay(accountId, userId, a.jobSpec.id, TODAY, 0)).id;
    bobJob = (await addJobToDay(accountId, userId, b.jobSpec.id, TODAY, 0)).id;
    await addJobToDay(accountId, userId, c.jobSpec.id, "2026-10-21", 0);
    await addJobToDay(accountId, null, d.jobSpec.id, TODAY, 0);
    await completeJob(accountId, userId, bobJob, { status: "done" }, TODAY);
  });

  it("builds a job sheet with totals and notes, filtered by status and user", async () => {
    await saveDayNotes(accountId, userId, TODAY, "Van service at 4", null);
    const sheet = await jobSheet(accountId, { start: TODAY, days: 2, userId });
    expect(sheet.map((d) => d.date)).toEqual([TODAY, "2026-10-21"]);
    expect(sheet[0]!.rows.map((r) => r.customerName).sort()).toEqual(["Ann Test", "Bob Test"]);
    expect(sheet[0]!.totalValue).toBe(1500 + 2000);
    expect(sheet[0]!.topNotes).toBe("Van service at 4");
    expect(sheet[0]!.rows.find((r) => r.customerId === ann)).toMatchObject({ phone: "07700900001", address: "Ann House, Town", paymentMethod: "on_day" });

    const everyone = await jobSheet(accountId, { start: TODAY, days: 1 });
    expect(everyone[0]!.rows).toHaveLength(3);
    expect(everyone[0]!.topNotes).toBeNull(); // notes were saved for Jo's sheet only

    const toDo = await jobSheet(accountId, { start: TODAY, days: 1, status: "to_do", userId });
    expect(toDo[0]!.rows.map((r) => r.customerId)).toEqual([ann]);
    const toInvoice = await jobSheet(accountId, { start: TODAY, days: 1, status: "to_invoice" });
    expect(toInvoice[0]!.rows.map((r) => r.customerId)).toEqual([bob]);
    const cashDebt = await jobSheet(accountId, { start: TODAY, days: 2, status: "cash_in_debt" });
    expect(cashDebt.flatMap((d) => d.rows.map((r) => r.customerId))).toEqual([cat]);
    const notPrepaid = await jobSheet(accountId, { start: TODAY, days: 2, status: "not_prepaid" });
    expect(notPrepaid.flatMap((d) => d.rows).length).toBe(3);

    expect(jobSheetText(sheet, "Sheet")).toContain("Van service at 4");
    expect((await jobSheet(accountId, { start: TODAY, days: 99 })).length).toBe(14);
  });

  it("updates and clears day notes", async () => {
    await saveDayNotes(accountId, userId, TODAY, "Changed", "Bottom");
    let s = await jobSheet(accountId, { start: TODAY, days: 1, userId });
    expect(s[0]).toMatchObject({ topNotes: "Changed", bottomNotes: "Bottom" });
    await saveDayNotes(accountId, userId, TODAY, "", "");
    s = await jobSheet(accountId, { start: TODAY, days: 1, userId });
    expect(s[0]).toMatchObject({ topNotes: null, bottomNotes: null });
    const rows = await db.select().from(schema.dayNotes).where(eq(schema.dayNotes.accountId, accountId));
    expect(rows).toHaveLength(0);
  });

  it("selects customers from a job sheet, a round and debt", async () => {
    expect((await selectCustomers(accountId, { kind: "job_sheet", start: TODAY, days: 2 })).sort()).toEqual([ann, bob, cat, dan].sort());
    const round = await db.query.rounds.findFirst({ where: and(eq(schema.rounds.accountId, accountId), eq(schema.rounds.name, "Tuesday")) });
    expect((await selectCustomers(accountId, { kind: "round", roundId: round!.id })).length).toBeGreaterThanOrEqual(1);
    expect((await selectCustomers(accountId, { kind: "debt" })).sort()).toEqual([bob, cat].sort());
  });

  it("drafts merged messages respecting contact rules, then delivers them", async () => {
    const t = await saveTemplate(accountId, null, {
      name: "Coming tomorrow", purpose: "upcoming_jobs",
      emailSubject: "#business_name visit", emailBody: "Hi #first_name, we're at #address soon. Balance #balance.", smsBody: "Hi #first_name, #business_name tomorrow",
    });
    const ids = [ann, bob, cat, dan];
    const { created, skipped } = await buildDrafts(accountId, ids, t.id, "preferred");
    expect(created.map((m) => [m.customerId, m.channel, m.to]).sort()).toEqual([
      [ann, "email", "ann@example.com"], [bob, "sms", "07700900002"], [cat, "email", "cat@example.com"],
    ].sort());
    expect(skipped).toEqual([{ customerId: dan, name: "Dan Test", reason: "No email address" }]);
    const annMsg = created.find((m) => m.customerId === ann)!;
    expect(annMsg).toMatchObject({ status: "draft", subject: "Shine Bright visit", body: "Hi Ann, we're at Ann House soon. Balance £0.00." });
    expect(created.find((m) => m.customerId === bob)!.body).toBe("Hi Bob, Shine Bright tomorrow");
    expect(created.find((m) => m.customerId === cat)!.body).toContain("Balance £10.00");

    // Marketing respects opt-out; email-only channel skips the SMS customer.
    const mkt = await saveTemplate(accountId, null, { name: "Offer", purpose: "marketing", emailBody: "Gutters half price" });
    const r2 = await buildDrafts(accountId, ids, mkt.id, "email");
    expect(r2.created.map((m) => m.customerId)).toEqual([ann]);
    expect(Object.fromEntries(r2.skipped.map((s) => [s.customerId, s.reason]))).toEqual({
      [bob]: "Prefers SMS", [cat]: "Does not accept marketing", [dan]: "No email address",
    });

    expect((await listDrafts(accountId)).length).toBe(4);
    expect(await deliverDrafts(accountId, [annMsg.id])).toBe(1);
    expect(await deliverDrafts(accountId)).toBe(3);
    const sent: string[] = [];
    await deliverQueued(accountId, { async send(m) { sent.push(m.to); } });
    expect(sent.sort()).toEqual(["07700900002", "ann@example.com", "ann@example.com", "cat@example.com"]);
    const hist = await listMessages(accountId, { start: "2000-01-01", end: "2099-01-01", status: "sent" });
    expect(hist).toHaveLength(4);
  });

  it("composes to one customer and refuses a channel they don't use", async () => {
    const m = await sendToCustomer(accountId, ann, { channel: "email", subject: "Hello #first_name", body: "Dear #name" });
    expect(m).toMatchObject({ status: "queued", subject: "Hello Ann", body: "Dear Ann Test", to: "ann@example.com", reason: "other" });
    await expect(sendToCustomer(accountId, ann, { channel: "sms", body: "x" })).rejects.toThrow("Prefers email");
  });
});

describe("periods, events and time off", () => {
  it("computes periods starting or ending on a date", () => {
    expect(periodRange(1, "month", "starting", "2026-10-20")).toEqual({ start: "2026-10-20", end: "2026-11-19" });
    expect(periodRange(2, "week", "ending", "2026-10-20")).toEqual({ start: "2026-10-07", end: "2026-10-20" });
    expect(periodRange(1, "day", "starting", "2026-10-20")).toEqual({ start: "2026-10-20", end: "2026-10-20" });
  });
  it("adds events and to-dos, filters and ticks them off", async () => {
    await saveEvent(accountId, null, { type: "event", date: TODAY, time: "09:30", summary: "Quote at No. 4" });
    const todo = await saveEvent(accountId, null, { type: "to_do", date: TODAY, summary: "Buy squeegee" });
    await expect(saveEvent(accountId, null, { type: "event", date: TODAY, time: "25:00", summary: "x" })).rejects.toThrow();
    expect((await listEvents(accountId, { filter: "to_do", start: TODAY, end: TODAY })).map((e) => e.summary)).toEqual(["Buy squeegee"]);
    await setToDoDone(accountId, todo, true);
    expect(await listEvents(accountId, { filter: "to_do", start: TODAY, end: TODAY })).toHaveLength(0);
    expect((await listEvents(accountId, { filter: "done_to_do", start: TODAY, end: TODAY }))[0]?.id).toBe(todo);
    expect(await listEvents(accountId, { start: TODAY, end: TODAY })).toHaveLength(2);
  });
  it("validates time off", async () => {
    await expect(addTimeOff(accountId, { startOn: "2026-10-22", endOn: "2026-10-21" })).rejects.toThrow();
    const h = await addTimeOff(accountId, { startOn: "2026-12-24", endOn: "2026-12-27", reason: " Holiday " });
    expect(h.reason).toBe("Holiday");
  });
});
