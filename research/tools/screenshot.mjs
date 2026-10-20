// Full-page screenshots of every HTML page listed in pages.json (GET navigation only).
// Usage: AWORKA_EMAIL=.. AWORKA_PASSWORD=.. node research/tools/screenshot.mjs [research/aworka]
// Pages that keep polling (the planner) never reach networkidle; we fall back to 'load' then wait briefly.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// ESM imports ignore NODE_PATH, so resolve the globally installed playwright by hand.
const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  const roots = [process.env.NODE_PATH, execSync('npm root -g').toString().trim()].filter(Boolean);
  for (const r of roots) { try { return require(path.join(r, 'playwright')); } catch {} }
  throw new Error('playwright not found; npm i -g playwright or set NODE_PATH');
}
const { chromium } = loadPlaywright();

const OUT = process.argv[2] || 'research/aworka';
const BASE = process.env.AWORKA_BASE || 'https://aworka.app';
const { AWORKA_EMAIL, AWORKA_PASSWORD } = process.env;
if (!AWORKA_EMAIL || !AWORKA_PASSWORD) { console.error('Set AWORKA_EMAIL and AWORKA_PASSWORD'); process.exit(1); }

const index = JSON.parse(fs.readFileSync(path.join(OUT, 'pages.json'), 'utf8'));
fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
// Never let the browser follow a non-GET navigation (belt and braces: we only ever call goto).
await page.route('**/*', (route) => route.request().method() === 'GET' || route.request().url().endsWith('/user_session') ? route.continue() : route.abort());
await page.goto(`${BASE}/login`);
await page.fill('#user_session_email', AWORKA_EMAIL);
await page.fill('#user_session_password', AWORKA_PASSWORD);
await page.click('input.login-submit');
await page.waitForLoadState('load');
await page.waitForTimeout(1500);
console.log('logged in, landed on', page.url());

// The account email is rendered on settings/user pages; blank it in the DOM before every shot.
async function redactSecrets() {
  await page.evaluate((secrets) => {
    const scrub = (s) => secrets.reduce((t, x) => (x ? t.split(x).join('[redacted]') : t), s);
    for (const el of document.querySelectorAll('input, textarea')) { if (el.value && secrets.some((x) => x && el.value.includes(x))) el.value = scrub(el.value); }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) { if (secrets.some((x) => x && n.nodeValue.includes(x))) n.nodeValue = scrub(n.nodeValue); }
    for (const el of document.querySelectorAll('[id*=client_id_value], [id*=client_secret_value], [id*=api_key], [class*=token_value]')) el.textContent = '[redacted]';
  }, [AWORKA_EMAIL, AWORKA_PASSWORD]);
}

async function settle(url) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* polling page */ }
  await page.waitForTimeout(500);
  await redactSecrets();
}

const ONLY = process.env.AWORKA_ONLY ? new RegExp(process.env.AWORKA_ONLY) : null; // re-shoot a subset, e.g. AWORKA_ONLY='^settings|users__'
let ok = 0, failed = 0;
for (const p of index.pages) {
  if (!p.file || (p.status && p.status !== 200)) continue; // skip non-HTML and 404/500 probes
  const name = path.basename(p.file, '.html') + '.png';
  if (ONLY && !ONLY.test(name)) continue;
  try {
    await settle(p.final_url || p.url);
    await page.screenshot({ path: path.join(OUT, 'screens', name), fullPage: true });
    ok++; console.log('shot', name);
  } catch (e) { failed++; console.warn('skip', p.url, e.message); }
}

// Extra wide (1920px) shot of the planner, plus the help panel opened on the planner.
if (!ONLY) try {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await settle(`${BASE}/day_plans`);
  await page.screenshot({ path: path.join(OUT, 'screens', 'day_plans__1920.png'), fullPage: true });
  console.log('shot day_plans__1920.png');
  const helpBtn = page.locator('#help_button, a[data-controller][data-action]').first();
  if (await helpBtn.count()) {
    await helpBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, 'screens', 'day_plans__1920__help_open.png'), fullPage: true });
    console.log('shot day_plans__1920__help_open.png');
  }
} catch (e) { console.warn('planner 1920 shot failed', e.message); }

await browser.close();
console.log(`done: ${ok} shots, ${failed} failed`);
