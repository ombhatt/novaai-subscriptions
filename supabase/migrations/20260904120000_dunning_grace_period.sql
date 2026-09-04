-- 7-day dunning grace after payment failure. Null means no grace (legacy past_due stays blocked).

alter table public.subscriptions
  add column grace_period_ends_at timestamptz;

create index subscriptions_dunning_grace_idx
  on public.subscriptions (status, grace_period_ends_at)
  where status = 'past_due';
