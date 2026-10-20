// Time the heaviest pages for the seeded demo account against a running server.
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#email", "demo@example.com"); await page.fill("#password", "password123");
await page.click("button:has-text('Log in')"); await page.waitForURL("**/planner");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
for (const r of ["/dashboard", "/planner", `/planner/day/${today}`, "/customers", "/debts", "/reports", "/reports/valuation", "/reports/forecast", "/reports/retention", "/map", "/job-sheets"]) {
  const t = Date.now(); const res = await page.goto(`${BASE}${r}`, { waitUntil: "load" });
  console.log(`${String(Date.now() - t).padStart(6)} ms  ${res?.status()}  ${r}`);
}
await browser.close();
