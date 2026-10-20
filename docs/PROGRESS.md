# Build progress

Goal: deliver everything in [PLAN.md](PLAN.md) until the product is a working
equivalent of Aworka. Items that need third-party accounts are built against
sandboxes or with adapters and are marked as such.

Implementation choice: the server and web UI are one Next.js app (`apps/web`)
using server actions and route handlers, sharing `packages/domain`. The offline
mobile PWA is served from the same app at `/m`.

Status: 148 automated tests (domain rules plus services against real Postgres),
production build passing, Playwright smoke tests for desktop and mobile flows.

## Phase 0: foundations
- [x] pnpm monorepo, TypeScript, domain package with tests
- [x] Postgres schema and migrations (Drizzle)
- [x] Auth: signup with trial, login, sessions, roles with presets
- [x] App shell and navigation; CI workflow (GitHub Actions with Postgres)

## Phase 1: Simple parity
- [x] Customers and jobs: combined new-customer form, list with filters, customer page, edit, suspend, delete, anonymise
- [x] Planner: month grid with drag and drop and projected jobs, day view, add due jobs, job completion with tips, price changes, plan next
- [x] Job sheets with filters, day notes, print and email
- [x] Debts, aged debts, statements, write-offs and adjustments
- [x] Invoices with numbering, payment terms, online view link, print
- [x] Expenses, categories, suppliers
- [x] Reports: dashboard, activity, profit and loss (cash/accrual, by month/round), CSV export
- [x] Rounds, round ordering, tasks, price revisions (apply and revert), sales sources
- [x] Events, time off, message templates with merge tags, email and SMS sending
- [x] Settings; CSV import and export

## Phase 2: Smart parity plus
- [x] Nightly jobs: auto-mark, invoicing, retention, recurring expenses, geocoding, message delivery, QuickBooks
- [x] Mass messaging drafts with contact rules
- [x] Maps and geocoding (postcodes.io default, Mapbox optional); job map
- [x] Mileage, recurring expenses, sales sources, retention report, valuation, income forecast
- [x] GoCardless partner connect, mandates, collection, webhooks (sandbox); Stripe card payments; customer portal
- [x] Email via SMTP; SMS via Webex Interact, Esendex, httpSMS
- [x] Offline mobile PWA with sync, idempotent changes and service worker
- [x] Per-account email sending: own SMTP (test, throttle), Gmail API and Microsoft Graph via OAuth (live use needs Google/Microsoft app verification)
- [x] Address finder on customer forms: Ideal Postcodes (IDEAL_POSTCODES_KEY, paid) with postcodes.io area-only fallback

## Phase 3: Team parity
- [x] Users, roles with 28 permissions, round assignments
- [x] Route optimisation for a day (built-in solver)
- [x] VAT returns (standard, cash accounting, flat rate) and MTD VAT submission (sandbox)
- [x] Public API with personal access tokens
- [x] QuickBooks Online sync (sandbox)
- [x] Plans, feature gating, trial, Stripe Billing for subscriptions

## Phase 4: Tax and launch
- [x] MTD Income Tax quarterly cumulative updates (sandbox; production pending HMRC window)
- [x] Marketing page with public pricing
- [x] Deployment configuration (Docker, compose, env template, guide); load check at 1,500 customers; security review with fixes
- [ ] Restore drill on the production database (needs hosting)
- [ ] Production credentials: HMRC, GoCardless, Stripe platform, SMS provider (owner action)
