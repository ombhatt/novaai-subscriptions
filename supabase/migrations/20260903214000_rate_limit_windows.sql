-- Per-user UTC-minute request windows. consume_rate_limit is atomic and
-- service-role only so clients cannot reset or inflate their own counters.

create table public.rate_limit_windows (
  user_id uuid references public.profiles(id) on delete cascade not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  unique (user_id, window_start)
);

create index rate_limit_windows_user_window_idx
  on public.rate_limit_windows (user_id, window_start);

alter table public.rate_limit_windows enable row level security;

create policy "Users can view own rate limit window"
  on public.rate_limit_windows for select
  using (auth.uid() = user_id);

grant select on public.rate_limit_windows to authenticated;

create or replace function public.consume_rate_limit(p_user_id uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', (now() at time zone 'utc')) at time zone 'utc';
  v_count integer;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be a positive integer';
  end if;

  insert into public.rate_limit_windows (user_id, window_start, request_count)
  values (p_user_id, v_window, 1)
  on conflict (user_id, window_start)
  do update set request_count = public.rate_limit_windows.request_count + 1
  where public.rate_limit_windows.request_count < p_limit
  returning request_count into v_count;

  return v_count;
end;
$$;

revoke all on function public.consume_rate_limit(uuid, integer) from public;
revoke all on function public.consume_rate_limit(uuid, integer) from anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, integer) to service_role;
