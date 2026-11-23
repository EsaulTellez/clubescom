-- Migración 2026-11-22 (2):
-- Procedimiento oficial de registro de clubes ESCOM (sacad_procedimientoClubes_2022.pdf):
-- 1) Vínculo directo entre solicitudes "nuevo_club" del foro y club_proposals (meta 20 votos)
-- 2) Campos oficiales del proyecto ejecutivo y presidente (3º-7º semestre, alumno regular) en propuestas y clubes directos
-- 3) Coordinación multi-horario de junta: personal de clubes propone varias fechas/horarios y tanto profesor como alumno marcan disponibilidad para acordar fecha
-- 4) Ajuste de conteo de expedientes: mínimo 20 estudiantes completos incluyendo al presidente

-- ============================================================================
-- 1. Vínculo Foro (nuevo_club) -> club_proposals
-- ============================================================================
alter table public.questions
  add column if not exists club_proposal_id uuid references public.club_proposals(id) on delete set null;

create index if not exists questions_club_proposal_id_idx
  on public.questions (club_proposal_id)
  where club_proposal_id is not null;

-- ============================================================================
-- 2. Campos del procedimiento oficial (PDF 2022) en club_proposals y clubs
-- ============================================================================
alter table public.club_proposals
  add column if not exists president_semester integer check (president_semester between 3 and 7),
  add column if not exists president_is_regular boolean not null default false;

alter table public.clubs
  add column if not exists objectives text not null default '',
  add column if not exists schedule_plan text not null default '',
  add column if not exists activities_detail text not null default '',
  add column if not exists requested_spaces text not null default '',
  add column if not exists community_impact text not null default '',
  add column if not exists executive_project_path text,
  add column if not exists founding_roster_path text,
  add column if not exists founding_members_count integer check (founding_members_count is null or founding_members_count >= 20),
  add column if not exists president_semester integer check (president_semester is null or president_semester between 3 and 7),
  add column if not exists president_is_regular boolean not null default false;

-- ============================================================================
-- 3. Multi-horario en club_appointments (staff propone -> alumno y profesor eligen)
-- ============================================================================
alter table public.club_appointments
  add column if not exists staff_proposed_slots jsonb not null default '[]'::jsonb,
  add column if not exists proposer_available_slots jsonb not null default '[]'::jsonb,
  add column if not exists advisor_available_slots jsonb not null default '[]'::jsonb,
  add column if not exists proposer_note text;

-- ============================================================================
-- 4. Expedientes listos: presidente + mínimo `threshold` (20) estudiantes en total con datos y 4 docs
-- ============================================================================
create or replace function private.club_proposal_docs_ready(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20) as threshold
  ),
  prop as (
    select id, proposer_id, interested_count from public.club_proposals where id = p_proposal_id
  ),
  all_participants as (
    select p.proposer_id as user_id, true as is_proposer from prop p
    union all
    select ci.user_id, false as is_proposer
      from public.club_interests ci
      join prop p on p.id = ci.proposal_id
     where ci.user_id <> p.proposer_id
  ),
  participant_status as (
    select
      ap.user_id,
      ap.is_proposer,
      (
        select count(distinct d.document_type)
          from public.club_proposal_documents d
         where d.proposal_id = p_proposal_id
           and d.user_id = ap.user_id
           and d.document_type in ('credencial_ipn', 'boleta', 'firma', 'vigencia_ims')
           and d.status in ('recibido', 'validacion_presencial_pendiente')
      ) >= 4
      and exists (
        select 1 from public.club_participant_profiles cp
         where cp.proposal_id = p_proposal_id and cp.user_id = ap.user_id
           and length(trim(coalesce(cp.career, ''))) >= 2
           and length(trim(coalesce(cp.phone, ''))) >= 8
      ) as is_complete
    from all_participants ap
  )
  select coalesce((select is_complete from participant_status where is_proposer limit 1), false)
     and (select interested_count from prop) >= (select threshold from cfg)
     and (select count(*) filter (where is_complete) from participant_status) >= (select threshold from cfg);
$$;
revoke all on function private.club_proposal_docs_ready(uuid) from public;
grant execute on function private.club_proposal_docs_ready(uuid) to authenticated;

-- ============================================================================
-- 5. Envío formal del registro (proyecto ejecutivo sin exigir horarios del alumno; el área propondrá horarios)
-- ============================================================================
create or replace function public.submit_formal_club_request(
  p_proposal_id uuid,
  p_objectives text,
  p_schedule_plan text,
  p_community_impact text,
  p_slots jsonb default '[]'::jsonb,
  p_activities_detail text default '',
  p_requested_spaces text default '',
  p_plan_url text default null,
  p_plan_file_path text default null,
  p_president_semester integer default null,
  p_president_is_regular boolean default true
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
  clean_slots jsonb := case when jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) = 'array' then coalesce(p_slots, '[]'::jsonb) else '[]'::jsonb end;
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or prop.proposer_id <> actor_id then
    raise exception 'Solo quien funge como alumno presidente de la propuesta puede enviar el registro formal';
  end if;
  if prop.status not in ('en_documentacion', 'en_validacion', 'incompleta') then
    raise exception 'Esta solicitud ya fue enviada o cerrada';
  end if;
  if length(trim(coalesce(p_objectives, ''))) < 10 then
    raise exception 'Describe los objetivos del club (mínimo 10 caracteres)';
  end if;
  if length(trim(coalesce(p_schedule_plan, ''))) < 10 then
    raise exception 'Describe el cronograma anual de actividades (mínimo 10 caracteres)';
  end if;
  if length(trim(coalesce(p_activities_detail, ''))) < 10 then
    raise exception 'Detalla las actividades a realizar (mínimo 10 caracteres)';
  end if;
  if length(trim(coalesce(p_requested_spaces, ''))) < 3 then
    raise exception 'Indica los espacios y tiempos solicitados en ESCOM';
  end if;
  if length(trim(coalesce(p_community_impact, ''))) < 10 then
    raise exception 'Explica el impacto académico, cultural o deportivo (mínimo 10 caracteres)';
  end if;
  if p_president_semester is not null and (p_president_semester < 3 or p_president_semester > 7) then
    raise exception 'Conforme al procedimiento de clubes, el alumno presidente debe cursar entre 3º y 7º semestre';
  end if;

  update public.club_proposals
     set objectives = trim(coalesce(p_objectives, objectives)),
         schedule_plan = trim(coalesce(p_schedule_plan, schedule_plan)),
         activities_detail = trim(coalesce(p_activities_detail, activities_detail)),
         requested_spaces = trim(coalesce(p_requested_spaces, requested_spaces)),
         community_impact = trim(coalesce(p_community_impact, community_impact)),
         plan_url = coalesce(nullif(trim(p_plan_url), ''), plan_url),
         plan_file_path = coalesce(nullif(trim(p_plan_file_path), ''), plan_file_path),
         president_semester = coalesce(p_president_semester, president_semester),
         president_is_regular = coalesce(p_president_is_regular, president_is_regular),
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  if not private.club_proposal_ready_for_appointment(p_proposal_id) then
    raise exception 'Faltan requisitos: al menos 20 estudiantes con datos y 4 documentos completos (incluyendo al presidente), profesor coordinador confirmado y proyecto ejecutivo completo';
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
    values (p_proposal_id, actor_id, clean_slots, 'pendiente', now())
    returning id into appointment_id;
  else
    update public.club_appointments
       set requested_by = actor_id,
           requested_slots = clean_slots,
           proposer_confirmed_at = now(),
           advisor_confirmed_at = null
     where id = appointment_id;
  end if;

  update public.club_proposals
     set status = 'en_validacion',
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
      'El alumno presidente envió el proyecto ejecutivo y expedientes al área de clubes correspondiente.',
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
      'Cuenta con al menos 20 expedientes completos, proyecto ejecutivo y profesor coordinador confirmado. Lista para revisión y propuesta de fechas de junta.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'alta'
    );
  end loop;

  return appointment_id;
end;
$$;
revoke all on function public.submit_formal_club_request(uuid, text, text, text, jsonb, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.submit_formal_club_request(uuid, text, text, text, jsonb, text, text, text, text, integer, boolean) to authenticated;

-- ============================================================================
-- 6. Personal de clubes propone múltiples fechas/horarios para la junta conjunta
-- ============================================================================
create or replace function public.propose_club_appointment_slots(
  p_proposal_id uuid,
  p_slots jsonb,
  p_meeting_mode text default 'presencial',
  p_meeting_location text default '',
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prop public.club_proposals%rowtype;
  appt_id uuid;
  clean_mode text := case when p_meeting_mode = 'en_linea' then 'en_linea' else 'presencial' end;
  clean_location text := left(trim(coalesce(p_meeting_location, '')), 300);
  clean_notes text := left(trim(coalesce(p_notes, '')), 400);
begin
  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Propuesta no encontrada';
  end if;
  if not private.can_manage_club_kind(prop.kind) then
    raise exception 'No tienes permiso para proponer horarios de junta en esta categoría de club';
  end if;
  if prop.formal_submitted_at is null then
    raise exception 'La propuesta aún no envía su registro formal';
  end if;
  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_slots, '[]'::jsonb)) < 1 then
    raise exception 'Propón al menos una fecha y hora para la junta';
  end if;

  select id into appt_id
    from public.club_appointments
   where proposal_id = p_proposal_id and status in ('pendiente', 'confirmada')
   order by created_at desc
   limit 1;

  if appt_id is null then
    insert into public.club_appointments (
      proposal_id, requested_by, status, staff_proposed_slots,
      proposer_available_slots, advisor_available_slots,
      meeting_mode, meeting_location, subdireccion_notes, reviewed_by, reviewed_at
    )
    values (
      p_proposal_id, prop.proposer_id, 'pendiente', p_slots,
      '[]'::jsonb, '[]'::jsonb,
      clean_mode, nullif(clean_location, ''), nullif(clean_notes, ''), actor_id, now()
    )
    returning id into appt_id;
  else
    update public.club_appointments
       set status = 'pendiente',
           staff_proposed_slots = p_slots,
           proposer_available_slots = '[]'::jsonb,
           advisor_available_slots = '[]'::jsonb,
           scheduled_at = null,
           proposer_confirmed_at = null,
           advisor_confirmed_at = null,
           meeting_mode = clean_mode,
           meeting_location = nullif(clean_location, ''),
           subdireccion_notes = nullif(clean_notes, ''),
           reviewed_by = actor_id,
           reviewed_at = now()
     where id = appt_id;
  end if;

  update public.club_proposals
     set status = 'cita_pendiente',
         updated_at = now()
   where id = p_proposal_id;

  perform private.notify_user(
    prop.proposer_id,
    'clubes',
    'Elige horarios para la junta de club: ' || prop.name,
    'La coordinación de clubes propuso fechas disponibles para la reunión. Entra a la propuesta y marca los horarios en los que puedes asistir.',
    '/clubes/propuestas/' || p_proposal_id::text,
    'alta'
  );

  if prop.advisor_id is not null then
    perform private.notify_user(
      prop.advisor_id,
      'clubes',
      'Elige horarios para la junta de club: ' || prop.name,
      'La coordinación de clubes propuso fechas disponibles para la reunión conjunta. Entra a la propuesta y marca los horarios en los que puedes asistir.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'alta'
    );
  end if;

  return appt_id;
end;
$$;
revoke all on function public.propose_club_appointment_slots(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.propose_club_appointment_slots(uuid, jsonb, text, text, text) to authenticated;

-- ============================================================================
-- 7. Alumno presidente y Profesor coordinador marcan su disponibilidad sobre los horarios propuestos
-- ============================================================================
create or replace function public.respond_club_appointment_slots(
  p_proposal_id uuid,
  p_selected_slots jsonb,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prop public.club_proposals%rowtype;
  appt public.club_appointments%rowtype;
  clean_slots jsonb := case when jsonb_typeof(coalesce(p_selected_slots, '[]'::jsonb)) = 'array' then coalesce(p_selected_slots, '[]'::jsonb) else '[]'::jsonb end;
  clean_note text := nullif(left(trim(coalesce(p_note, '')), 400), '');
  is_proposer boolean;
  is_advisor boolean;
  mod_row record;
begin
  if not private.is_active_actor() then
    raise exception 'Cuenta inactiva';
  end if;

  select * into prop from public.club_proposals where id = p_proposal_id;
  if not found then
    raise exception 'Propuesta no encontrada';
  end if;

  is_proposer := (prop.proposer_id = actor_id);
  is_advisor := (prop.advisor_id = actor_id);
  if not is_proposer and not is_advisor then
    raise exception 'Solo el alumno presidente o el profesor coordinador pueden elegir disponibilidad de horarios';
  end if;

  select * into appt
    from public.club_appointments
   where proposal_id = p_proposal_id and status in ('pendiente', 'confirmada')
   order by created_at desc
   limit 1
   for update;

  if not found then
    raise exception 'No hay propuesta de horarios activa para esta solicitud';
  end if;

  if is_proposer then
    update public.club_appointments
       set proposer_available_slots = clean_slots,
           proposer_note = coalesce(clean_note, proposer_note),
           proposer_confirmed_at = case when jsonb_array_length(clean_slots) > 0 then now() else null end
     where id = appt.id;
  else
    update public.club_appointments
       set advisor_available_slots = clean_slots,
           advisor_note = coalesce(clean_note, advisor_note),
           advisor_confirmed_at = case when jsonb_array_length(clean_slots) > 0 then now() else null end
     where id = appt.id;
  end if;

  -- Notificar a la otra parte y al personal de clubes
  if is_proposer and prop.advisor_id is not null then
    perform private.notify_user(
      prop.advisor_id,
      'clubes',
      'Disponibilidad del alumno registrada: ' || prop.name,
      'El alumno presidente ya seleccionó los horarios en los que puede asistir a la junta.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'normal'
    );
  elsif is_advisor then
    perform private.notify_user(
      prop.proposer_id,
      'clubes',
      'Disponibilidad del profesor registrada: ' || prop.name,
      'El profesor coordinador ya seleccionó los horarios en los que puede asistir a la junta.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'normal'
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
      'Disponibilidad actualizada para junta: ' || prop.name,
      case when is_proposer then 'El alumno presidente' else 'El profesor coordinador' end || ' marcó sus horarios disponibles. Revisa coincidencias para acordar la fecha.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'alta'
    );
  end loop;

  return true;
end;
$$;
revoke all on function public.respond_club_appointment_slots(uuid, jsonb, text) from public, anon;
grant execute on function public.respond_club_appointment_slots(uuid, jsonb, text) to authenticated;
