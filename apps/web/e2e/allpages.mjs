// Visit every app page as a fresh owner with sample data; report non-200s and page errors.
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror ${page.url()}: ${e.message}`));
await page.goto(`${BASE}/signup`);
await page.fill("#businessName", "Crawl Co"); await page.fill("#name", "C"); await page.fill("#email", `crawl${Date.now()}@example.com`); await page.fill("#password", "password123");
await page.click("button:has-text('Create account')"); await page.waitForURL("**/customers/new");
await page.fill("[name=c_lastName]", "Smith"); await page.fill("[name=c_address]", "1 High St"); await page.fill("[name=newRoundName]", "Mon"); await page.fill("[name=price]", "15");
await page.click("button:has-text('Save customer and job')"); await page.waitForURL(/customers\/[0-9a-f-]{36}$/);
const customerUrl = page.url().replace(BASE, "");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const routes = ["/dashboard", "/planner", `/planner/day/${today}`, "/job-sheets", "/events", "/time-off", "/customers", "/customers/new", customerUrl, `${customerUrl}/edit`,
  "/customers/import", "/rounds", "/tasks", "/price-revisions", "/price-revisions/new", "/sales-sources", "/map", "/debts", "/debts/aged", "/invoices",
  "/expenses", "/expenses/new", "/expenses/categories", "/expenses/suppliers", "/expenses/recurring", "/expenses/mileage",
  "/messages", "/messages/templates", "/messages/drafts", "/messages/drafts/new", `/messages/new?customer=${customerUrl.split("/").pop()}`,
  "/reports", "/reports/activity", "/reports/valuation", "/reports/forecast", "/reports/retention",
  "/settings", "/settings/users", "/settings/roles", "/settings/round-assignments", "/settings/api", "/integrations", "/integrations/stripe", "/integrations/gocardless",
  "/tax", "/subscription", "/m"];
for (const r of routes) {
  const res = await page.goto(`${BASE}${r}`);
  const status = res?.status();
  const text = await page.textContent("body").catch(() => "");
  if (status !== 200 || /Application error|Unhandled Runtime Error|Internal Server Error/.test(text ?? "")) problems.push(`${status} ${r}`);
  else process.stdout.write(".");
}
await browser.close();
console.log("\n" + (problems.length ? problems.join("\n") : "ALL OK"));
