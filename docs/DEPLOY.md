# Deploying

## What runs
- **App**: one Next.js server (`apps/web`) serving the web app, the offline phone app at `/m`, public invoice and portal pages, the REST API and webhooks.
- **Postgres 16**: all data. Migrations run automatically when the container starts.
- **Scheduler**: anything that can POST on a timer, with header `x-cron-secret: $CRON_SECRET`:
  - every 5 minutes: `POST /api/cron/deliver` (sends queued emails and texts)
  - nightly, around 02:00 UK time: `POST /api/cron/nightly` (auto-marks stale jobs, automatic invoicing and Direct Debit collection, recurring expenses, data retention, geocoding, QuickBooks sync, then delivery)

## Quick start with Docker
```
cp .env.example .env    # fill in APP_URL, APP_SECRET, CRON_SECRET at minimum
docker compose up --build
```

## Hosting recommendation (UK data residency)
- App: a container on DigitalOcean App Platform (London) or AWS ECS/Fargate in eu-west-2.
- Database: managed Postgres in the same region with daily backups kept 365 days and point-in-time recovery; test a restore every quarter.
- Put the app behind HTTPS (the app sets HSTS and other security headers).
- Keep `APP_SECRET` stable: it encrypts stored third-party credentials. Rotating it means reconnecting integrations.

## Webhook URLs to register
| Provider | URL |
|---|---|
| GoCardless (partner app) | `$APP_URL/api/webhooks/gocardless` |
| Stripe (each business, shown on /integrations/stripe) | `$APP_URL/api/webhooks/stripe/<accountId>` |
| Stripe (platform subscriptions) | `$APP_URL/api/webhooks/billing` |

## OAuth redirect URLs to register
| Provider | Redirect |
|---|---|
| GoCardless | `$APP_URL/api/gocardless/callback` |
| HMRC | `$APP_URL/api/hmrc/callback` |
| QuickBooks | `$APP_URL/api/quickbooks/callback` |
| Google (Gmail) | `$APP_URL/api/email/google/callback` |
| Microsoft (Outlook) | `$APP_URL/api/email/microsoft/callback` |

## Approvals that only the business owner can start
- HMRC Developer Hub production credentials for VAT (10 working days review) and Income Tax (window currently closed for new 2026-27 products).
- GoCardless partner technical certification.
- Google OAuth verification for the `gmail.send` scope; Microsoft publisher verification.
- UK SMS sender ID registration with the chosen provider.
- Stripe platform account for subscriptions.
