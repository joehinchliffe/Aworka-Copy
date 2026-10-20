# Build progress

Goal: deliver everything in [PLAN.md](PLAN.md) until the product is a working
equivalent of Aworka. Items blocked on external approvals are built against
sandboxes or adapters and marked as such.

Implementation choice: the server and web UI are one Next.js app (`apps/web`)
using server actions and route handlers, sharing `packages/domain`. The mobile
PWA is served from the same app.

## Phase 0: foundations
- [x] pnpm monorepo, TypeScript, domain package with tests
- [x] Postgres schema and migrations (Drizzle)
- [x] Auth: signup with trial, login, sessions, roles with presets
- [x] Core services: ledger, customers and jobs, planning, job completion, invoicing, message queue
- [ ] App shell and navigation
- [ ] CI workflow

## Phase 1: Simple parity
- [ ] Customers and jobs UI (new customer form, list, customer page)
- [ ] Planner UI (month/week, add jobs, drag and drop, job popup)
- [ ] Job sheets with filters and print
- [ ] Debts, aged debts, statements
- [ ] Invoices, receipts, estimates, online view, print
- [ ] Expenses, categories, suppliers
- [ ] Reports: activity, P&L, monthly summary
- [ ] Rounds, round ordering, tasks, price revisions
- [ ] Events, time off, message templates, email/SMS send
- [ ] Settings, CSV import and export

## Phase 2: Smart parity plus
- [ ] Nightly jobs (auto-mark, invoicing, retention, recurring expenses)
- [ ] Mass messaging, drafts; advanced filters; bulk edit
- [ ] Maps, geocoding, address lookup
- [ ] Mileage, sales sources, retention report, valuation, income forecast
- [ ] GoCardless (sandbox), Stripe, customer portal
- [ ] Email adapters (SMTP, Gmail, Outlook), SMS adapters
- [ ] Offline mobile PWA with sync

## Phase 3: Team parity
- [ ] Users, roles UI, round assignments, switch user
- [ ] Route optimisation
- [ ] VAT registrations, VAT return, MTD VAT (sandbox)
- [ ] Public API with tokens; QuickBooks (sandbox)
- [ ] Subscription billing and plan gating

## Phase 4: Tax and launch
- [ ] MTD Income Tax (sandbox; production pending HMRC window)
- [ ] Marketing site with public pricing
- [ ] Load, security and restore testing
