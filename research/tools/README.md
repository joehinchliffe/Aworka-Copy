# Research tooling

Scripts used to capture the public and logged-in surfaces of aworka.app for the
replication plan. They are GET-only: the only form ever submitted is the login form.

```
export AWORKA_EMAIL=...      # set in the cloud environment's secrets, never in git
export AWORKA_PASSWORD=...
python3 research/tools/crawl.py research/aworka        # HTML + pages.json index
node research/tools/screenshot.mjs research/aworka     # full-page PNGs
```

## crawl.py

- Logs in via `/user_session`, then breadth-first walks every same-origin `<a href>`
  that is a plain GET (no `data-method`, `data-confirm` or `data-remote`), plus every
  `data-href` popup target ("New Expense", "Configure", ...), which are GET form renders.
- Help is loaded by JavaScript from `/help/<controller>/<action>`; the Help button carries
  both as data attributes, so the crawler enqueues that URL for every page it visits and
  records `controller_action` in `pages.json`.
- `AWORKA_SEEDS="/invoices,/planner/week/2026-10-20"` adds extra read-only start paths
  the UI does not link to. `AWORKA_MAX_PAGES` (default 600) and `AWORKA_DELAY` (0.4 s) bound the walk.
- The DENY list blocks paths that mutate state even over GET (logout, delete, send, pay,
  banked, deliver, test, ...). Help pages are exempt. Only loosen it for read-only report/print pages.
- The account email is rendered on settings/user pages, so every saved HTML body and index
  value is passed through `redact()`, which replaces the credentials (plain and URL-encoded)
  with `[AWORKA_EMAIL]` / `[AWORKA_PASSWORD]`, and also blanks the API client id/secret spans,
  the planner's Mapbox token and Google Maps keys (GitHub push protection rejects them otherwise).

## screenshot.mjs

- Takes a 1366px full-page PNG of every `status == 200` HTML page in `pages.json`, then a
  1920px planner shot (`day_plans__1920.png`) and one with the help panel open.
- Pages that keep polling (the planner) never reach `networkidle`; the script waits for
  `load`, then up to 8 s for idle, then shoots.
- Before each shot it blanks the credentials in input values and text nodes, and it aborts
  any non-GET request other than the login POST.
- Playwright is resolved from the global install if it is not in `node_modules`
  (`npm i -g playwright`, or set `NODE_PATH=$(npm root -g)`).

Outputs under `research/aworka/`: `html/`, `screens/`, `pages.json`, `SITEMAP.md`
(generated from the first three). `assets/` (CSS/JS) is gitignored.
