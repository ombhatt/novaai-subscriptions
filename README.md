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
2. Run the setup script to create products/prices:

```bash
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
```

3. Enable the **Customer Portal** in Stripe Dashboard → Settings → Billing → Customer portal.
4. Create a webhook endpoint pointing to your Supabase Edge Function URL:
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
      webhooks/stripe # Local webhook fallback
    dashboard/        # Usage + billing UI
    pricing/          # Tier selection
  lib/
    tiers.ts          # Tier limits and pricing
    entitlements.ts   # Access control logic
    stripe-webhook-handler.ts
supabase/
  migrations/         # Postgres schema
  functions/stripe-webhook/  # Production webhook handler
```

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/subscription` | GET | Current tier, status, and usage |
| `/api/checkout` | POST | Create Stripe Checkout (`{ tier: "plus" \| "pro" }`) |
| `/api/portal` | POST | Open Stripe billing portal |
| `/api/chat` | POST | Mock AI request with entitlement enforcement |

## Tests

Unit tests cover tier/entitlement logic, Stripe webhook handling, API routes, middleware, and key UI components (Vitest + Testing Library):

```bash
npm test
```

### Database tests (trigger, RLS, increment_usage)

These Vitest cases talk to the configured Supabase project (same keys as `.env.local`). They are skipped when those keys are missing.

Apply migrations first (`supabase db push`, or run the SQL in the dashboard), including `supabase/migrations/20260902120000_restrict_increment_usage.sql` and `supabase/migrations/20260903140000_increment_usage_period_start.sql` so `increment_usage(user_id, period_start)` is only executable by the service role.

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

## What ships in this MVP

- Sign up / sign in (Supabase Auth)
- Auto-created Free subscription on registration
- Pricing page with Stripe Checkout for Plus/Pro
- Dashboard with usage meter and billing portal link
- Webhook sync (idempotent) for subscription lifecycle
- Entitlement checks on API requests (limits + past_due blocking)

## Next steps

- Annual billing (add Stripe prices)
- Team/seat-based plans
- Rate limiting with Redis
- Usage overage billing
- Email notifications on payment failure
