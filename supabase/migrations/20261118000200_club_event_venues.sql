-- La sede de un evento de club se guarda antes del separador de edificio.
create function private.club_event_venue_area(p_location text)
returns text language sql immutable set search_path = '' as $$
  select case lower(trim(split_part(p_location, '·', 1)))
    when 'auditorio' then 'becas'
    when 'sala 14' then 'subdireccion_academica'
  end;
$$;
create function private.can_review_club_event(p_club_id uuid, p_location text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when private.club_event_venue_area(p_location) is not null
    then private.can_manage_area(private.club_event_venue_area(p_location))
    else exists (select 1 from public.clubs c where c.id = p_club_id and private.can_manage_club_kind(c.kind))
  end;
$$;
revoke all on function private.club_event_venue_area(text), private.can_review_club_event(uuid,text) from public;
grant execute on function private.club_event_venue_area(text), private.can_review_club_event(uuid,text) to authenticated;

create policy club_events_venue_read on public.club_events for select to authenticated
using (private.can_review_club_event(club_id, location));
create policy club_events_approval_scope on public.club_events as restrictive for insert to authenticated
with check (approval_status = 'pendiente' or private.can_review_club_event(club_id, location));

alter policy club_events_staff_approve on public.club_events
using (private.can_review_club_event(club_id, location))
with check (private.can_review_club_event(club_id, location)
  and (approval_status <> 'aprobado' or approved_by = (select auth.uid())));
-- Revisar desde la sede permite decidir sobre el evento, conservando su club y ubicación.
revoke update on public.club_events from authenticated;
grant update (approval_status, approved_by) on public.club_events to authenticated;
create policy club_events_venue_delete on public.club_events for delete to authenticated
using (private.can_review_club_event(club_id, location));
