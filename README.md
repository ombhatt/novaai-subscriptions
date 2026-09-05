# NovaAI Subscription MVP

Subscription management service for an AI company with three fixed-price tiers: **Free**, **Plus**, and **Pro**. Built with **Supabase** (auth, Postgres, Edge Functions) and **Stripe** (billing).

## Stack (Option C)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, TypeScript, Tailwind, shadcn/ui |
| Auth & database | Supabase (Postgres + Auth + RLS) |
| Payments | Stripe Checkout + Customer Portal |
| Webhooks | Supabase Edge Function (`stripe-webhook`) + Next.js fallback route |
| Entitlements | Postgres usage counters + tier limits |

## Tier matrix

| Tier | Price | Requests/mo | Rate limit | Models |
|------|-------|-------------|------------|--------|
| Free | $0 | 1,000 | 10/min | basic |
| Plus | $20 | 50,000 | 100/min | basic, standard |
| Pro | $99 | 500,000 | 1,000/min | all + priority |

## Quick start

### 1. Clone and install

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Run the migration in `supabase/migrations/20240831000000_initial_schema.sql` via the SQL editor (or use the Supabase CLI: `supabase db push`).
3. Copy your project URL and keys from **Settings → API**.

### 3. Configure Stripe

1. Create a [Stripe](https://stripe.com) account (test mode is fine).
2. Run the setup script to create products/prices and a sample `WELCOME20` promo code (20% off the first invoice):

```bash
node scripts/stripe-setup.mjs
```

The script reads `.env.local`. If `STRIPE_PRICE_PLUS` / `STRIPE_PRICE_PRO` are already set, it leaves those prices alone and only creates the promo code. On a first run it prints new price IDs to copy into `.env.local`.

Create more coupons and promotion codes in Stripe Dashboard → Product catalog → Coupons. Customers enter the customer-facing code on `/pricing` (or open `/pricing?promo=WELCOME20`). Invalid codes stay on the pricing page; Stripe Checkout shows the discounted total.

Signup from pricing still lands on the dashboard and does not start checkout. After signing in, return to `/pricing` (or a `?promo=` campaign URL) to apply a code.

3. Enable the **Customer Portal** in Stripe Dashboard → Settings → Billing → Customer portal.
4. Under **Settings → Billing → Manage failed payments**, retry failed invoices over about 7 days, then **cancel the subscription**. Stripe retries the card; this app keeps paid access for 7 days from the first failure, then a cron job cancels if the invoice is still unpaid.
5. Create a webhook endpoint pointing to your Supabase Edge Function URL:
   - Production: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Local dev fallback: `http://localhost:43123/api/webhooks/stripe` (use Stripe CLI)

   Subscribe to: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

### 5. Deploy the Edge Function (production webhooks)

```bash
supabase functions deploy stripe-webhook \
  --no-verify-jwt \
  --set-env-vars STRIPE_SECRET_KEY=sk_...,STRIPE_WEBHOOK_SECRET=whsec_...,STRIPE_PRICE_PLUS=price_...,STRIPE_PRICE_PRO=price_...
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase when deployed.

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:43123](http://localhost:43123).

## Project structure

```
src/
  app/
    api/
      checkout/       # Stripe Checkout session
      portal/         # Stripe Customer Portal
      subscription/   # Current plan + usage
      chat/           # Mock AI endpoint with entitlement checks
      cron/dunning    # Cancel past_due subs after the 7-day grace
      webhooks/stripe # Local webhook fallback
    dashboard/        # Usage + billing UI
    pricing/          # Tier selection
  lib/
    tiers.ts          # Tier limits and pricing
    entitlements.ts   # Access control logic
    dunning.ts        # 7-day past_due grace window
    stripe-webhook-handler.ts
supabase/
  migrations/         # Postgres schema
  functions/stripe-webhook/  # Production webhook handler
```

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/subscription` | GET | Current tier, status, and usage |
| `/api/checkout` | POST | Create Stripe Checkout (`{ tier: "plus" \| "pro", promoCode?: string }`) |
| `/api/portal` | POST | Open Stripe billing portal |
| `/api/chat` | POST | Mock AI request with entitlement enforcement |
| `/api/cron/dunning` | GET/POST | Cancel Stripe subscriptions whose 7-day grace has elapsed (`Authorization: Bearer $CRON_SECRET`) |

## Tests

Unit tests cover tier/entitlement logic, Stripe webhook handling, API routes, middleware, and key UI components (Vitest + Testing Library):

```bash
npm test
```

CI runs `npm run test:coverage` and fails the PR if lines, statements, branches, or functions drop below **80%** of `src/` (excluding test files). Locally:

```bash
npm run test:coverage
```

### Database tests (trigger, RLS, increment_usage)

These Vitest cases talk to the configured Supabase project (same keys as `.env.local`). They are skipped when those keys are missing.

Apply migrations first (`supabase db push`, or run the SQL in the dashboard), including `supabase/migrations/20260902120000_restrict_increment_usage.sql`, `supabase/migrations/20260903140000_increment_usage_period_start.sql`, and `supabase/migrations/20260904120000_dunning_grace_period.sql`.

```bash
npm run test:db
```

### End-to-end tests (Playwright)

```bash
npx playwright install chromium
npm run test:e2e
```

Requires the same `.env.local` as local development (Supabase URL and keys). Email confirmations must be **disabled** on the project used for E2E — local [`supabase/config.toml`](supabase/config.toml) already sets `enable_confirmations = false`.

The default suite hits real Supabase Auth and mocks Stripe at `/api/checkout` and `/api/portal` (no hosted Checkout). Interactive mode:

```bash
npm run test:e2e:ui
```

To run the optional real Stripe Checkout spec (test card `4242…`), keep Stripe test keys in `.env.local`, forward webhooks, then:

```bash
stripe listen --forward-to localhost:43123/api/webhooks/stripe
npm run test:e2e:stripe
```

Use a dedicated Supabase project for E2E, not production. Each run creates unique users; there is no automatic cleanup.

## Local Stripe webhooks

```bash
stripe listen --forward-to localhost:43123/api/webhooks/stripe
```

Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

To test a failed renewal, use Stripe test card `4000 0000 0000 0341`. The first `invoice.payment_failed` starts a 7-day grace window; the dashboard shows a warning and the API keeps Plus/Pro access until that deadline.

## Dunning cron

After grace expires, cancel leftover `past_due` subscriptions:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:43123/api/cron/dunning
```

On Vercel, [`vercel.json`](vercel.json) schedules `GET /api/cron/dunning` daily at 14:00 UTC. Set `CRON_SECRET` in the project env; Vercel sends it as `Authorization: Bearer $CRON_SECRET`.

## What ships in this MVP

- Sign up / sign in (Supabase Auth)
- Auto-created Free subscription on registration
- Pricing page with Stripe Checkout for Plus/Pro and optional promo codes
- Dashboard with usage meter and billing portal link
- Webhook sync (idempotent) for subscription lifecycle
- 7-day dunning grace after payment failure, then cancel and drop to Free
- Entitlement checks on API requests (limits + past_due after grace)

## Next steps

- Annual billing (add Stripe prices)
- Team/seat-based plans
- Rate limiting with Redis
- Usage overage billing
