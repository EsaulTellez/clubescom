-- Migración 2026-11-22:
-- 1) Rol SSEIS y delegación de coordinación para clubes culturales y deportivos
-- 2) Permisos estrictos de publicaciones de club (solo mod alumno/profesor del propio club) y eventos
-- 3) Buscador de directorio por boleta/empleado/nombre/correo y boleta en panel admin
-- 4) Sugerencias formales estructuradas (nombre, horario, materia) en el mapa de cubículos

-- ============================================================================
-- 1. SSEIS y delegación de coordinación para clubes culturales y deportivos
-- ============================================================================
create table if not exists public.club_area_delegates (
  id uuid primary key default gen_random_uuid(),
  area_group text not null check (area_group in ('cultural_deportivo')),
  user_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  note text not null default '' check (length(note) <= 240),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists club_area_delegates_unique_active
  on public.club_area_delegates (area_group, user_id)
  where active = true;

alter table public.club_area_delegates enable row level security;
grant select on public.club_area_delegates to authenticated;

drop policy if exists club_area_delegates_read on public.club_area_delegates;
create policy club_area_delegates_read on public.club_area_delegates
for select to authenticated using (true);

create or replace function public.get_my_delegated_club_kinds()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
        from public.club_area_delegates d
        join public.users u on u.id = d.user_id
       where d.user_id = (select auth.uid())
         and d.area_group = 'cultural_deportivo'
         and d.active = true
         and u.is_active = true
         and not u.banned
    ) then array['cultural', 'deportivo']::text[]
    else array[]::text[]
  end;
$$;
revoke all on function public.get_my_delegated_club_kinds() from public, anon;
grant execute on function public.get_my_delegated_club_kinds() to authenticated;

create or replace function public.sseis_set_club_delegate(
  p_user_id uuid,
  p_active boolean default true,
  p_note text default ''
)
returns table (delegate_id uuid, user_id uuid, user_name text, active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_user record;
  saved_id uuid;
  clean_note text := left(trim(coalesce(p_note, '')), 240);
begin
  if not (private.is_admin_actor() or private.can_manage_area('sseis')) then
    raise exception 'Solo SSEIS o administración puede designar responsables de clubes culturales y deportivos';
  end if;

  select u.id, u.name, u.role, u.area, u.is_active, u.banned
    into target_user
    from public.users u
   where u.id = p_user_id;

  if not found or not target_user.is_active or target_user.banned then
    raise exception 'La cuenta seleccionada no está activa';
  end if;

  if p_active then
    if target_user.role not in ('profesor', 'moderador') then
      raise exception 'Solo puedes designar a un profesor o personal institucional activo';
    end if;

    update public.club_area_delegates
       set active = true,
           assigned_by = actor_id,
           note = clean_note,
           updated_at = now()
     where area_group = 'cultural_deportivo'
       and public.club_area_delegates.user_id = p_user_id
     returning id into saved_id;

    if saved_id is null then
      insert into public.club_area_delegates (area_group, user_id, assigned_by, note, active)
      values ('cultural_deportivo', p_user_id, actor_id, clean_note, true)
      returning id into saved_id;
    end if;

    perform private.notify_user(
      p_user_id,
      'clubes',
      'Designación SSEIS · Clubes Culturales y Deportivos',
      'El área SSEIS te designó como responsable del proceso de apertura y seguimiento de clubes culturales y deportivos en ESCOM.',
      '/clubes',
      'alta'
    );
  else
    update public.club_area_delegates
       set active = false,
           updated_at = now()
     where area_group = 'cultural_deportivo'
       and public.club_area_delegates.user_id = p_user_id
       and public.club_area_delegates.active = true
     returning id into saved_id;
  end if;

  return query
    select saved_id, target_user.id, target_user.name, p_active;
end;
$$;
revoke all on function public.sseis_set_club_delegate(uuid, boolean, text) from public, anon;
grant execute on function public.sseis_set_club_delegate(uuid, boolean, text) to authenticated;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.user_role,
  p_area text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_area text := case when p_role = 'moderador' then lower(trim(coalesce(p_area, ''))) else null end;
begin
  if not (private.is_admin_actor() and exists (
    select 1 from public.users where id = (select auth.uid()) and is_superadmin
  )) then
    raise exception 'Solo superadministración puede asignar roles';
  end if;
  if p_role = 'moderador' and normalized_area not in (
    'gestion_escolar', 'becas', 'catt', 'comunicacion',
    'clubes_academicos', 'clubes_culturales', 'sseis', 'prefectura', 'subdireccion_academica'
  ) then
    raise exception 'Selecciona un área institucional válida para el moderador';
  end if;
  update public.users
     set role = p_role,
         can_switch_profile = false,
         area = normalized_area
   where id = p_user_id and not is_superadmin;
  if not found then
    raise exception 'Cuenta inexistente o protegida';
  end if;
end;
$$;

create or replace function private.can_manage_club_kind(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or (p_kind = 'academico' and (private.can_manage_area('subdireccion_academica') or private.can_manage_area('clubes_academicos')))
      or (p_kind in ('cultural', 'deportivo') and (
        private.can_manage_area('sseis')
        or private.can_manage_area('clubes_culturales')
        or (
          private.is_active_actor()
          and exists (
            select 1
              from public.club_area_delegates d
             where d.user_id = (select auth.uid())
               and d.area_group = 'cultural_deportivo'
               and d.active = true
          )
        )
      ));
$$;
revoke all on function private.can_manage_club_kind(text) from public;
grant execute on function private.can_manage_club_kind(text) to anon, authenticated;

drop policy if exists clubs_area_insert on public.clubs;
create policy clubs_area_insert on public.clubs for insert to authenticated
with check (private.can_manage_club_kind(kind));

-- Actualizar notificaciones del registro formal de club para incluir SSEIS y sus delegadas/os
create or replace function public.submit_formal_club_request(
  p_proposal_id uuid,
  p_objectives text,
  p_schedule_plan text,
  p_community_impact text,
  p_slots jsonb,
  p_activities_detail text default '',
  p_requested_spaces text default '',
  p_plan_url text default null,
  p_plan_file_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prop public.club_proposals%rowtype;
  appointment_id uuid;
  mod_row record;
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or prop.proposer_id <> actor_id then
    raise exception 'Solo quien funge como alumno moderador de la propuesta puede enviar el registro formal';
  end if;
  if prop.status not in ('en_documentacion', 'en_validacion', 'incompleta') then
    raise exception 'Esta solicitud ya fue enviada o cerrada';
  end if;
  if length(trim(coalesce(p_objectives, ''))) < 10 then
    raise exception 'Describe los objetivos del club (mínimo 10 caracteres)';
  end if;
  if length(trim(coalesce(p_schedule_plan, ''))) < 10 then
    raise exception 'Describe el cronograma de actividades a realizar (mínimo 10 caracteres)';
  end if;
  if length(trim(coalesce(p_activities_detail, ''))) < 10 then
    raise exception 'Detalla las actividades semestrales y metas del club (mínimo 10 caracteres)';
  end if;
  if length(trim(coalesce(p_requested_spaces, ''))) < 3 then
    raise exception 'Indica los espacios y horarios que ocupará el club';
  end if;
  if length(trim(coalesce(p_community_impact, ''))) < 10 then
    raise exception 'Explica el impacto para la comunidad ESCOM (mínimo 10 caracteres)';
  end if;
  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_slots, '[]'::jsonb)) < 1 then
    raise exception 'Indica al menos una fecha y hora tentativa para la cita';
  end if;

  update public.club_proposals
     set objectives = trim(coalesce(p_objectives, objectives)),
         schedule_plan = trim(coalesce(p_schedule_plan, schedule_plan)),
         activities_detail = trim(coalesce(p_activities_detail, activities_detail)),
         requested_spaces = trim(coalesce(p_requested_spaces, requested_spaces)),
         community_impact = trim(coalesce(p_community_impact, community_impact)),
         plan_url = coalesce(nullif(trim(p_plan_url), ''), plan_url),
         plan_file_path = coalesce(nullif(trim(p_plan_file_path), ''), plan_file_path),
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  if not private.club_proposal_ready_for_appointment(p_proposal_id) then
    raise exception 'Faltan requisitos: meta de integrantes con perfil y 4 documentos completos, profesor asesor confirmado, proyecto ejecutivo y cronograma';
  end if;

  update public.club_appointments
     set status = 'cancelada'
   where proposal_id = p_proposal_id and status = 'confirmada';

  select id into appointment_id
    from public.club_appointments
   where proposal_id = p_proposal_id and status = 'pendiente'
   limit 1;

  if appointment_id is null then
    insert into public.club_appointments (proposal_id, requested_by, requested_slots, status, proposer_confirmed_at)
    values (p_proposal_id, actor_id, p_slots, 'pendiente', now())
    returning id into appointment_id;
  else
    update public.club_appointments
       set requested_by = actor_id,
           requested_slots = p_slots,
           proposer_confirmed_at = now(),
           advisor_confirmed_at = null
     where id = appointment_id;
  end if;

  update public.club_proposals
     set status = 'cita_pendiente',
         formal_submitted_at = coalesce(formal_submitted_at, now()),
         review_observations = null,
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  if prop.advisor_id is not null then
    perform private.notify_user(
      prop.advisor_id,
      'clubes',
      'Registro formal enviado: ' || prop.name,
      'El alumno responsable envió el proyecto ejecutivo y solicitó cita conjunta con coordinación.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'alta'
    );
  end if;

  for mod_row in
    select distinct u.id
      from public.users u
     where u.is_active and not u.banned
       and (
         u.role = 'admin'
         or (prop.kind = 'academico' and u.role = 'moderador' and u.area in ('subdireccion_academica', 'clubes_academicos'))
         or (prop.kind in ('cultural', 'deportivo') and (
           (u.role = 'moderador' and u.area in ('sseis', 'clubes_culturales'))
           or exists (
             select 1 from public.club_area_delegates d
              where d.user_id = u.id and d.area_group = 'cultural_deportivo' and d.active = true
           )
         ))
       )
  loop
    perform private.notify_user(
      mod_row.id,
      'clubes',
      'Nueva solicitud formal de club: ' || prop.name,
      'Cuenta con integrantes y documentos completos, cronograma de actividades y profesor coordinador confirmado. Lista para revisar y coordinar cita.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'alta'
    );
  end loop;

  return appointment_id;
end;
$$;
revoke all on function public.submit_formal_club_request(uuid, text, text, text, jsonb, text, text, text, text) from public, anon;
grant execute on function public.submit_formal_club_request(uuid, text, text, text, jsonb, text, text, text, text) to authenticated;

-- Actualizar foro para reconocer sseis y delegados en área clubes
create or replace function private.can_manage_forum_question(p_area text, p_request_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or private.can_manage_area(p_area)
      or (p_area = 'clubes' and (
        private.can_manage_area('subdireccion_academica')
        or private.can_manage_area('clubes_academicos')
        or private.can_manage_area('clubes_culturales')
        or private.can_manage_area('sseis')
      ))
      or (p_request_kind = 'nuevo_club' and (
        private.can_manage_area('subdireccion_academica')
        or private.can_manage_area('clubes_academicos')
        or private.can_manage_area('clubes_culturales')
        or private.can_manage_area('sseis')
      ))
      or (p_area = 'infraestructura' and private.can_manage_area('prefectura'))
      or (p_request_kind = 'cambio_info' and private.can_manage_area('prefectura'));
$$;

-- ============================================================================
-- 2. Permisos estrictos: publicaciones de club y eventos
-- ============================================================================
-- Solo el alumno moderador o profesor asesor del propio club puede crear publicaciones en ese club.
drop policy if exists club_posts_managers_insert on public.club_posts;
create policy club_posts_managers_insert on public.club_posts
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and private.can_publish_club(club_id)
);

-- Solo los moderadores del club (alumno responsable o profesor asesor) crean eventos de su propio club.
drop policy if exists club_events_member_submit on public.club_events;
create policy club_events_member_submit on public.club_events
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_active_actor()
  and approval_status = 'pendiente'
  and private.can_publish_club(club_id)
);

-- En espacios del campus, solo Becas (Auditorio), Subdirección Académica (Sala 14) y admin gestionan space_events.
create or replace function private.can_manage_space_event(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or exists (
        select 1 from public.spaces s
         where s.id = p_space_id
           and (
             (private.can_manage_area('becas') and lower(trim(s.name)) = 'auditorio')
             or (private.can_manage_area('subdireccion_academica') and lower(trim(s.name)) = 'sala 14')
           )
      );
$$;

-- Retirar inserción libre de space_events para alumnos/profesores sin club (los clubes usan club_events).
drop policy if exists space_events_student_submit on public.space_events;

-- ============================================================================
-- 3. Buscador de usuarios por boleta/empleado/nombre/correo + boleta en admin
-- ============================================================================
drop function if exists public.admin_list_user_profiles();
create or replace function public.admin_list_user_profiles()
returns table (
  id uuid,
  name text,
  email text,
  boleta text,
  role public.user_role,
  area text,
  banned boolean,
  is_superadmin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin_actor() then
    raise exception 'Solo administración puede consultar el directorio';
  end if;
  return query
    select u.id, u.name, p.email, p.boleta, u.role, u.area, u.banned, u.is_superadmin
      from public.users u
      join private.user_private p on p.user_id = u.id
     order by u.name;
end;
$$;
revoke all on function public.admin_list_user_profiles() from public, anon;
grant execute on function public.admin_list_user_profiles() to authenticated;

create or replace function public.search_directory_users(
  p_query text default '',
  p_roles text[] default array['alumno', 'profesor'],
  p_limit integer default 20
)
returns table (
  id uuid,
  name text,
  role public.user_role,
  area text,
  boleta text,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  is_privileged boolean := false;
  clean_q text := lower(extensions.unaccent(trim(coalesce(p_query, ''))));
  safe_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if not private.is_active_actor() then
    return;
  end if;

  is_privileged := private.is_admin_actor()
    or exists (select 1 from public.users me where me.id = actor_id and me.role = 'moderador' and me.is_active)
    or exists (select 1 from public.club_area_delegates d where d.user_id = actor_id and d.active = true);

  if is_privileged then
    return query
      select u.id, u.name, u.role, u.area, up.boleta, up.email
        from public.users u
        left join private.user_private up on up.user_id = u.id
       where u.is_active
         and not u.banned
         and (p_roles is null or u.role::text = any(p_roles))
         and (
           clean_q = ''
           or lower(extensions.unaccent(u.name)) like '%' || clean_q || '%'
           or lower(coalesce(up.boleta, '')) like '%' || clean_q || '%'
           or lower(coalesce(up.email, '')) like '%' || clean_q || '%'
         )
       order by
         case when clean_q <> '' and lower(coalesce(up.boleta, '')) = clean_q then 0
              when clean_q <> '' and lower(coalesce(up.boleta, '')) like clean_q || '%' then 1
              when clean_q <> '' and lower(extensions.unaccent(u.name)) like clean_q || '%' then 2
              else 3 end,
         u.name asc
       limit safe_limit;
  else
    -- Usuarios no staff solo pueden buscar profesores del directorio (sin exponer boletas de alumnos)
    return query
      select u.id, u.name, u.role, u.area, null::text as boleta, up.email
        from public.users u
        left join private.user_private up on up.user_id = u.id
       where u.is_active
         and not u.banned
         and u.role = 'profesor'
         and (p_roles is null or 'profesor' = any(p_roles))
         and (
           clean_q = ''
           or lower(extensions.unaccent(u.name)) like '%' || clean_q || '%'
           or lower(coalesce(up.email, '')) like '%' || clean_q || '%'
           or lower(coalesce(up.boleta, '')) like '%' || clean_q || '%'
         )
       order by
         case when clean_q <> '' and lower(extensions.unaccent(u.name)) like clean_q || '%' then 0 else 1 end,
         u.name asc
       limit safe_limit;
  end if;
end;
$$;
revoke all on function public.search_directory_users(text, text[], integer) from public, anon;
grant execute on function public.search_directory_users(text, text[], integer) to authenticated;

-- ============================================================================
-- 4. Sugerencias formales estructuradas en el mapa (nombre, horario, materia)
-- ============================================================================
alter table public.map_room_suggestions
  alter column professor_id drop not null,
  add column if not exists professor_name_input text not null default '',
  add column if not exists schedule_text text not null default '',
  add column if not exists subjects_text text not null default '';

alter table public.map_room_suggestions drop constraint if exists map_room_suggestions_room_code_professor_id_key;
create unique index if not exists map_room_suggestions_unique_prof_idx
  on public.map_room_suggestions (room_code, professor_id)
  where professor_id is not null;

alter table public.map_room_suggestions drop constraint if exists map_room_suggestions_name_or_id_check;
alter table public.map_room_suggestions add constraint map_room_suggestions_name_or_id_check check (
  professor_id is not null or length(trim(professor_name_input)) >= 3
);

alter table public.map_room_suggestions drop constraint if exists map_room_suggestions_fields_len_check;
alter table public.map_room_suggestions add constraint map_room_suggestions_fields_len_check check (
  length(professor_name_input) <= 120
  and length(schedule_text) <= 240
  and length(subjects_text) <= 240
);

drop policy if exists map_room_suggestions_delete on public.map_room_suggestions;
create policy map_room_suggestions_delete on public.map_room_suggestions
for delete to authenticated
using (
  suggested_by = (select auth.uid())
  or professor_id = (select auth.uid())
  or private.is_admin_actor()
  or private.can_manage_area('prefectura')
);
