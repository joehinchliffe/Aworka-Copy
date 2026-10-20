# Worker prompt: capture the logged-in aworka.app desktop app

Paste the following as the first message of a new cloud session on this repository,
branch `claude/hopeful-wozniak-ym0p1y`, in the environment that holds
`AWORKA_EMAIL` and `AWORKA_PASSWORD`.

---

Capture the logged-in DESKTOP web application at https://aworka.app for a
product-replication study, using the GET-only tooling already in this repo, and
push the captured files to branch `claude/hopeful-wozniak-ym0p1y`. The account is
a throwaway test account whose email and password are in the environment
variables AWORKA_EMAIL and AWORKA_PASSWORD. Never print, echo, log or commit
those values. Never submit any form other than the login form, and never click
or request anything that changes data (the crawler already skips such links).

1. `git checkout claude/hopeful-wozniak-ym0p1y`; read `research/tools/README.md`,
   `research/tools/crawl.py`, `research/tools/screenshot.mjs`.
2. Confirm both env vars are set (`test -n "$AWORKA_EMAIL"`) without printing them.
3. Run `AWORKA_MAX_PAGES=700 python3 research/tools/crawl.py research/aworka`.
   It logs in, walks every same-origin link (including every /help/* page) and
   writes `research/aworka/html/*.html` plus `research/aworka/pages.json`.
   If login fails, inspect the saved response and fix `login()` (the form posts to
   /user_session with user_session[email] and user_session[password]). Do not
   loosen the DENY list except for read-only report/print pages.
4. Run `node research/tools/screenshot.mjs research/aworka` for full-page desktop
   screenshots (1366px) into `research/aworka/screens/`. Playwright 1.56.1 is
   installed globally; if `require('playwright')` fails, run with
   `NODE_PATH=$(npm root -g)`. Take an extra 1920px-wide shot of the planner.
5. Write `research/aworka/SITEMAP.md`: every distinct page path with title, body
   id, h1/h2 headings, forms (action, field names, select options) and the
   navigation links it exposes, grouped by area (planner, customers, debts,
   invoices, expenses, reports, settings, plans, help, other). List URL patterns
   you saw but could not fetch. Put any plan names and prices at the top.
6. Commit everything under `research/aworka/` (assets/ is gitignored) as
   "Capture logged-in aworka.app desktop pages, forms and screenshots" and
   `git push -u origin claude/hopeful-wozniak-ym0p1y` (pull --rebase first if
   rejected). If screenshots exceed ~80 MB, keep one per distinct path.
7. Reply with: pages captured, help pages captured, plan names/prices found, the
   areas in SITEMAP.md, anything that failed, and the pushed commit SHA.
