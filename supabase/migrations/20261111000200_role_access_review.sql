-- A club assignment only grants publishing while the account has the intended role.
create or replace function private.can_publish_club(p_club_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_actor() and exists (
    select 1 from public.clubs c join public.users u on u.id = (select auth.uid())
    where c.id = p_club_id and c.active
      and ((c.leader_id = u.id and u.role = 'alumno') or (c.advisor_id = u.id and u.role = 'profesor'))
  );
$$;

-- The UI already restricts cubicle registration to professors; enforce it for direct API access too.
drop policy cubicles_professor_insert on public.cubicles;
drop policy cubicles_professor_update on public.cubicles;
drop policy cubicles_professor_delete on public.cubicles;
create policy cubicles_professor_insert on public.cubicles for insert to authenticated
with check (professor_id = (select auth.uid()) and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'profesor'));
create policy cubicles_professor_update on public.cubicles for update to authenticated
using (private.is_admin_actor() or (professor_id = (select auth.uid()) and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'profesor')))
with check (private.is_admin_actor() or (professor_id = (select auth.uid()) and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'profesor')));
create policy cubicles_professor_delete on public.cubicles for delete to authenticated
using (private.is_admin_actor() or (professor_id = (select auth.uid()) and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'profesor')));
