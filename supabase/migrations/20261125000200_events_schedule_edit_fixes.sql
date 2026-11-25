-- 1. Traslapes de espacios: eventos sin fecha de cierre (ends_at IS NULL) nunca
--    se tratan como interminables ni bloquean nuevos eventos en esa sede o fecha.
create or replace function public.check_space_event_overlap(
  p_space_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_exclude_event_id uuid default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with target_space as (
    select id, name from public.spaces where id = p_space_id
  )
  select ev.title
    from (
      select se.title, se.starts_at, se.ends_at
        from public.space_events se
       where se.space_id = p_space_id
         and se.ends_at is not null
         and se.ends_at > se.starts_at
         and se.approval_status not in ('rechazado', 'rechazada')
         and (p_exclude_event_id is null or se.id <> p_exclude_event_id)
      union all
      select ce.title, ce.starts_at, ce.ends_at
        from public.club_events ce
        join target_space ts on lower(trim(split_part(ce.location, '·', 1))) = lower(trim(ts.name))
       where ce.ends_at is not null
         and ce.ends_at > ce.starts_at
         and ce.approval_status not in ('rechazado', 'rechazada')
         and (p_exclude_event_id is null or ce.id <> p_exclude_event_id)
    ) ev
   where case
           when p_ends_at is not null and p_ends_at > p_starts_at then
             tstzrange(ev.starts_at, ev.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
           else
             ev.starts_at <= p_starts_at and p_starts_at < ev.ends_at
         end
   order by ev.starts_at asc
   limit 1;
$$;
revoke all on function public.check_space_event_overlap(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.check_space_event_overlap(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- 2. Permitir edición controlada de eventos de club (incluyendo rango de fechas)
--    para personal responsable de sede/área y para responsables del club.
grant update (title, description, starts_at, ends_at, location, image_url, approval_status, approved_by)
  on public.club_events to authenticated;

drop policy if exists club_events_staff_approve on public.club_events;
create policy club_events_staff_approve on public.club_events
for update to authenticated
using (
  private.can_review_club_event(club_id, location)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
)
with check (
  private.can_review_club_event(club_id, location)
  and (approval_status <> 'aprobado' or approved_by = (select auth.uid()))
);

drop policy if exists club_events_manager_edit on public.club_events;
create policy club_events_manager_edit on public.club_events
for update to authenticated
using (private.can_publish_club(club_id))
with check (
  private.can_publish_club(club_id)
  and approval_status = 'pendiente'
  and approved_by is null
);
