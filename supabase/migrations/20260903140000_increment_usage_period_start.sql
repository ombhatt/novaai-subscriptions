-- Key usage counters by the caller-supplied billing period (Stripe period or calendar month).
drop function if exists public.increment_usage(uuid);

create or replace function public.increment_usage(p_user_id uuid, p_period_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.usage_counters (user_id, period_start, request_count)
  values (p_user_id, p_period_start, 1)
  on conflict (user_id, period_start)
  do update set request_count = public.usage_counters.request_count + 1
  returning request_count into v_count;

  return v_count;
end;
$$;

revoke all on function public.increment_usage(uuid, date) from public;
revoke all on function public.increment_usage(uuid, date) from anon, authenticated;
grant execute on function public.increment_usage(uuid, date) to service_role;
