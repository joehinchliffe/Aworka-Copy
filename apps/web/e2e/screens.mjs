import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const OUT = process.env.OUT ?? "../../docs/screenshots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
await page.goto(`${BASE}/`); await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });
await page.goto(`${BASE}/login`);
await page.fill("#email", "demo@example.com"); await page.fill("#password", "password123");
await page.click("button:has-text('Log in')"); await page.waitForURL("**/planner");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const shots = [["02-dashboard", "/dashboard"], ["03-planner", "/planner"], ["04-day", `/planner/day/${today}`], ["05-jobs", "/customers"],
  ["06-debts", "/debts"], ["07-profit-and-loss", "/reports"], ["08-job-sheet", "/job-sheets"], ["09-settings", "/settings"]];
for (const [name, path] of shots) { await page.goto(`${BASE}${path}`); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${name}.png` }); }
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await phone.context().addCookies(await page.context().cookies());
await phone.goto(`${BASE}/m`); await phone.waitForTimeout(2500); await phone.screenshot({ path: `${OUT}/10-mobile.png` });
await browser.close(); console.log("ok");
