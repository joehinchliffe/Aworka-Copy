// End-to-end test of the mobile app: log in on a phone, plan a job, complete it
// offline, reconnect and check the server has it.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });
const email = `m${Date.now()}@example.com`;
const step = (s) => console.log("•", s);
const errors = [];

const browser = await chromium.launch();

step("set up an account and a customer (desktop)");
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desk.goto(`${BASE}/signup`);
await desk.fill("#businessName", "Sparkle Windows");
await desk.fill("#name", "Sam Shine");
await desk.fill("#email", email);
await desk.fill("#password", "password123");
await desk.click("button:has-text('Create account')");
await desk.waitForURL("**/customers/new");
await desk.fill("[name=c_firstNames]", "Ann");
await desk.fill("[name=c_lastName]", "Smith");
await desk.fill("[name=c_address]", "12 High Street\nLeeds");
await desk.fill("[name=newRoundName]", "Monday round");
await desk.fill("[name=price]", "15");
await desk.click("button:has-text('Save customer and job')");
await desk.waitForURL(/\/customers\/[0-9a-f-]{36}$/);
await desk.close();

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => { errors.push(`unexpected dialog: ${d.message()}`); void d.dismiss(); });
const shot = (n) => page.screenshot({ path: `${SHOTS}/m-${n}.png` });
const pill = page.locator(".m-sync-pill");

step("open /m logged out and follow the login link");
await page.goto(`${BASE}/m`);
await page.getByText("Log in to sync").waitFor();
await shot("01-login-needed");
await page.click("a:has-text('Log in')");
await page.waitForURL(/\/login\?next=%2Fm|\/login\?next=\/m/);
await page.fill("#email", email);
await page.fill("#password", "password123");
await page.click("button:has-text('Log in')");
await page.waitForURL(/\/m$/);
await page.locator(".m-brand", { hasText: "Sparkle Windows" }).waitFor();
await pill.filter({ hasText: "Synced" }).waitFor();

step("add the due job to today");
await page.click("button:has-text('Add due jobs')");
await page.click("label.m-pick:has-text('12 High Street')");
await shot("02-add-due");
await page.click("button:has-text('Add 1 job')");
const card = page.locator("button.m-job", { hasText: "12 High Street" });
await card.waitFor();
await pill.filter({ hasText: "Synced" }).waitFor();
await card.locator(".m-chip", { hasText: "Not synced" }).waitFor({ state: "detached" });
await shot("03-today");

step("go offline and complete the job");
await context.setOffline(true);
await pill.filter({ hasText: "Offline" }).waitFor();
await card.click();
await page.getByRole("dialog").waitFor();
const paid = await page.inputValue("#m-paid");
if (paid !== "15.00") throw new Error(`expected paid to default to 15.00, got ${paid}`);
await page.fill("#m-paid", "17.00");
await page.getByText("Tip £2.00").waitFor();
await shot("04-job-sheet");
await page.getByRole("dialog").locator("button:has-text('Save')").click();
await card.locator(".m-chip", { hasText: "Done" }).waitFor();
await pill.filter({ hasText: "Offline · 1" }).waitFor();
await shot("05-done-offline");

step("the change waits in the outbox");
await page.click(".m-tabs button:has-text('Sync')");
if ((await page.textContent("[data-testid=pending-count]")) !== "1") throw new Error("expected 1 pending change");

step("back online: it syncs");
await context.setOffline(false);
await pill.filter({ hasText: "Synced" }).waitFor({ timeout: 20000 });
if ((await page.textContent("[data-testid=pending-count]")) !== "0") throw new Error("expected nothing pending");
await shot("06-synced");

step("the server has the job done and paid");
const res = await page.request.post(`${BASE}/api/sync`, { data: { changes: [] } });
if (!res.ok()) throw new Error(`sync returned ${res.status()}`);
const { snapshot } = await res.json();
const job = snapshot.jobs.find((j) => j.name.startsWith("12 High Street"));
if (!job || job.status !== "done" || !job.paid) throw new Error(`job not synced: ${JSON.stringify(job)}`);
const ann = snapshot.customers.find((c) => c.id === job.customerId);
if (!ann || ann.balance !== 0) throw new Error(`unexpected balance: ${JSON.stringify(ann)}`);

step("debts, expense and mileage screens render");
await page.click(".m-tabs button:has-text('Debts')");
await page.getByText("Nobody owes anything.").waitFor();
await page.click(".m-tabs button:has-text('Expense')");
await page.fill("#e-cat", "Fuel");
await page.fill("#e-amt", "40");
await page.click("button:has-text('Save expense')");
await page.click(".m-tabs button:has-text('Sync')");
await page.locator("[data-testid=pending-count]", { hasText: "0" }).waitFor({ timeout: 20000 });
await shot("07-sync");

const unauth = await (await browser.newContext()).request.post(`${BASE}/api/sync`, { data: { changes: [] } });
if (unauth.status() !== 401) throw new Error(`expected 401 without a session, got ${unauth.status()}`);

await browser.close();
if (errors.length) { console.error("page errors:", errors); process.exit(1); }
console.log("OK");
