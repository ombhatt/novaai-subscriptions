-- Subscription management schema for AI company MVP

create type public.subscription_tier as enum ('free', 'plus', 'pro');
create type public.subscription_status as enum (
  'active',
  'past_due',
  'canceled',
  'trialing',
  'incomplete'
);

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  tier public.subscription_tier not null default 'free',
  status public.subscription_status not null default 'active',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  period_start date not null,
  request_count integer not null default 0,
  unique (user_id, period_start)
);

create table public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index subscriptions_stripe_customer_id_idx on public.subscriptions (stripe_customer_id);
create index usage_counters_user_period_idx on public.usage_counters (user_id, period_start);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can view own usage"
  on public.usage_counters for select
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  insert into public.subscriptions (user_id, tier, status)
  values (new.id, 'free', 'active');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.increment_usage(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_count integer;
begin
  insert into public.usage_counters (user_id, period_start, request_count)
  values (p_user_id, v_period, 1)
  on conflict (user_id, period_start)
  do update set request_count = public.usage_counters.request_count + 1
  returning request_count into v_count;

  return v_count;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.usage_counters to authenticated;
