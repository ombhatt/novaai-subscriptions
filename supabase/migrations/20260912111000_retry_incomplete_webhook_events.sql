-- An event is only complete after its side effects succeed. Keeping failed claims
-- nullable lets Stripe retries resume even if the compensating delete also failed.
alter table public.stripe_webhook_events
  alter column processed_at drop not null,
  alter column processed_at drop default;
