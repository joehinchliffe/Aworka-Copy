# Plan: building a round-management SaaS equivalent to aworka.app

Status: v2, 20 Oct 2026. Evidence base: the public marketing and legal pages, the
public web-app assets, the offline mobile app source (served unminified), a
logged-in capture of the desktop web app from a blank test account
(`research/aworka/`: 126 pages, every form field, 57 help routes, screenshots),
and web research on competitors and current integration APIs. Anything not seen
directly is marked **inferred**. Section 11 lists what changed from v1.

---

## 1. Summary and recommendation

Aworka is a UK SaaS for "round" businesses (window cleaners, bin cleaners,
gardeners, dog walkers and similar) run by Tin Cloud Ltd since 2008. It is a
Rails monolith with a jQuery and Prototype front end plus a separate offline
mobile web app. Its value is a tightly coupled loop: recurring job definitions →
a planner that projects when each job is due → daily job sheets → done and paid
recording → customer balances and debts → automatic invoices, statements and
receipts → expenses and tax reports → HMRC submissions.

**Recommendation.** Build a clean-room equivalent in four phases over roughly six
months with one to two developers: single-user "Simple" parity first (about six
weeks), then the "Smart" automation layer with card payments and a customer
portal, then the "Team" multi-user, VAT, route and API layer, then HMRC Making
Tax Digital and accounting sync. Use a typed TypeScript monorepo on PostgreSQL so
the server, web app and offline mobile client share one domain model, which is
the hardest part of this product to get right.

**Five findings that change the plan versus a naive copy:**

1. Public pricing, card payments (Stripe), a customer portal and route
   optimisation in the base tier are now table stakes in this market; Aworka
   lacks the first three and gates the fourth to its top tier.
2. HMRC has closed production access for new 2026-27 Income Tax quarterly-update
   products. Income Tax MTD must be planned as a 2027-28 deliverable pending
   HMRC confirmation; VAT MTD remains open.
3. PayPal is retiring the email-address "Buy Now" model Aworka uses. The clone
   should offer Stripe for cards and treat PayPal as optional via its partner API
   or a pasted payment link.
4. Textlocal (named in Aworka's privacy notice) closed in July 2026 and
   getAddress.io closed in February 2026. SMS goes through Webex Interact, Text
   Global, Esendex or httpSMS; address lookup through Ideal Postcodes, Loqate or
   OS Places.
5. Every integration carries an approval queue (GoCardless partner certification,
   Google sensitive-scope review, Microsoft publisher verification, HMRC
   production credentials). Apply for all of them in Phase 0.

Do not copy Aworka's HTML, CSS, visual design, copy, logo, name or help text.
Their terms assert copyright over look and feel and prohibit reproduction; the
captured material is for behavioural understanding only and must not ship.

---

## 2. What Aworka is (verified)

| Aspect | Finding | Source |
|---|---|---|
| Positioning | "Run your Service Business the Easy-Peasy way." Pillars: Job Planning, Debt Tracking, Invoicing, Bookkeeping | aworka.com |
| Audience | Window cleaners, wheelie-bin cleaners, gardeners, dog walkers, plumbers, handymen, carpet cleaners; sole trader to national franchise | aworka.com, /for/* pages |
| Company | Tin Cloud Ltd, company 12151399, Cornwall; product since 2008 | terms |
| Plans | Simple £15/mo inc VAT (£150/yr); Smart £20/mo inc VAT (£200/yr); Team from £30/mo ex VAT including one employee, +£10 per employee, +£15 per franchisee, monthly only. 6-week trial. Billed in advance, non-refundable | /subscription/edit, terms |
| Locales | en-GB, en-IE, en-US, en-CA, en-AU, en-NZ, en-ZA, da, nl, nn, es with currency and tax name per locale | login page |
| Stack | Rails (formtastic, jquery_ujs), two coexisting JS stacks (Prototype/Scriptaculous on planner, jobs, debts, dashboard; jQuery 1.9/jQuery UI/Magnific elsewhere), Mapbox GL JS 3.13 for maps, nginx 1.28. Mobile: Backbone/jQTouch PWA with IndexedDB and a service worker | asset headers, captured HTML |
| Hosting | DigitalOcean London (app and managed Postgres), AWS London S3 (uploads, encrypted backups, 365-day retention), SparkPost for platform email | privacy notice |
| Email | Platform mailbox per tenant (`aworkaNNNN@aworka.com`), SMTP, Gmail via Gmail API `gmail.send` scope, Outlook via Microsoft Graph `Mail.Send` | settings page OAuth URLs |
| SMS | Bring-your-own provider: Text Global (3.5p per UK message via Aworka), Webex Interact, Esendex, httpSMS; key, secret, 11-char sender, max credits per message | /sms_account/edit |
| Payments | GoCardless partner OAuth connect (read_write scope) with fees booked to an expense category; PayPal by merchant email with optional amount threshold | settings page |
| Tax | HMRC production OAuth for VAT (`read:vat write:vat`) and Income Tax (`read:self-assessment write:self-assessment`); VAT schemes standard, cash accounting, flat rate (basic and cash), annual | settings, VAT registration form |
| Accounting | QuickBooks Online marked "SOON" on Team | subscription page |
| Security | TLS, hashed passwords, password-change emails, 2-hour reset links, role-based access, daily encrypted backups, export on request | security page, privacy notice |

Plan gating (verified):

- **Simple**: unlimited customers and jobs; planning; daily job sheets; payments and debts; invoices, statements, estimates, receipts; expenses; mobile app; email and SMS sending; reports; price revisions; anonymise customers.
- **Smart** adds: automatic invoices; GoCardless; PayPal; events and to-do list; mass messaging; message templates; multi-job editing; advanced job filtering; mapping; address lookup; mileage; recurring expenses; sales sources; customer retention report; automatic data retention; MTD for Income Tax.
- **Team** adds: multiple users with one included; user roles; route optimisation; VAT; MTD for VAT; API access; QuickBooks (soon).

---

## 3. Market and positioning

From the competitor sweep (full matrix in the research notes, see Appendix B).

**Market shape.** Three incumbents dominate forum discussion: Cleaner Planner
(Basic £19, Pro £29, Team £49 for 5 users; no route optimisation, no accounting
sync, no MTD; iOS app rated 2.4 and unmaintained since 2024), Squeegee (per-user
pricing, Core about £19 inc VAT with route optimisation and GoCardless in the base
tier, Stripe and customer portal on Advanced, its own accounts module and HMRC
submissions, SMS 3.6p) and Aworka. A 2024-26 wave of cheap entrants sits below
them: RoundWiz £7.99 flat, getSoapy from £7 with processing fees, DueMate from
£9.99, Surehand £15 for three users with SIM-based free SMS and Open Banking,
Manage My Round £15, Round Monster £24 to £119 with offline worker app and
Xero/QuickBooks. Generic field-service tools (Jobber, ServiceM8, Tradify) are
poorly suited: USD or per-user pricing, job caps, no GoCardless.

**What drives switching in 2025-26.** MTD for Income Tax (mandatory from April
2026 above £50k, 2027 above £30k, 2028 above £20k) is the stated reason users
leave Cleaner Planner. Price creep sends some to Aworka; lack of features and a
fiddly mobile app send Aworka users to Squeegee or Cleaner Planner.

**Aworka's reputation.** Praised for price (historically £10 to £12), simplicity,
mobile-first operation and longevity. Criticised for accidental drags on the
mobile app, slow feature progress, no customer portal, PayPal-only card
payments, route optimisation and VAT gated to Team, no public price list, no
store or review-site presence, and QuickBooks still "soon".

**Table stakes for a launch (every live UK round tool has them):** multiple jobs
per customer with 4/6/8-weekly, monthly and one-off frequencies; drag-and-drop
planner with rain-day bulk shift; a phone-usable job sheet with one-tap done and
paid; debts by age and round with chase actions; PDF invoices and statements with
automatic invoicing; GoCardless collection on completion; SMS reminders with
templates and bulk send; expenses with a year-end summary; import from
spreadsheets and from Cleaner Planner, Squeegee, Aworka and George, plus full
export; a no-card trial; an offline-capable mobile client; and either MTD
quarterly updates or a clean quarterly export.

**Differentiators worth building (Aworka lacks all of these):** Stripe card
payments and pay-by-bank links; a customer portal for invoices, payment and
appointment confirmation; two-way SMS with YES/NO handling that removes a job from
the day; bank-statement or Open Banking payment matching; route optimisation and
maps in the base tier; a modern mobile experience with store presence; public,
VAT-inclusive pricing with a migration concierge.

**Positioning and pricing recommendation (inferred).** Launch as "the simple
one with modern payments": flat, VAT-inclusive pricing at roughly £12 to £15
solo, £20 to £25 with automation and card payments, and a team tier at £30 plus
£10 per user, undercutting Cleaner Planner and per-user Squeegee for multi-van
businesses while matching Aworka's simplicity. Publish prices on the website.

---

## 4. Feature inventory (what the clone must do)

Grouped by the application's own navigation. Codes in brackets are the option
values the product uses; they are recorded because they encode business rules,
not because the clone must reuse them. Detailed per-page specifications
(every field, option and route) are in `research/aworka/SITEMAP.md`.

### 4.1 Dashboard and reports
- Dashboard with six widgets: overview (sales summary for today, yesterday, this and last week, this and last month, tax year to date, same period last year), invoices, events, debts, next due, pending payments.
- Activity log filtered by Jobs, Estimates, Payments (cash to GoCardless, refunds, tips, unapproved/pending/cleared/failed, banked or not), Adjustments (starting balance, credit, overpayment, surcharge, discount, tip, bad debt), Invoices, Receipts, Job Value Changes; text search; period of N days/weeks/months/years starting or ending at a date; hidden filters for task, payment method, frequency, sales source and price revision.
- Reports: Valuation (by round, as at date), Income Forecast less tax (by round, 12 months to tax year end), Profit & Loss (accrual or cash basis, by round, with expenses, estimates, sales sources and VAT breakdowns), Customer Retention (12 months), monthly summary (net sales per round, gross income with tips itemised, bad debt, net expenses per category, profit before tax per month and year). Printable.

### 4.2 Planner
- Sunday-first month grid loaded week by week; "near today" mode with configurable weeks before and after; first weekday, days worked, public holidays by region (England, Wales, Scotland, Northern Ireland).
- Highlight modes: status (default), Early/Late, Debts, Tasks, Rounds, Round Assignee, Frequency, Payment Methods, Job Notes. Show job address/reference or customer name. Search and round filter.
- Day actions: add jobs popup (due jobs colour-coded by lateness, ordered by next due date or round order), fill day, drag-and-drop between days, custom order within a day, nudge remaining jobs forward, clear day, move work down, reset due dates, per-day top and bottom notes, day totals of value and time, paid markers.
- Job chip states: To Do (optionally Not Confirmed / Confirmed), Done, Done and Paid, Not Done, Not Allowed (moved to a disallowed weekday), Estimate, New (first visit), auto-booked.
- Job popup: status, confirmed, paid amount with "inc Tip?" split, tip, price with "Permanent?" flag, time required, notes, delete; the next To Do popup opens automatically after saving.
- Job sheets per user per date range at `/users/:id/job_sheets/:days/starting/:date/:status`; status filters all, to do, to be confirmed, done, done requiring payment, to invoice, skipped, cash customers in debt, customers not prepaid; print, email to self, message customers (mass-message draft), revert to round order, mark all jobs by status, totals.
- Route: start and finish source (user address or furthest job), optimise, reverse, revert to round order, stop, dropped points, overnight optimisation, status polling, route map.
- Events (Event or To Do, linked record, date, time, summary, details; filter all, to do, done to do, events) and Time Off (from, to, free-text reason that creates a reason type, notes).

### 4.3 Customers and jobs
- One combined "New Customer" form creating contact, customer and first job spec. Contact: title, first names, last name, company, address with autocomplete and geocode (lat/lng with source badge: fail, approximate, geocoded, GPS, manual, what3words; drag marker to correct), three phones, email and cc. Customer: reference (max 15) with auto-reference, next invoice reference, contact method (none, email, SMS, both; default email), accepts marketing (default on), payment method (On Day, Card, Collection, By Post, Online, Direct to Bank, Email Invoice, Paper Invoice, Direct Debit; GoCardless shown when a mandate exists), payment frequency (manually, after each job, overnight, every N days/weeks/months, when invoice value reaches X, when jobs done reaches N, before each job), direct-debit amount and next date, invoice thresholds (default 2 jobs) and maximum period (default 2 months), amount-to-pay display (invoice total, invoiced balance, credit balance), payment terms (not required, by return, COD, net N days from invoice date or month end), notes, starting balance and date (negative means in debt).
- Job spec: estimate flag; location (customer address, other address with its own contact, not applicable); reference (required when not applicable, else defaults to first address line); round with inline "New Round" and "do after" ordering; description (appears on invoices; falls back to the default job description); time required (default 30 minutes; sets chip height); price (0 shows as FREE); notes (never on invoices); frequency one off, on request, or regularly N times per M days/weeks/months/years with a week-of-month or day-of-month rule; allowed days; appointments (no confirmation, confirm the day before, confirm a few days before); plan first job on a date; sales source.
- Jobs list with quick search, Show filters (debts, prices, suspended, selected), multi-select with "Choose Action" (bulk edit N jobs, send messages, export), debt colouring from yellow to red over a month and credits in green, price-revised column, suspend and reactivate, customer overview page with activity table, bad-debt and adjust-balance popups, statements and invoices, messages.
- Rounds (name, other-income flag; renaming; created from the job form), round ordering (three selector panels, sortable lists, per weekday or all days), round assignments to users, Tasks (name, invoice description, time, price, each behind an enable flag; editing a task updates every job using it), Price Revisions, Sales Sources with types, map of job locations with clustering.

### 4.4 Debts, invoices, statements
- Current debts: filter by payment method, by debts/credits/invoiced/active/zero balances, sort by debt since, balance or round order, text and round filters; select customers and issue statements; totals row. Aged debts as at a date (default previous month end). Print debt list.
- Invoices list (date, customer, number, net value, printed, emailed) with multi-select print; invoice edit; email with online-view link and/or PDF attachment; numbering, title, notes, small print, show next job date; receipts and estimates with their own numbering and notes; payments marked banked individually or all at once.
- Automatic invoicing runs: after each job (about 15 minutes after the day's last sync), overnight checks, periodic, value and job-count thresholds, before each job.

### 4.5 Messaging
- History with status (sent, pending, queued, failed, selected) and reason (invoices, receipts, statements, job sheets, customer messages) over a date window; drafts built from job sheets or the jobs list and delivered in one action; templates per purpose (general, marketing, invoices, estimates, receipts, statements, upcoming jobs, jobs done, jobs done requiring payment, jobs not done, jobs skipped, payment reminders, direct debit cancelled, job sheets, prepayment receipt) with email subject, body, bcc, SMS body, show-as-event, and about 25 merge tags including a customer portal link and a set-up-direct-debit link.
- Email via platform, SMTP (host, port, auth type, STARTTLS, minimum seconds between sends, test button), Gmail, Outlook; signature; copy to self. SMS via provider adapters with character and credit counting, credit balance and sender lookup.

### 4.6 Expenses, mileage
- Expenses: date, category (inline new), supplier (inline new), reference, description, amount (may be added later), VAT status (inc at rate, inc charged, zero rated, exempt, out of scope) with rate or charged amount, paid-by method, payment reference, tax treatment (all business, private-use percentage, custom), allowable for income tax, reclaimable VAT, tax notes; filters by category, supplier, method and period; duplicate last in category.
- Categories (enabled, capital asset), suppliers (enabled, from other EC state), recurring expenses (every N days/weeks/months/years from a next-due date; continue forever, for N payments, until a date or until a total; catch-up generation on save, then automatically on each due date; edits never duplicate or alter generated expenses).
- Vehicles (name, registration, acquired date, initial mileage, rate per mile, notes) and mileage logs (shown when "Record Mileage" is on).

### 4.7 Settings and administration
- Fourteen settings panels: business details (logo, website, tax year end), taxes (collect VAT, MTD services, VAT registrations), messaging, invoicing, online payments, receipts, estimating, features (profit basis, record mileage, first weekday), job and customer defaults, planner (near-today view, weeks before and after, days worked, public holidays, order of add-jobs list, replan from last job or last due date, plan next default, set paid to job price or debt balance, show future jobs, jobs left To Do policy with 1 day to 2 weeks delay), route optimisation, customer data retention (six independent rules with defaults: suspend overdue regular jobs after 3 months, suspend unrequested jobs after 1 year, delete suspended and completed one-offs after 3 months, delete unconverted estimates after 6 months, anonymise deleted customers after 3 months, anonymise invoices after 6 years; all off by default), API, testimonial.
- Users (email, password, name, business, address, phone, role, manager, email login details; adding a user raises the price), roles with 28 permissions in five groups (defaults: new role everything on except debt-collection-only; Franchisee everything except administrator, debt-collection-only, export jobs, edit sales sources; Employee limited to web and mobile access, planner job actions, enter payments, debt list, expenses, time off), switch user, announcements (guides, system updates).
- API: per-account client id and secret with regeneration, per-user personal access tokens with a label, JSON API docs. Password change requiring the current password. Subscription page with plan change and trial banner.

### 4.8 Offline mobile app (secondary priority)
- Standalone PWA: login, sync, home (debts, new job, expenses, mileage), round chooser, due jobs, new jobs, N-day planner, job sheet with totals, job editor (status, price, task, notes, payment, receipt, invoice, location, directions, what3words, plan next), customer editor with address lookup, debts with sort and pay, expenses, mileage.

---

## 5. Domain model

Entities and relationships recovered from the mobile source and the desktop forms.
Money is stored as integer pence; dates as ISO dates; every tenant row carries an
account id.

```
accounts (tenant: business details, year end, locale, currency, tax name, plan, settings)
users (account, email, password hash, role, manager, contact, days worked, planner prefs)
roles (account, name, 28 permission booleans in five groups)
contacts (name parts, company, multiline address, lat/lng + source, geocoding id, phones x3,
          email, email cc, whatsapp numbers, what3words)
customers (account, contact, reference, auto ref, next invoice ref, contact method,
           accepts marketing, payment method, payment frequency, num periods, period unit,
           direct debit amount, next invoice/dd date, invoice thresholds, invoice max period,
           show balance mode, payment terms type + days, notes, starting balance + date,
           gocardless mandate/email; derived: balance, invoiced balance, debt since)
rounds (account, name, user, other income); round_orderings (round, weekday or all, sequence)
tasks (account, name, description, time, price, per-field enabled flags)
sales_source_types, sales_sources
job_specs (customer, job contact, round, round day/index, task, sales source, status e|a|s|d,
           reference, description, notes, price, vat status, time required, allowed days bitmask,
           appointments, confirmed, regularity o|c|r, times per period, num periods, period unit,
           month week-or-day rule, location c|o|n, start date, next due date, last done date,
           recent job, import id, lateness per day)
jobs (job spec, date, due time, status t|d|n|s|e, appointment type e|f|a|m, projected flag,
      price, previous price, permanent price flag, vat status + rate, time required, confirmed,
      notes, custom index, task, payment, send invoice, invoice, invoice email override,
      plan-next fields)
payments (customer, job?, date, paid, tip, method, reference, status pending|cleared, banked,
          receipt number, send receipt, receipt email override)
adjustments (customer, type starting_balance|credit|overpayment|surcharge|discount|tip|bad_debt, amount)
invoices (customer, number, date, due date, status, lines from jobs, totals, vat, sent via,
          printed, emailed, online token); statements, receipts, estimates (generated documents)
expense_categories, expense_suppliers, expenses, recurring_expenses
vehicles, mileages
events (type event|to do, user, start, time, summary, details, linked record)
holidays, holiday_types
messages (account, customer?, channel, reason, status, body, provider ids), message_templates,
message_drafts
price_revisions (+ per-job lines so each job can be reverted from its latest revision)
announcements, activities (audit and activity log)
sales_tax_registrations (periods, scheme, rate, flat rate, capital threshold), vat_returns
integrations (per account: smtp, gmail/outlook oauth, sms account, gocardless, paypal/stripe,
              quickbooks, hmrc)
api_applications, personal_access_tokens
mobile_sync_cursors (per user: last server timestamp, planner window)
```

Key enumerations to preserve semantically: customer payment method (9),
payment frequency (7), payment terms (5 types), job status (5), appointment type
(4), job spec status (4), regularity (3), appointments (3), VAT status for jobs
(5) and expenses (5), expense and payment methods (10), allowed days (7-bit mask),
plan-next modes (6), message reasons (15), adjustment types (7), role
permissions (28).

---

## 6. Business rules the clone must reproduce

Verified in the mobile source, the desktop forms and the help articles.

1. **Due date projection.** A regular job yields a next due date from its last
   done or last due date (configurable), its N-per-period frequency and month
   rule; allowed days constrain the weekday; a lateness-per-day factor colours
   jobs from early (blue) to late (red). Future occurrences are projected as
   read-only jobs on the planner.
2. **Planning.** Adding a job to a day creates a To Do job snapshotting the spec's
   name, price, VAT status, time and confirmation requirement. One job per spec
   per date. A job moved to a disallowed weekday shows as Not Allowed. Marking a
   future-dated job Done sets its date to today.
3. **Completion and payment.** Done opens payment entry; paid defaults to the job
   price or the whole debt balance (setting); the tip is the overpayment, split
   with "inc Tip?"; a negative tip records a bad-debt write-off; refunds are
   negative payments. Balance = previous balance + paid − price − tip (negative
   means owed); debt-since is set when the balance first goes negative. Bad debts
   are adjustments made from the customer page and editable like payments.
4. **Price edits** on a planned job are one-off unless marked permanent, which
   updates the job spec for future jobs.
5. **Jobs left To Do** are, per setting, assumed Not Done, marked Done overnight,
   or kept until the next job is due, after 1 day to 2 weeks.
6. **Plan next** after Done, Skipped or Not Done: none, on a date, in N periods,
   from last done, or from last due; on-request jobs are never auto-planned.
7. **Invoicing.** Invoice customers are invoiced manually, after each job,
   overnight, every N periods, when uninvoiced value or job count reaches a
   threshold, or before each job; direct-debit customers manual or periodic.
   Amount to pay shows the invoice total, invoiced balance or credit balance;
   payment terms derive a due date. Invoice, receipt and estimate numbers are
   per-account sequences with optional per-customer next numbers. Only the job
   description, never its notes, appears on invoices.
8. **Account customers' prices are hidden** from staff unless the role allows it;
   on-day customers' prices are always shown.
9. **VAT.** Prices carry inc, ex, zero-rated, exempt or out-of-scope status;
   gross and net use the account rate at the time of the job; expenses track
   reclaimable VAT with a private-use percentage; registrations define return
   periods and scheme; profit is accrual or cash basis with a configurable year end.
10. **Price revisions** apply a percentage (negative allowed) or fixed change to a
    filtered set of jobs, rounding to the nearest step (default 0.50) and keeping
    the old price when the change is below a minimum (default 1.00); jobs on a
    Task are changed through the task price instead; each job can be reverted
    from its most recent revision.
11. **Recurring expenses** generate due instances on save when overdue, then
    automatically each due date; edits never duplicate or rewrite generated ones.
12. **Data retention** runs the six rules in 4.7 on a schedule.
13. **Roles.** Users see their own rounds; administrators see all; debt-collection
    roles see debts across rounds; permissions gate every mutating action and are
    pushed to clients as flags.
14. **Reports.** Net sales = value of jobs done per month per round; gross income
    = payments with tips itemised and overpayments counted as tips; bad debt =
    jobs done but never paid; profit before tax per month with a yearly total.
15. **Offline sync.** Client-generated ids, per-record changed-attribute
    tracking, one delta sync call carrying all changes and returning changed
    tables plus settings and a planner window; server wins on conflict; deletes
    are never sent from mobile.

---

## 7. Architecture for the clone

### 7.1 Stack (recommended)
- **TypeScript monorepo** with a `domain` package (entity types, enums, money
  and date helpers, recurrence engine, balance arithmetic, permission matrix)
  shared by server, web app and offline client. Aworka's weakest point is three
  divergent copies of these rules (Rails, two jQuery stacks, Backbone).
- **Server**: Node (Fastify or NestJS), PostgreSQL 16, Drizzle ORM and
  migrations, pg-boss or BullMQ for background jobs (invoice runs, overnight
  auto-mark, retention, route optimisation, message delivery, HMRC submissions,
  recurring expenses), S3-compatible storage for logos, PDFs and exports.
- **Web app**: Next.js or Remix with React; server-rendered lists and forms,
  client components for the planner grid, drag-and-drop and popups; print routes
  rendered to PDF with Playwright.
- **Mobile**: a React PWA sharing the domain package, Dexie (IndexedDB), service
  worker, sync client. Ship after the web app with the same feature set as
  Aworka's mobile app; add store wrappers (Capacitor) later for presence.
- **Alternative**: Rails 8 with Hotwire reaches web parity fastest and mirrors
  the original, but forces a second implementation of the rules for offline
  mobile. Choose it only if the team is Rails-native and offline is deferred.

### 7.2 Multi-tenancy, auth and roles
- `account_id` on every table with row-level security or a mandatory scope.
  Franchise structures are a manager relationship inside the account, as Aworka
  does, not nested tenants.
- Email and password (argon2id), password-change notifications, 2-hour reset
  tokens, optional TOTP (an improvement), web session cookies, short-lived bearer
  tokens for mobile sync and API, labelled personal access tokens, per-account
  client id and secret.
- A 28-flag permission matrix per role evaluated server-side on every mutation and
  sent to clients as effective flags.

### 7.3 Scheduling engine
- Pure functions in the domain package: next due date, allowed-day check,
  occurrence projection for a window, lateness, plan-next application, auto-mark
  policy. Materialise planned jobs; project future occurrences on read and cache
  per user and window. Nightly job recomputes due dates, applies auto-mark,
  suspensions and retention, generates recurring expenses, and runs invoice checks.
- Build the engine from fixtures: populate the Aworka test account with jobs at
  each frequency and record the planner output before coding.

### 7.4 Documents and messaging
- One pipeline for invoices, statements, receipts, estimates and job sheets: HTML
  template → PDF → object storage → delivery by email with an online-view token
  link and/or attachment, print, or paper. Message records carry channel, reason,
  provider id and status updated by webhooks.
- Email adapters: platform transactional sender (SES at $0.10 per thousand, or
  Postmark or Resend) with SPF, DKIM and DMARC; generic SMTP with a test probe and
  send throttle; Gmail through the Gmail API with the `gmail.send` scope (a
  Google "sensitive" scope needing brand verification, a demo video and a privacy
  policy on a verified domain; unverified apps are capped at 100 users); Microsoft
  Graph `sendMail` with `Mail.Send` (publisher verification through the Microsoft
  partner programme, free; Exchange limits of 30 messages per minute).
- SMS adapters behind one interface (`send`, `credits`, `senders`, `details`,
  `charCount`) with a per-message credit guard: Webex Interact (`X-AUTH-KEY`,
  about 4p per message pay-as-you-go), Text Global (docs require an account),
  Esendex (`X-Api-Key`, from about 5p on plans), httpSMS (tenant's own Android
  phone). UK alphanumeric sender IDs must be pre-registered, which takes two to
  three weeks. Templates per purpose with merge fields.

### 7.5 Payments
- **GoCardless** as a partner app: OAuth connect with prefilled merchant details,
  permanent per-merchant access tokens, hosted Billing Request Flow for mandates,
  payments created from invoices or on job completion, one webhook endpoint for
  all merchants (HMAC-signed), statuses from pending submission through confirmed
  to paid out, fees derived from payout items and booked to an expense category,
  handling of mandate cancellation and disconnection. Standard fees 1% plus 20p
  capped at £4; partner apps may add an app fee. GoCardless technical
  certification is required before going live; budget several weeks.
- **Stripe** for card payments and payment links on invoices and in the portal
  (Aworka has none; competitors treat it as standard).
- **PayPal** as optional: either the Multiparty partner model (approval weeks) or
  a pasted PayPal.Me link with manual reconciliation. Do not copy the retiring
  email-address "Buy Now" model.
- Payment statuses pending and cleared, banked flag, refunds and bad debts as
  adjustments.

### 7.6 Maps, addresses, routes
- Mapbox GL for map rendering (50k free loads per month). Geocoding must respect
  licence terms: Mapbox temporary geocodes cannot be stored (permanent tier $5 per
  thousand), Google geocodes cannot be shown on a non-Google map. Store only the
  user-selected address and its coordinates.
- UK address autocomplete through Ideal Postcodes (free find, about 3p to 4.5p per
  resolved address, UPRN and rooftop coordinates included) or Loqate; postcodes.io
  as a free coarse fallback; what3words on a paid plan for conversions.
- Route optimisation as an async job with status polling: Mapbox Optimization v2
  (beta, up to 1,000 stops) or Google Routes waypoint ordering, or a self-hosted
  OSRM plus VROOM solver to avoid per-request cost. Start and finish at the user's
  address or the furthest job; optional overnight run.

### 7.7 Tax and accounting
- **HMRC fraud-prevention headers** (16 headers for a web app via server) are a
  legal requirement and are validated before production approval; build this
  module once and early.
- **VAT MTD**: obligations, submit return (nine boxes), liabilities and payments;
  the software computes flat-rate, cash-accounting and annual schemes itself.
  Production approval takes about 10 working days after sandbox testing plus
  questionnaires; a live submission is needed for the GOV.UK listing.
- **Income Tax MTD**: business details, open obligations, cumulative quarterly
  summaries (from 2025-26, replacing year-to-date figures; consolidated or
  itemised expenses, not mixed), in-year calculation trigger and retrieval, annual
  submission, HMRC category mapping for expenses. **HMRC is not accepting
  production credential requests for new 2026-27 quarterly-update products.**
  Confirm the 2027-28 window with HMRC's software developer support before
  committing dates; build against the sandbox meanwhile.
- **QuickBooks Online**: OAuth2 with hourly access tokens and rotating 100-day
  refresh tokens, UK sandbox companies, per-line VAT codes; push customers,
  invoices, payments and expenses; Intuit app review if listed.
- **Public JSON API** with personal access tokens and generated docs; CSV import
  from Aworka, George, Cleaner Planner and generic sheets; full export.

### 7.8 Offline sync design (mobile)
- UUID client ids; `updated_at` and a monotonic `version` per row; the sync
  request carries the last server cursor and changed records with changed
  attributes; the response returns rows changed since the cursor plus settings
  and permission flags; server wins on conflicting attributes with an audit entry;
  pending changes survive failed syncs; reset wipes local data. Scope the client
  dataset to the user's rounds and a planner window.

### 7.9 Non-functional
- UK residency (AWS eu-west-2 or DigitalOcean London), daily encrypted backups
  with one-year retention and restore drills, TLS everywhere, audit log of
  mutations, GDPR processor terms and sub-processor list, export and deletion,
  retention automation.
- Observability (structured logs, error tracking, queue dashboards); domain-rule
  tests (recurrence, balances, VAT, invoicing triggers, price revisions) as the
  primary suite; end-to-end tests for planner and invoice flows; print and
  accessibility checks.
- Subscription billing with Stripe Billing: tiers, per-user pricing, 6-week
  no-card trial, suspension on non-payment with data kept 1 or 3 months.

---

## 8. Integration effort and lead times

Developer-days are estimates for one experienced developer; lead times are the
external queues to start in Phase 0.

| Integration | Dev-days | External lead time or blocker |
|---|---|---|
| Transactional email, SMTP, SPF/DKIM/DMARC, bounce webhooks | 3-5 | SES production access about 4 days |
| Gmail API and Microsoft Graph sending | 6-8 | Google sensitive-scope verification 2-8 weeks; Microsoft publisher verification days |
| SMS adapters (Webex Interact, Text Global, Esendex, httpSMS) | 5-8 | Sender ID registration 2-3 weeks; Text Global account for docs |
| GoCardless partner connect, mandates, payments, webhooks, fees | 8-12 (+2-3 subscriptions) | Partner programme and technical certification, weeks |
| Stripe cards, payment links, webhooks | 4-6 | None material |
| PayPal (link paste / Multiparty) | 1-2 / 12-18 | Partner approval, weeks (Multiparty) |
| Maps, geocoding, address lookup, what3words | 8-19 | Mapbox Optimization v2 beta access |
| HMRC fraud-prevention header module | 3-5 | None |
| HMRC VAT MTD | 10-15 | About 10 working days review plus questionnaires and live submission |
| HMRC Income Tax MTD quarterly updates | 20-35 | Production window closed for 2026-27; 2027-28 to confirm |
| QuickBooks Online sync | 10-15 | Intuit review if listed; metering for non-US apps announced |
| Public API, tokens, docs | 5-8 | None |

---

## 9. Delivery roadmap

One senior full-stack developer plus AI tooling, a second developer from Phase 2.
Weeks are calendar weeks.

### Phase 0: foundations (weeks 1-2)
Repo, CI, schema for accounts, users, roles, contacts, customers, rounds, tasks,
job specs, jobs, payments, adjustments; auth; settings pages; design system and
app shell (navigation mirrors sections, not Aworka's markup); domain package with
money, dates, recurrence, balances and permissions with unit tests. **Apply for:**
GoCardless partner app and sandbox, Stripe account, HMRC developer hub sandbox
apps (VAT and ITSA), Google OAuth consent screen verification, Microsoft partner
account, an SMS provider account and sender ID, Ideal Postcodes or Loqate, Mapbox,
SES production access. Populate the Aworka test account with sample data and
record planner, invoice and report fixtures.

### Phase 1: single-user core, "Simple" parity (weeks 3-8)
Customer and job form; jobs list with search and bulk actions; rounds and round
ordering; tasks; planner month and week with add-jobs popup, drag-and-drop,
nudge, day notes and totals; job popup with status, price (permanent flag),
payment and plan-next; job sheets with filters and print; debts and aged debts
with statements; invoices, receipts, estimates as PDFs with platform email and
online view; expenses, categories, suppliers; activity log; profit and loss and
monthly summary; price revisions; anonymise customer; events and time off;
message templates and single-customer email and SMS through one provider; CSV
import and export. Exit criterion: a window cleaner runs a week of work end to
end, invoices an account customer and chases a debt.

### Phase 2: automation, payments and mobile, "Smart" parity plus (weeks 9-16)
Automatic invoice runs and thresholds; overnight auto-mark, retention and
recurring-expense jobs; mass messaging and drafts; advanced filters; mapping,
geocoding, address lookup, job map; mileage; sales sources and customer
retention; valuation and income forecast; GoCardless; **Stripe cards and payment
links; customer portal (invoices, pay, confirm appointment)**; Gmail, Outlook and
SMTP sending; offline mobile PWA with sync; imports from Cleaner Planner, Squeegee,
Aworka and George.

### Phase 3: teams, VAT, routes, API, "Team" parity (weeks 17-22)
Users, roles matrix, round assignments, switch user, per-user job sheets and
planner filters; route optimisation; VAT registrations, VAT return and MTD VAT
submission (approval clock started in Phase 2); public API with tokens and docs;
QuickBooks sync; announcements; subscription billing and plan gating; store
wrappers for the mobile app.

### Phase 4: tax and launch (weeks 23-28)
Income Tax MTD against the sandbox (quarterly updates with category mapping,
calculations, annual submission), production credentials when HMRC reopens the
window; marketing site with public pricing and a migration concierge offer; load,
security and backup-restore testing; launch.

Later candidates: two-way SMS with YES/NO handling, Open Banking payment matching,
WhatsApp messaging, job photos and GPS evidence, team location sharing, quoting
with photos, web lead capture.

---

## 10. Risks and open questions

- **Recurrence semantics** for month rules, multiple occurrences per period,
  plan-next "in" and "from" modes, and lateness are not visible in the captured
  code. Mitigation: fixtures from the populated test account before building.
- **HMRC Income Tax window**: confirm with software developer support whether a
  new product can apply for 2027-28 and whether an end-of-year product is
  accepted now.
- **Approval queues** gate Gmail, Outlook, GoCardless, HMRC and QuickBooks; all
  start in Phase 0 and run in parallel with development.
- **Licensing**: PAF and AddressBase data, Mapbox temporary geocodes and Google
  map content each restrict storage and display; design geocoding storage around
  them from the start.
- **Scope creep**: the settings page alone has over 100 fields. Hold Phase 1 to
  the Simple plan and defer Smart and Team items.
- **Legal**: clean-room implementation only; no reuse of Aworka copy, help text,
  markup, styles, images or name; choose a distinct product name and brand.
- **Unverified screens**: populated list tables, the planner job and add-jobs
  popups, the customer overview page, invoice edit and email forms, the message
  draft editor, the MTD and GoCardless pages, and the public API docs were not
  captured because the test account was blank. Next capture after adding sample
  data will cover them.
- **Open decisions**: launch tiers and prices; whether franchise per-seat billing
  is needed at launch; SMS and address providers to contract; PayPal model
  (link paste versus partner API).
- **Decided (20 Oct 2026)**: greenfield build in this repository, not an
  extension of the existing round-manager codebase. Stack as recommended in 7.1.

---

## 11. Changes from v1

- Added market and positioning (section 3) with competitor pricing, table
  stakes, differentiators and a pricing recommendation.
- Corrected the integration picture: SMS providers are Text Global, Webex
  Interact, Esendex and httpSMS (Textlocal closed July 2026); Gmail uses the
  Gmail API `gmail.send` scope; Outlook uses Graph `Mail.Send`; GoCardless is a
  partner OAuth connect; PayPal is email-based and that model is being retired;
  Aworka holds production HMRC credentials for VAT and Income Tax; QuickBooks is
  not live; maps use Mapbox GL; getAddress.io has closed.
- Added the HMRC Income Tax production-window closure and moved that feature to
  "when HMRC reopens"; added the fraud-prevention header module.
- Added Stripe card payments and a customer portal to Phase 2 as market table
  stakes; added store wrappers and imports from competitors.
- Expanded the feature inventory and business rules with the desktop capture:
  job chip states, job popup fields, job sheet URL and filters, activity and
  adjustment types, report definitions, data-retention defaults, role presets,
  dashboard widgets, message merge tags (portal and direct-debit links).
- Added the integration effort and lead-time table (section 8) and Phase 0
  application list.

---

## Appendix A: evidence index

- `research/aworka/SITEMAP.md`: every captured desktop page, its routes, forms and
  fields, plus URL patterns seen in the app JavaScript for actions the crawler did
  not call (planner moves, job sheet marking, bulk edits, HMRC endpoints, API).
- `research/aworka/pages.json`, `research/aworka/html/`, `research/aworka/screens/`:
  raw capture (blank test account, Team trial).
- `research/tools/`: the GET-only crawler and screenshot scripts used.
- Offline mobile app analysis: derived from the public `/new_mobile/javascripts/*.js`
  sources; summarised in sections 5, 6 and 7.8.
- Public pages: aworka.com home, /for/window_cleaning, /tour, /security,
  /mtd_income_tax, /privacy, /terms; aworka.app login, signup, contact, mobile.

## Appendix B: detailed research reports

Five detailed reports were produced during research and can be added under
`research/aworka/analysis/` on request: desktop functional spec (operations),
desktop functional spec (finance and settings), product manual and rules
extracted from help articles, competitive landscape with source URLs, and
third-party integration facts with source URLs. Their conclusions are folded into
this document.
