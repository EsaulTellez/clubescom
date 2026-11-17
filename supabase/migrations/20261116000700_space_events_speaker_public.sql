-- Add speaker (ponente) and is_public (abierto al publico) to space_events

alter table public.space_events
  add column if not exists speaker text,
  add column if not exists is_public boolean not null default true;

drop policy if exists space_events_approved_read on public.space_events;
create policy space_events_approved_read on public.space_events
for select to anon, authenticated
using (
  (approval_status = 'aprobado' and is_public = true)
  or created_by = (select auth.uid())
  or private.is_admin_actor()
  or private.can_manage_area('comunicacion')
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
);
