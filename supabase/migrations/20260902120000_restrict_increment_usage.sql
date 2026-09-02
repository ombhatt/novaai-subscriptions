-- increment_usage is SECURITY DEFINER and must not be callable by end users.
revoke all on function public.increment_usage(uuid) from public;
revoke all on function public.increment_usage(uuid) from anon, authenticated;
grant execute on function public.increment_usage(uuid) to service_role;
