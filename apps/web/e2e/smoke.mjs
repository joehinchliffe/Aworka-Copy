// End-to-end smoke test: signup -> customer -> plan -> complete -> debts -> invoice.
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "e2e/shots";
const email = `e2e${Date.now()}@example.com`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const step = (s) => console.log("•", s);

step("signup");
await page.goto(`${BASE}/signup`);
await page.fill("#businessName", "Sparkle Windows");
await page.fill("#name", "Sam Shine");
await page.fill("#email", email);
await page.fill("#password", "password123");
await page.click("button:has-text('Create account')");
await page.waitForURL("**/customers/new");

step("new customer");
await page.fill("[name=c_firstNames]", "Ann");
await page.fill("[name=c_lastName]", "Smith");
await page.fill("[name=c_address]", "12 High Street\nLeeds");
await page.fill("[name=c_postcode]", "LS1 1AA");
await page.fill("[name=newRoundName]", "Monday round");
await page.fill("[name=price]", "15");
await shot("01-new-customer");
await page.click("button:has-text('Save customer and job')");
await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/);
await shot("02-customer");

step("plan job today");
await page.goto(`${BASE}/planner/day/${today}`);
await page.check("input[name=specId]");
await page.click("button:has-text('Add to')");
await page.waitForSelector("text=Update job");
step("mark done unpaid");
await page.click("summary:has-text('Update job')");
await page.click("button:has-text('Save')");
await page.waitForSelector(".badge.ok, .badge:has-text('done')");
await shot("03-day");

step("planner month");
await page.goto(`${BASE}/planner`);
await page.waitForSelector(".planner");
await shot("04-planner");

step("debts");
await page.goto(`${BASE}/debts`);
await page.waitForSelector("text=Ann Smith");
await shot("05-debts");

step("invoice");
await page.click("text=Ann Smith");
await page.click("button:has-text('Invoice done jobs now')");
await page.waitForURL(/\/invoices\//);
await shot("06-invoice");

await browser.close();
if (errors.length) { console.error("page errors:", errors); process.exit(1); }
console.log("OK");
