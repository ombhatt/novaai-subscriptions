-- Annual prices are a billing interval on the same Plus or Pro tier.
-- Pending columns record a change that waits until the current period ends.
alter table public.subscriptions
  add column billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year')),
  add column pending_tier public.subscription_tier,
  add column pending_billing_interval text
    check (pending_billing_interval in ('month', 'year'));
