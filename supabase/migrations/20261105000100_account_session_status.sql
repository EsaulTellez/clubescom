create or replace function public.get_my_account_status()
returns table (is_active boolean, banned boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.is_active, u.banned
    from public.users u
   where u.id = (select auth.uid());
$$;

revoke all on function public.get_my_account_status() from public, anon;
grant execute on function public.get_my_account_status() to authenticated;
