-- Expired windows are no longer useful after the UTC minute changes. Prune
-- them per user while consuming the current window so this table cannot grow
-- indefinitely for active users.
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

  delete from public.rate_limit_windows
  where user_id = p_user_id
    and window_start < v_window;

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
