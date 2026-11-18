-- Correcciones de Realtime (club_posts, event_attendees), Mapa 3D (sugerencias)
-- y flujo de Clubes/Propuestas según procedimiento oficial ESCOM (sacad_procedimientoClubes_2022.pdf).

-- 1. Asegurar columnas idempotentes de space_events en caso de haberse omitido el prefijo 000700 previo
alter table public.space_events
  add column if not exists speaker text,
  add column if not exists is_public boolean not null default true;

-- 2. Incluir club_posts y event_attendees en supabase_realtime para actualizar el feed en vivo
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['club_posts', 'event_attendees'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- 3. Permitir actualizar nota propia en map_room_suggestions sin violar RLS
drop policy if exists map_room_suggestions_update on public.map_room_suggestions;
create policy map_room_suggestions_update on public.map_room_suggestions
for update to authenticated
using (
  suggested_by = (select auth.uid())
  and private.is_active_actor()
)
with check (
  suggested_by = (select auth.uid())
  and private.is_active_actor()
);

-- 4. Clubes: plazo de 5 días para tomar el mando, espacios solicitados, detalle de actividades
--    y datos de contacto del integrante (carrera y teléfono) conforme a sacad_procedimientoClubes_2022.pdf
update public.system_settings
   set value_int = 5,
       label = 'Días sin actividad del proponente para permitir tomar el mando de una propuesta'
 where key = 'club_claim_inactivity_days';

insert into public.system_settings (key, value_int, label)
values ('club_claim_inactivity_days', 5, 'Días sin actividad del proponente para permitir tomar el mando de una propuesta')
on conflict (key) do update
  set value_int = excluded.value_int,
      label = excluded.label;

alter table public.club_proposals
  add column if not exists activities_detail text not null default '',
  add column if not exists requested_spaces text not null default '';

create table if not exists public.club_participant_profiles (
  proposal_id uuid not null references public.club_proposals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  career text not null default '' check (length(career) <= 120),
  phone text not null default '' check (length(phone) <= 40),
  updated_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

alter table public.club_participant_profiles enable row level security;
grant select, insert, update, delete on public.club_participant_profiles to authenticated;

drop policy if exists club_participant_profiles_read on public.club_participant_profiles;
create policy club_participant_profiles_read on public.club_participant_profiles
for select to authenticated using (
  user_id = (select auth.uid())
  or private.can_review_club_proposal(proposal_id)
);

drop policy if exists club_participant_profiles_write on public.club_participant_profiles;
create policy club_participant_profiles_write on public.club_participant_profiles
for all to authenticated using (
  user_id = (select auth.uid())
  and private.is_active_actor()
  and private.is_proposal_participant(proposal_id)
) with check (
  user_id = (select auth.uid())
  and private.is_active_actor()
  and private.is_proposal_participant(proposal_id)
);

-- Actualizar helper de lista lista para cita para validar cronograma y espacios solicitados
create or replace function private.club_proposal_ready_for_appointment(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.club_proposals p
     where p.id = p_proposal_id
       and p.advisor_id is not null
       and p.advisor_confirmed_at is not null
       and length(trim(coalesce(p.schedule_plan, ''))) >= 10
       and length(trim(coalesce(p.requested_spaces, ''))) >= 3
       and (select count(*) from public.club_interests i where i.proposal_id = p.id) >=
           coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20)
       and not exists (
         select 1
           from (
             select i.user_id from public.club_interests i where i.proposal_id = p.id
             union
             select p.proposer_id
           ) participants(user_id)
           cross join (values ('credencial_ipn'), ('boleta'), ('firma'), ('vigencia_ims')) required(document_type)
           left join public.club_proposal_documents d
             on d.proposal_id = p.id
            and d.user_id = participants.user_id
            and d.document_type = required.document_type
            and d.status = 'recibido'
          where d.id is null
       )
  );
$$;
revoke all on function private.club_proposal_ready_for_appointment(uuid) from public;
grant execute on function private.club_proposal_ready_for_appointment(uuid) to authenticated;

-- Reemplazar submit_formal_club_request agregando detalle de actividades y espacios solicitados
drop function if exists public.submit_formal_club_request(uuid, text, text, text, jsonb);
create or replace function public.submit_formal_club_request(
  p_proposal_id uuid,
  p_objectives text,
  p_schedule_plan text,
  p_community_impact text,
  p_slots jsonb,
  p_activities_detail text default '',
  p_requested_spaces text default ''
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
  if length(trim(coalesce(p_schedule_plan, ''))) < 10 then
    raise exception 'Describe el cronograma de actividades a realizar (mínimo 10 caracteres)';
  end if;
  if length(trim(coalesce(p_requested_spaces, ''))) < 3 then
    raise exception 'Indica los espacios y tiempos que ocupará el club';
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
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  if not private.club_proposal_ready_for_appointment(p_proposal_id) then
    raise exception 'Faltan requisitos para el registro formal: 20 interesados, documentos completos de cada participante, profesor coordinador confirmado, cronograma y espacios';
  end if;

  select id into appointment_id
    from public.club_appointments
   where proposal_id = p_proposal_id and status = 'pendiente'
   limit 1;

  if appointment_id is null then
    insert into public.club_appointments (proposal_id, requested_by, requested_slots, status)
    values (p_proposal_id, actor_id, p_slots, 'pendiente')
    returning id into appointment_id;
  else
    update public.club_appointments
       set requested_by = actor_id,
           requested_slots = p_slots
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
      'Solicitud formal enviada: ' || prop.name,
      'El alumno moderador envió el registro formal del club y solicitó cita con la coordinación correspondiente.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'alta'
    );
  end if;

  for mod_row in
    select u.id
      from public.users u
     where u.is_active and not u.banned
       and (
         u.role = 'admin'
         or (prop.kind = 'academico' and u.role = 'moderador' and u.area in ('subdireccion_academica', 'clubes_academicos'))
         or (prop.kind in ('cultural', 'deportivo') and u.role = 'moderador' and u.area = 'clubes_culturales')
       )
  loop
    perform private.notify_user(
      mod_row.id,
      'clubes',
      'Nueva solicitud formal de club: ' || prop.name,
      'Reúne los 20 votos, documentos de integrantes, cronograma, espacios solicitados y profesor coordinador confirmado. Lista para revisar y agendar cita.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'alta'
    );
  end loop;

  return appointment_id;
end;
$$;
revoke all on function public.submit_formal_club_request(uuid, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.submit_formal_club_request(uuid, text, text, text, jsonb, text, text) to authenticated;

-- Permitir a cualquier alumno participante (o interesado si no es el proponente) tomar el mando tras 5 días sin envío formal
create or replace function public.claim_inactive_club_proposal(p_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prop public.club_proposals%rowtype;
  inactivity_days integer := 5;
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  if not exists (select 1 from public.users u where u.id = actor_id and u.role = 'alumno') then
    raise exception 'Solo un alumno activo puede tomar el mando como moderador del club';
  end if;

  select coalesce((select value_int from public.system_settings where key = 'club_claim_inactivity_days'), 5)
    into inactivity_days;

  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or prop.status in ('registrado', 'rechazada') or prop.proposer_id = actor_id or prop.formal_submitted_at is not null then
    return false;
  end if;
  if prop.last_proposer_activity_at > now() - (inactivity_days::text || ' days')::interval then
    raise exception 'El responsable actual aún está dentro del plazo activo de % días', inactivity_days;
  end if;
  if not exists (select 1 from public.club_interests where proposal_id = p_proposal_id and user_id = actor_id) then
    raise exception 'Solo un alumno interesado en la propuesta puede tomar el mando';
  end if;

  update public.club_proposals
     set proposer_id = actor_id,
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  perform private.notify_user(
    prop.proposer_id,
    'clubes',
    'Mando de propuesta transferido por inactividad',
    'Otro alumno participante aceptó fungir como moderador de «' || prop.name || '» tras ' || inactivity_days || ' días sin envío del registro.',
    '/clubes/propuestas/' || p_proposal_id::text,
    'alta'
  );
  return true;
end;
$$;
revoke all on function public.claim_inactive_club_proposal(uuid) from public, anon;
grant execute on function public.claim_inactive_club_proposal(uuid) to authenticated;

-- Resumen agregado público (solo conteos enteros, sin exponer documentos privados)
create or replace function public.get_club_proposal_progress_summary()
returns table (
  proposal_id uuid,
  participants_count integer,
  participants_complete_docs integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with participants as (
    select p.id as proposal_id, p.proposer_id as user_id
    from public.club_proposals p
    where p.status <> 'registrado'
    union
    select ci.proposal_id, ci.user_id
    from public.club_interests ci
    join public.club_proposals p on p.id = ci.proposal_id
    where p.status <> 'registrado'
  ),
  doc_counts as (
    select
      pa.proposal_id,
      pa.user_id,
      count(distinct d.document_type) filter (
        where d.document_type in ('credencial_ipn', 'boleta', 'firma', 'vigencia_ims')
          and d.status <> 'requiere_correccion'
      ) as valid_docs
    from participants pa
    left join public.club_proposal_documents d
      on d.proposal_id = pa.proposal_id
     and d.user_id = pa.user_id
    group by pa.proposal_id, pa.user_id
  )
  select
    dc.proposal_id,
    count(*)::integer as participants_count,
    count(*) filter (where dc.valid_docs >= 4)::integer as participants_complete_docs
  from doc_counts dc
  group by dc.proposal_id;
$$;
revoke all on function public.get_club_proposal_progress_summary() from public;
grant execute on function public.get_club_proposal_progress_summary() to anon, authenticated;
