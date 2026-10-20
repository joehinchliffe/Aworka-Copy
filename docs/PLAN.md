# Plan: building a round-management SaaS equivalent to aworka.app

Status: v1, 20 Oct 2026. Evidence base: the public marketing site, legal pages, the
public web-app assets, the offline mobile app source (served unminified), and a
logged-in capture of the desktop web app from a blank test account
(`research/aworka/`: 126 pages, every form field, 57 help routes, screenshots).
Anything not seen directly is marked **inferred**.

---

## 1. Summary and recommendation

Aworka is a UK SaaS for "round" businesses (window cleaners, bin cleaners,
gardeners, dog walkers and similar) run by Tin Cloud Ltd since 2008. It is a
classic Rails monolith with a jQuery front end plus a separate offline-first
mobile web app. Its value is not any single feature but a tightly coupled loop:
recurring job definitions → a planner that projects when each job is due → daily
job sheets → done/paid recording → customer balances and debts → automatic
invoices, statements and receipts → expenses and tax reports → HMRC submissions.

Recommendation: build a clean-room equivalent in four phases over roughly
five to seven months with one to two developers, reaching single-user "Simple"
parity first (about six weeks), then the "Smart" automation and offline mobile
layer, then the "Team" multi-user, VAT and API layer, then HMRC Making Tax
Digital and accounting sync. Use a typed full-stack TypeScript monorepo with
PostgreSQL so the server, the web UI and the offline mobile client share one
domain model, which is the hardest part of this product to get right.

Do not copy Aworka's HTML, CSS, visual design, copy, logo, name or help text.
Their terms assert copyright over look and feel and prohibit reproduction; the
captured material is for behavioural understanding only and must not be shipped.

---

## 2. What Aworka is (verified)

| Aspect | Finding | Source |
|---|---|---|
| Positioning | "Run your Service Business the Easy-Peasy way." Four pillars: Job Planning, Debt Tracking, Invoicing, Bookkeeping | aworka.com home |
| Audience | Window cleaners, wheelie-bin cleaners, gardeners, dog walkers, plumbers, handymen, carpet cleaners; single trader up to national franchise | aworka.com home, /for/* pages |
| Company | Tin Cloud Ltd, company 12151399, Cornwall. Product since 2008 | aworka.com/terms |
| Plans | Simple £15/mo inc VAT; Smart £20/mo inc VAT; Team from £30/mo ex VAT including one employee, +£10 per employee, +£15 per franchisee; yearly Simple £150 and Smart £200 (20% off); Team monthly only. 6-week free trial. Billed in advance, non-refundable | logged-in /subscription/edit, terms |
| Locales | en-GB, en-IE, en-US, en-CA, en-AU, en-NZ, en-ZA, da, nl, nn, es with currency and sales-tax name per locale (VAT, GST, Sales Tax, Moms, BTW) | login page JS |
| Stack | Ruby on Rails (CSRF meta, formtastic, jquery_ujs), jQuery 1.9 + jQuery UI, Magnific popups, nginx 1.28. Mobile: Backbone 1.x + jQTouch PWA with IndexedDB and a service worker | asset headers, mobile.html |
| Hosting | DigitalOcean London (app + managed Postgres with TLS), AWS London S3 for uploads and backups (AES-256, 365-day retention), SparkPost for platform email | privacy notice |
| Integrations | Email: platform, SMTP, Gmail, Outlook. SMS: Text Global, Webex Interact, Esendex, httpSMS (privacy notice also names Textlocal). Payments: GoCardless, PayPal. Maps: Google Maps or Mapbox; what3words. Accounting: QuickBooks Online ("SOON" on Team). Tax: HMRC MTD for VAT and for Income Tax | settings pages, privacy notice |
| Security | Encrypted connections, scrypt-style hashing, password-change emails, 2-hour reset links, role-based access, daily encrypted backups, data export on request | security page, privacy notice |

Plan gating (verified from the subscription page):

- **Simple**: unlimited customers and jobs; job planning; daily job sheets; payments and debts; invoices, statements, estimates, receipts; expenses; mobile app; send emails; send SMS; reports; price revisions; anonymise customers.
- **Smart** adds: automatic invoices; GoCardless; PayPal; events and to-do list; mass messaging; message templates; multi-job editing; advanced job filtering; mapping; address lookup; mileage; recurring expenses; sales sources; customer retention report; automatic data retention; MTD for Income Tax.
- **Team** adds: multiple users with an included additional user; user roles; route optimisation; VAT; MTD for VAT; API access; QuickBooks (soon).

---

## 3. Feature inventory (what the clone must do)

Grouped by the application's own navigation. Codes in brackets are the
option values the product uses; they are documented here because they encode
business rules, not because the clone must reuse them.

### 3.1 Dashboard and reports
- Overview dashboard; Activity log filterable by Jobs, Estimates, Payments, Adjustments, Invoices, Receipts, Job Value Changes, with text search and period (N days/weeks/months/years starting or ending at a date).
- Reports: Valuation (by round, as at date), Income Forecast (less tax, by round, 12 months to tax year end), Profit & Loss (accrual or cash basis, by round, 12 months to year end), Customer Retention (12 months), plus routes for estimates, expenses, sales sources and VAT that resolve to the report engine. Monthly summary of jobs, payments and expenses; printable.

### 3.2 Planner
- Month and week views (grid fragments), "near today" mode with configurable weeks before/after, first weekday setting, days worked, public holidays by region (England, Wales, Scotland, Northern Ireland).
- Highlight modes: Early/Late, Debts, Tasks, Rounds, Round Assignee, Frequency, Payment Methods, Job Notes. Search by job address/reference or customer; filter by round.
- Per day: add jobs popup (list of due jobs colour-coded by lateness, ordered by next due date or round order), fill day, drag-and-drop between days, custom order within a day, "nudge"/shift remaining jobs, clear day, move work down, reset due dates, per-day notes (top/bottom), day totals (value and time), paid markers.
- Job popup: status To Do / Done / Not Done / Skip (and Estimate), price override with previous price, task performed, time required, notes, confirm appointment, payment (paid, tip, method, reference, receipt), send invoice now, plan next (no / on date / in N periods / from last done / from last due).
- Job sheets: per user per date range, status filters (all, to do, to be confirmed, done, done requiring payment, to invoice, skipped, cash customers in debt, customers not prepaid), print layout, email to self, revert to round order, mark all jobs by status, totals.
- Route: start and finish source (user address or furthest job), optimise tomorrow's route overnight, optimisation status polling, route map.
- Events and To Do list (type, date, time, summary, details, linked record), Time Off with reasons.

### 3.3 Customers and jobs
- Combined "New Customer" form creating contact, customer and first job spec in one go (verified field list in `research/aworka/SITEMAP.md`).
- Contact: title, first names, last name, company, multiline address with geocoding (lat/lng, source, selected geocoding id), three phones, email and cc, WhatsApp numbers (inferred from mobile).
- Customer: reference with auto-reference, next invoice ref, contact method (none, email, SMS, both), accepts marketing, payment method (On Day, Card, Collection, By Post, Online, Direct to Bank, Email Invoice, Paper Invoice, Direct Debit; GoCardless shown when a mandate exists), payment frequency (Manually, After Each Job, Overnight, Periodically every N days/weeks/months, When Invoice Value reaches X, When Jobs Done reaches N, Before Each Job), direct debit amount and next date, invoice max period, amount-to-pay display (invoice total, invoiced balance, credit balance), payment terms (not required, by return, COD, net N days from invoice date or month end), notes, starting balance and date.
- Job spec: estimate flag, location (customer address, other address with its own contact, not applicable), reference, round (with inline new round), do-after ordering within round, description (invoice line), time required, price with VAT status (inc, ex, zero rated, exempt, out of scope), notes, frequency (one off, on request, regularly: N times per M days/weeks/months/years, week-of-month or day-of-month rules), allowed days bitmask, appointments (no confirmation, confirm day before, confirm a few days before), plan first job on date, sales source.
- Jobs list with quick search, multi-select and bulk edit ("multi job editing"), advanced filters, suspend/reactivate, delete, export; customer page with jobs, activity history, payments, invoices; late payment handling; customer messages.
- Rounds (name, other-income flag), round ordering (drag order per round and day), round assignments to users; Tasks (standard name, invoice description, time, price); Price Revisions (by round, price range, price age, percentage or fixed, rounding, minimum change, revertable); Sales Sources with types; Map of job locations.

### 3.4 Debts, invoices, statements
- Current debts and aged debts with filters by payment method, debts/credits/invoiced/active/zero balances, sort by debt since, balance or round order; issue statements to selected customers; print debt list; write off debts; mark debt paid.
- Invoices list, edit, print, multiple print, email with online view link and/or PDF attachment; invoice numbering, title, notes, small print, show next job date; receipts and estimates with their own numbering and notes; payments "banked" marking.
- Automatic invoicing runs: after each job (about 15 minutes after the day's last sync), overnight checks, periodic, value and job-count thresholds.

### 3.5 Messaging
- History with status (sent, pending, queued, failed) and reason (invoices, receipts, statements, job sheets, customer messages); drafts; templates per purpose (general, marketing, invoices, estimates, receipts, statements, upcoming jobs, jobs done, jobs done requiring payment, jobs not done, jobs skipped, payment reminders, direct debit cancelled, job sheets, prepayment receipt) with email subject, body, bcc, SMS content and show-as-event; mass messaging from job sheets or job list.
- Email sending via platform, SMTP (host, port, auth type, STARTTLS, rate limit), Gmail, Outlook; SMS via provider adapters with key, secret, sender id and max credits per message; signature and copy-to-self.

### 3.6 Expenses, mileage
- Expenses with date, category (inline new), supplier (inline new), reference, description, amount (can be added later), VAT status (inc at rate, inc charged, zero rated, exempt, out of scope), rate or charged amount, paid-by method, payment reference, tax treatment (all business, private-use percentage, custom), allowable for income tax, reclaimable VAT, tax notes; filters by category, method and period; duplicate last in category.
- Categories (enabled, capital asset flag), suppliers (enabled, from other EC state), recurring expenses (every N units, continue forever / N payments / until date / until total).
- Vehicles (name, registration, acquired, initial mileage, rate per mile) and mileage logs.

### 3.7 Settings and administration
- Business details, logo, website, tax year end, collect VAT, MTD services (none, VAT, income tax, both), VAT registrations with periods, return cadence, scheme (standard, cash accounting, flat rate basic, flat rate cash, annual), flat rate, capital asset threshold.
- Invoicing, receipts, estimating, online payments (GoCardless with fee category, PayPal with email, threshold and fee category), features (profit calculation basis, record mileage, first weekday), job and customer defaults, planner behaviour (jobs left To Do are assumed not done / marked done overnight / stay to do; auto-mark after N days; show future jobs; set paid to job price or debt balance), route optimisation, customer data retention (suspend overdue regular jobs, suspend unrequested jobs, delete suspended and completed one-offs, delete unconverted estimates, anonymise deleted customers, anonymise invoices, each after N weeks/months/years).
- Users (email, password, name, business, address, phone, role, manager, email login details; adding a user changes the subscription price), roles with a 29-permission matrix (administrator, debt collection only, web access, mobile access, create/edit/delete/suspend jobs, show account-customer prices, export jobs, add/edit/move/remove jobs, adjust prices, enter payments, access debt list, write off debts, send invoices/estimates, view/export reports, record expenses, edit settings, book time off, create events, send messages, edit sales sources), switch user ("alias"), announcements (guides, system updates).
- API: enable API access, application secret regeneration, personal access tokens, JSON API docs. Password change with current password. Testimonial field. Subscription management.

### 3.8 Offline mobile app (secondary priority)
- Standalone PWA: login, sync, home (debts, new job, expenses, mileage), round chooser, due jobs, new jobs, N-day planner, job sheet with totals, job editor (status, price, task, notes, payment, receipt, invoice, location, directions, what3words, plan next), customer editor with address lookup, debts with sort and pay, expenses, mileage. Full spec in the research notes.

---

## 4. Domain model

Entities and relationships recovered from the mobile source and the desktop
forms. Money is stored as integer pence; dates as ISO dates; every tenant row
carries an account id.

```
accounts (tenant: business details, year end, locale, currency, tax name, plan, settings)
users (account, email, password hash, role, manager, contact, days worked, planner prefs)
roles (account, name, 29 permission booleans)
contacts (name parts, company, multiline address, lat/lng + source, geocoding id, phones x3,
          email, email cc, whatsapp numbers, what3words)
customers (account, contact, reference, auto ref, next invoice ref, contact method,
           accepts marketing, payment method, payment frequency, num periods, period unit,
           direct debit amount, next invoice/dd date, invoice thresholds, invoice max period,
           show balance mode, payment terms type + days, notes, starting balance + date,
           gocardless mandate/email; derived: balance, invoiced balance, debt since)
rounds (account, name, user, other income)
tasks (account, name, description, time, price)
sales_source_types, sales_sources
job_specs (customer, job contact, round, round day/index, task, sales source, status e|a|s|d,
           reference, description, notes, price, vat status, time required, allowed days bitmask,
           appointments, confirmed, regularity o|c|r, times per period, num periods, period unit,
           month week-or-day rule, location c|o|n, start date, next due date, last done date,
           recent job, import id, lateness per day)
jobs (job spec, date, due time, status t|d|n|s|e, appointment type e|f|a|m, projected flag,
      price, previous price, vat status + rate, time required, confirmed, notes, custom index,
      task, payment, send invoice, invoice, invoice email override, plan-next fields)
payments (customer, job?, date, paid, tip, method, reference, status pending|cleared, banked,
          receipt number, send receipt, receipt email override)
invoices (customer, number, date, due date, status, lines from jobs, totals, vat, sent via, online token)
statements, receipts, estimates (documents generated from the above)
expense_categories, expense_suppliers, expenses, recurring_expenses
vehicles, mileages
events (type event|to do, user, start, time, summary, details, linked record)
holidays, holiday_types
messages (account, customer?, channel email|sms, reason, status, body, provider ids), message_templates, message_drafts
price_revisions (+ per-job revision lines so they can be reverted)
announcements, activities (audit/activity log)
sales_tax_registrations (periods, scheme, rate, flat rate, capital threshold), vat_returns
integrations (per account: smtp, gmail/outlook oauth, sms account, gocardless, paypal, quickbooks, hmrc)
api_applications, personal_access_tokens
mobile_sync_cursors (per user: last server timestamp, planner window)
```

Key enumerations to preserve semantically (any internal codes are the clone's choice):
customer payment method (9 values), payment frequency (7), payment terms (4 types),
job status (5), appointment type (4), job spec status (4), regularity (3),
appointments (3), VAT status for jobs (5) and expenses (5), expense/payment methods (10),
allowed days (7-bit mask), plan-next modes (6), message reasons (15), role permissions (29).

---

## 5. Business rules the clone must reproduce

These are the rules that make the product work; most were verified in the mobile
source, the rest in the desktop forms and help articles.

1. **Due date projection.** A regular job spec yields a next due date from its
   last done or last due date (configurable "replan from"), its N-per-period
   frequency and its month rule; allowed days constrain which weekday it can be
   planned on; a lateness-per-day factor colours jobs early (blue) to late (red).
   Future occurrences are projected as read-only "future jobs" on the planner.
2. **Planning.** Adding a job to a day creates a To Do job snapshotting the spec's
   name, price, VAT status, time and confirmation requirement. A spec may have
   only one job per date. Moving a future-dated job to Done sets its date to today.
3. **Completion and payment.** Marking Done opens payment entry; paid defaults to
   the job price or the whole debt balance (setting); tip is the overpayment;
   negative tip records a bad-debt write off; refunds are negative payments.
   Customer balance = previous balance + paid − price − tip (negative means owed);
   debt-since is set when the balance first goes negative.
4. **Jobs left To Do** at end of day are, per setting, assumed Not Done, marked
   Done overnight, or kept until the next job is due, after N days.
5. **Plan next** after Done/Skipped/Not Done: none, on a date, in N periods, from
   last done, or from last due; on-request jobs are never auto-planned.
6. **Invoicing.** Invoice customers (email or paper) are invoiced manually, after
   each job (about 15 minutes after the last sync that day), overnight, every N
   periods, when uninvoiced value or job count reaches a threshold, or before each
   job. Direct-debit customers use manual or periodic. Amount to pay can show the
   invoice total, the invoiced balance or the credit balance; payment terms derive
   a due date. Invoice, receipt and estimate numbers are per-account sequences
   with optional per-customer next numbers.
7. **Account customers' prices are hidden** from staff unless the role allows it;
   on-day customers' prices are always shown.
8. **VAT.** Prices carry inc/ex/zero/exempt/out-of-scope status; gross and net are
   computed with the account rate at the time of the job; expenses track reclaimable
   VAT; registrations define return periods and scheme; P&L is accrual or cash basis.
9. **Automatic data retention.** Suspend overdue regular jobs and unrequested
   on-request jobs after N periods; delete suspended/completed one-offs and
   unconverted estimates; anonymise deleted customers and old invoices.
10. **Roles.** Users see their own rounds; administrators see all; "debt collection
    only" roles see debts across rounds; permissions gate every mutating action and
    are also pushed to the mobile client as allowed-to flags.
11. **Price revisions** apply percentage or fixed changes with rounding and a
    minimum change to a filtered set of jobs, and can be reverted; jobs tied to a
    Task take the task price instead.
12. **Offline sync.** Client-generated ids, per-record changed-attribute tracking,
    a single delta sync call carrying all changes and returning changed tables plus
    settings and a planner window; server wins on conflict; deletes are never sent
    from mobile (zeroing a payment deletes it server side).

---

## 6. Architecture for the clone

### 6.1 Stack (recommended)
- **Monorepo, TypeScript end to end**: one `domain` package holding the entity
  types, enums, money and date helpers, recurrence engine and permission matrix,
  imported by the server, the web app and the offline mobile client. This is the
  single most important decision: Aworka's weakest point is three copies of the
  rules (Rails, jQuery, Backbone) that drift.
- **Server**: Node (Fastify or NestJS) with PostgreSQL 16, Drizzle ORM and
  migrations, pg-boss (or BullMQ on Redis) for background jobs (invoice runs,
  overnight auto-mark, retention, route optimisation, message delivery, HMRC
  submissions), S3-compatible object storage for logos, PDFs and exports.
- **Web app**: Next.js (App Router) or Remix with React; server-rendered lists and
  forms, client components for the planner grid, drag-and-drop and popups. Printing
  via dedicated print routes rendered with Playwright/Chromium to PDF.
- **Mobile**: a React PWA sharing the domain package, Dexie (IndexedDB) for
  offline storage, a service worker for the shell, and a sync client. Ship it after
  the web app; keep it to the same feature set as Aworka's mobile app.
- **Alternative**: Ruby on Rails 8 with Hotwire would reach feature parity fastest
  for the web app alone and mirrors the original's shape, but forces a separate
  JavaScript implementation of the recurrence and balance rules for offline mobile.
  Choose it only if the team is Rails-native and mobile offline is deferred.

### 6.2 Multi-tenancy, auth and roles
- Every table carries `account_id`; enforce with row-level security or a mandatory
  query scope. Users belong to one account; franchise structures are modelled as a
  manager relationship within the account (as Aworka does) rather than nested tenants.
- Email + password (argon2id), password-change notifications, 2-hour reset tokens,
  optional TOTP two-factor (an improvement over Aworka), session cookies for web,
  short-lived bearer tokens for the mobile sync and API, personal access tokens
  with labels for the public API.
- A permission matrix of about 30 booleans per role; evaluate on the server for
  every mutation and send the effective flags to clients.

### 6.3 Scheduling engine
- Pure functions in the domain package: `nextDueDate(spec, from)`, `isAllowedOn`,
  `projectOccurrences(spec, window)`, `lateness(spec, date)`, `applyPlanNext`.
- Materialise planned jobs; project future occurrences on read for the planner
  window (cache per user and window). Nightly job recomputes next due dates,
  applies auto-mark policies, suspensions and retention.

### 6.4 Documents and messaging
- One rendering pipeline for invoices, statements, receipts, estimates and job
  sheets: HTML template → PDF (Playwright) → stored in object storage → delivered
  by email with an online-view token link and/or attachment, printed, or marked as
  paper. Message records track channel, reason, provider id and status with
  webhook updates.
- Provider adapters: email (platform transactional provider, SMTP, Gmail OAuth,
  Microsoft Graph OAuth) and SMS (two or three UK providers behind one interface,
  with credit estimates and sender ids). Templates per purpose with merge fields.

### 6.5 Payments and integrations
- GoCardless via the partner OAuth connect flow, Billing Requests to create
  mandates, payments created from invoices, webhooks updating payment status
  (pending → cleared, failed, cancelled with a "direct debit cancelled" message),
  fees posted to a chosen expense category.
- PayPal pay links on invoices (optionally only under a threshold) and IPN/webhook
  reconciliation; a card option via Stripe is an obvious extension Aworka lacks.
- Maps: geocoding on address save, job-location map with clustering, address
  lookup via a UK postcode provider, directions links; route optimisation via
  Mapbox Optimization or Google Routes as a nightly job with start/finish rules.
- QuickBooks Online: OAuth2, push customers, invoices, payments and expenses.
- HMRC MTD: VAT returns (obligations, submit, liabilities) and ITSA quarterly
  updates with expense category mapping, cash or accrual basis; requires HMRC
  developer registration, sandbox testing, fraud-prevention headers and
  production approval, so start the application process early (Phase 3).
- Public JSON API with personal access tokens and generated docs; CSV import
  (customers and jobs from Aworka, George, Cleaner Planner, generic CSV) and
  full data export.

### 6.6 Offline sync design (mobile)
- Client ids as UUIDs; each table row has `updated_at` and a monotonically
  increasing `version`; sync request carries the client's last server cursor and
  a list of changed records with changed attributes; response returns records
  changed since the cursor plus the settings and permission flags; server wins
  on conflicting attributes but keeps an audit entry. Pending changes survive
  failed syncs; a reset wipes local data. Scope the client dataset to the user's
  rounds and a configurable planner window to keep it small.

### 6.7 Non-functional
- UK data residency (AWS eu-west-2 or DigitalOcean London), daily encrypted
  backups with 1-year retention and restore drills, TLS everywhere, audit log of
  mutating actions, GDPR processor terms with a sub-processor list, data export
  and deletion, retention automation as above.
- Observability (structured logs, error tracking, job queue dashboards),
  automated tests for the domain rules (recurrence, balances, VAT, invoicing
  triggers) as the first-class test suite, end-to-end tests for planner and
  invoice flows, accessibility and print checks.
- Subscription billing with Stripe (plans mirroring Simple/Smart/Team, per-user
  pricing, 6-week trial, suspend on non-payment, retention of suspended data for
  1 or 3 months).

---

## 7. Delivery roadmap

Effort assumes one senior full-stack developer plus AI tooling, with a second
developer from Phase 2. Weeks are calendar weeks.

### Phase 0: foundations (weeks 1-2)
Repo and CI; database schema for accounts, users, roles, contacts, customers,
rounds, tasks, job specs, jobs, payments; auth; settings pages; design system and
app shell (navigation mirrors sections, not Aworka's markup); domain package with
money, dates, recurrence and permissions plus unit tests.

### Phase 1: single-user core, "Simple" parity (weeks 3-8)
Customer and job creation form; jobs list with search; rounds and round ordering;
tasks; planner month/week with add-jobs popup, drag-and-drop, day notes, totals;
job popup with status, price, payment and plan-next; job sheets with filters and
print; debts and aged debts; invoices, statements, receipts, estimates as PDFs
with platform email; expenses, categories, suppliers; activity log; P&L and
monthly summary reports; price revisions; anonymise customer; events and time
off; message templates and single-customer email/SMS through one SMS provider.
Exit criteria: a window cleaner can run a week of work end to end, including
invoicing an account customer and chasing a debt.

### Phase 2: automation and mobile, "Smart" parity (weeks 9-16)
Automatic invoice runs and thresholds; overnight auto-mark and retention jobs;
mass messaging and drafts; multi-job editing and advanced filters; mapping,
geocoding, address lookup, job map; mileage and recurring expenses; sales sources
and customer retention report; valuation and income forecast; GoCardless and
PayPal; Gmail/Outlook/SMTP sending; offline mobile PWA with sync; CSV import and
export.

### Phase 3: teams, VAT, API, "Team" parity (weeks 17-22)
Users, roles matrix, round assignments, switch-user, per-user job sheets and
planner filters; route optimisation; VAT registrations, VAT return report and
MTD VAT submission; public API with tokens and docs; QuickBooks sync;
announcements; subscription billing and plan gating.

### Phase 4: tax and launch (weeks 23-28)
MTD for Income Tax quarterly updates with category mapping and end-of-period
statements; HMRC production approval; marketing site and onboarding; data
migration tooling from Aworka exports; load, security and backup-restore testing;
launch.

Beyond parity (candidates, not scheduled): card payments by Stripe, customer
self-service portal (view invoices, pay, confirm appointments), WhatsApp
messaging, a native-feeling mobile experience, open banking reconciliation,
quoting with photos, team location sharing.

---

## 8. Risks and open questions

- **Recurrence semantics**: the exact server-side calculation of next due dates,
  lateness and plan-next "in"/"from" modes is not visible in the captured code.
  Mitigation: populate the test account with jobs at each frequency and record
  the planner output as acceptance fixtures before building the engine.
- **HMRC approval** takes weeks and requires fraud-prevention headers and a
  reviewed sandbox run; it gates the Income Tax and VAT MTD features.
- **GoCardless partner access** and PayPal business verification need company
  details; apply early.
- **Scope creep**: the settings page alone has more than 100 fields. Keep Phase 1
  to the Simple plan and defer every Smart/Team item.
- **Legal**: clean-room implementation only; no reuse of Aworka copy, help text,
  markup, styles, images or name; choose a distinct product name and brand.
- **Open**: Which plan to launch with and at what price; whether franchise
  billing (per franchisee) is needed at launch; which SMS and address-lookup
  providers to contract; whether the existing round-manager codebase should be
  the base instead of a greenfield build.

---

## 9. Immediate next steps

1. Decide stack (recommendation in 6.1) and product name; initialise the monorepo.
2. Populate the Aworka test account with sample data covering every frequency,
   payment method and invoice frequency, then re-run the capture so planner, debts,
   invoice and report pages are documented with content, and record expected
   outputs as fixtures.
3. Write the domain package first: schema, enums, money, recurrence engine,
   balance arithmetic, permission matrix, with tests derived from the fixtures.
4. Register developer accounts: HMRC Developer Hub, GoCardless sandbox, PayPal
   sandbox, Mapbox or Google Maps, an SMS provider, a transactional email provider.
5. Build Phase 1 in vertical slices: customers and jobs → planner → payments and
   debts → invoices → expenses and reports.

---

## Appendix A: evidence index

- `research/aworka/SITEMAP.md`: every captured desktop page, its routes, forms and
  fields, plus URL patterns seen in the app JavaScript for actions the crawler did
  not call (planner moves, job sheet marking, bulk edits, HMRC endpoints, API).
- `research/aworka/pages.json`, `research/aworka/html/`, `research/aworka/screens/`:
  raw capture.
- `research/tools/`: the GET-only crawler and screenshot scripts used.
- Offline mobile app analysis (data model, enums, sync protocol, screen specs):
  derived from the public `/new_mobile/javascripts/*.js` sources; summarised in
  sections 4, 5 and 6.6.
- Public pages: aworka.com home, /for/window_cleaning, /tour, /security,
  /mtd_income_tax, /privacy, /terms; aworka.app login, signup, contact, mobile.
