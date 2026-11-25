-- Los moderadores de club (alumno responsable y profesor coordinador)
-- publican y editan directamente los eventos de su propio club sin requerir
-- autorización previa de administración ni de otras áreas.

-- 1. Publicar cualquier evento de club que hubiera quedado pendiente.
update public.club_events
   set approval_status = 'aprobado',
       approved_by = coalesce(approved_by, created_by)
 where approval_status = 'pendiente';

-- 2. Retirar la política restrictiva que obligaba a insertar en 'pendiente'
--    salvo que el autor pudiera revisar la sede.
drop policy if exists club_events_approval_scope on public.club_events;

-- 3. Permitir únicamente al alumno responsable o profesor coordinador del
--    propio club activo publicar eventos directamente como 'aprobado'.
drop policy if exists club_events_member_submit on public.club_events;
create policy club_events_member_submit on public.club_events
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_active_actor()
  and approval_status = 'aprobado'
  and approved_by = (select auth.uid())
  and private.can_publish_club(club_id)
);

-- 4. Al editar un evento de su club, el responsable o coordinador lo mantiene
--    publicado ('aprobado') sin volver a revisión.
grant update (title, description, starts_at, ends_at, location, image_url, approval_status, approved_by)
  on public.club_events to authenticated;

drop policy if exists club_events_manager_edit on public.club_events;
create policy club_events_manager_edit on public.club_events
for update to authenticated
using (private.can_publish_club(club_id))
with check (
  private.can_publish_club(club_id)
  and approval_status = 'aprobado'
  and approved_by is not null
);
