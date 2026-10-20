// Full-page screenshots of every HTML page listed in pages.json (GET navigation only).
// Usage: AWORKA_EMAIL=.. AWORKA_PASSWORD=.. node research/tools/screenshot.mjs [research/aworka]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || 'research/aworka';
const BASE = process.env.AWORKA_BASE || 'https://aworka.app';
const { AWORKA_EMAIL, AWORKA_PASSWORD } = process.env;
if (!AWORKA_EMAIL || !AWORKA_PASSWORD) { console.error('Set AWORKA_EMAIL and AWORKA_PASSWORD'); process.exit(1); }

const index = JSON.parse(fs.readFileSync(path.join(OUT, 'pages.json'), 'utf8'));
fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.fill('#user_session_email', AWORKA_EMAIL);
await page.fill('#user_session_password', AWORKA_PASSWORD);
await page.click('input.login-submit');
await page.waitForLoadState('networkidle');

for (const p of index.pages) {
  if (!p.file) continue;
  const name = path.basename(p.file, '.html') + '.png';
  try {
    await page.goto(p.final_url || p.url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.screenshot({ path: path.join(OUT, 'screens', name), fullPage: true });
    console.log('shot', name);
  } catch (e) { console.warn('skip', p.url, e.message); }
}
await browser.close();
