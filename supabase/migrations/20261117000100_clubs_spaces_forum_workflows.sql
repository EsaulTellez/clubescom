-- Flujos completos de Clubes (Subdirección/Culturales, código por correo al profesor coordinador,
-- registro formal con actividades, contacto y métricas), Sala 14 / Auditorio (Becas) y tipos de solicitud en Foro.

-- 1. Columnas nuevas en club_proposals, clubs, questions y configuración
alter table public.club_proposals
  add column if not exists formal_submitted_at timestamptz,
  add column if not exists pending_advisor_id uuid references public.users(id) on delete set null;

alter table public.clubs
  add column if not exists contact_email text,
  add column if not exists contact_info text;

alter table public.questions
  add column if not exists request_kind text not null default 'pregunta',
  add column if not exists target_guide_id uuid references public.guides(id) on delete set null;

alter table public.questions drop constraint if exists questions_request_kind_check;
alter table public.questions add constraint questions_request_kind_check
  check (request_kind in ('pregunta', 'actualizar_guia', 'nuevo_club', 'cambio_info'));

grant insert (author_id, area, title, body, image_url, request_kind, target_guide_id)
  on public.questions to authenticated;

insert into public.system_settings (key, value_int, label)
values ('club_claim_inactivity_days', 7, 'Días sin actividad del proponente para permitir reclamar una propuesta con 20+ votos')
on conflict (key) do nothing;

-- 2. Helpers de permisos por tipo de club, espacios y foro
create or replace function private.can_manage_club_kind(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or (p_kind = 'academico' and (private.can_manage_area('subdireccion_academica') or private.can_manage_area('clubes_academicos')))
      or (p_kind in ('cultural', 'deportivo') and private.can_manage_area('clubes_culturales'));
$$;
revoke all on function private.can_manage_club_kind(text) from public;
grant execute on function private.can_manage_club_kind(text) to anon, authenticated;

create or replace function private.can_review_club_proposal(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or exists (
        select 1 from public.club_proposals p
         where p.id = p_proposal_id
           and (
             p.proposer_id = (select auth.uid())
             or private.can_manage_club_kind(p.kind)
           )
      );
$$;
revoke all on function private.can_review_club_proposal(uuid) from public;
grant execute on function private.can_review_club_proposal(uuid) to authenticated;

create or replace function private.is_proposal_participant(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_proposals p
     where p.id = p_proposal_id
       and p.status in ('en_documentacion', 'en_validacion', 'cita_pendiente', 'incompleta')
       and (
         p.proposer_id = (select auth.uid())
         or exists (
           select 1 from public.club_interests i
            where i.proposal_id = p.id and i.user_id = (select auth.uid())
         )
       )
  );
$$;
revoke all on function private.is_proposal_participant(uuid) from public;
grant execute on function private.is_proposal_participant(uuid) to authenticated;

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

-- 3. Flujo de código por correo al profesor coordinador y registro formal de nuevo club
create or replace function public.request_club_advisor_code(
  p_proposal_id uuid,
  p_advisor_email text,
  p_code text
)
returns table (advisor_id uuid, advisor_name text, advisor_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_email text := lower(trim(coalesce(p_advisor_email, '')));
  threshold integer := 20;
  prop public.club_proposals%rowtype;
  found_advisor_id uuid;
  found_advisor_name text;
  expiry timestamptz := now() + interval '24 hours';
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  if clean_email !~ '^[^@]+@ipn[.]mx$' or clean_email ~ '^[^@]+@alumno[.]ipn[.]mx$' then
    raise exception 'Ingresa el correo institucional @ipn.mx de un profesor';
  end if;
  if p_code is null or length(trim(p_code)) <> 6 then
    raise exception 'El código debe tener seis caracteres';
  end if;

  select coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20)
    into threshold;

  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or prop.proposer_id <> actor_id then
    raise exception 'Solo quien propone la iniciativa puede solicitar el código al profesor coordinador';
  end if;
  if prop.status not in ('en_documentacion', 'incompleta') or prop.advisor_confirmed_at is not null then
    raise exception 'Esta propuesta no se encuentra esperando confirmación de profesor coordinador';
  end if;
  if (select count(*) from public.club_interests i where i.proposal_id = p_proposal_id) < threshold then
    raise exception 'La propuesta aún no alcanza la meta de votos requerida';
  end if;

  select u.id, u.name
    into found_advisor_id, found_advisor_name
    from public.users u
    join private.user_private up on up.user_id = u.id
   where lower(up.email) = clean_email
     and u.role = 'profesor'
     and u.is_active
     and not u.banned
   limit 1;

  if found_advisor_id is null then
    raise exception 'No encontramos un profesor activo con ese correo institucional @ipn.mx';
  end if;

  insert into private.club_advisor_codes (proposal_id, advisor_id, code_hash, expires_at, attempts, verified_at)
  values (p_proposal_id, found_advisor_id, extensions.digest(upper(trim(p_code)), 'sha256'), expiry, 0, null)
  on conflict (proposal_id) do update
    set advisor_id = excluded.advisor_id,
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        verified_at = null,
        created_at = now();

  update public.club_proposals
     set pending_advisor_id = found_advisor_id,
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  perform private.notify_user(
    found_advisor_id,
    'clubes',
    'Solicitud para coordinar club: ' || prop.name,
    'Se envió un código de confirmación a tu correo institucional (' || clean_email || '). Si aceptas coordinar este club, compártelo con el alumno proponente.',
    '/clubes/propuestas/' || p_proposal_id::text,
    'alta'
  );

  return query select found_advisor_id, found_advisor_name, clean_email;
end;
$$;
revoke all on function public.request_club_advisor_code(uuid, text, text) from public, anon;
grant execute on function public.request_club_advisor_code(uuid, text, text) to authenticated;

create or replace function public.issue_club_advisor_code(p_proposal_id uuid, p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expiry timestamptz := now() + interval '24 hours';
  threshold integer := 20;
begin
  if not private.is_active_actor() or not exists (
    select 1 from public.users u where u.id = actor_id and u.role = 'profesor'
  ) then
    raise exception 'Solo un profesor activo puede confirmar asesoría';
  end if;
  if p_code is null or length(trim(p_code)) < 6 or length(trim(p_code)) > 64 then
    raise exception 'El código debe tener entre 6 y 64 caracteres';
  end if;
  select coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20)
    into threshold;
  if not exists (
    select 1 from public.club_proposals p
     where p.id = p_proposal_id and p.status in ('en_documentacion', 'incompleta')
       and (select count(*) from public.club_interests i where i.proposal_id = p.id) >= threshold
       and p.advisor_confirmed_at is null
  ) then
    raise exception 'La propuesta aún no está lista para confirmar asesoría';
  end if;
  insert into private.club_advisor_codes (proposal_id, advisor_id, code_hash, expires_at, attempts, verified_at)
  values (p_proposal_id, actor_id, extensions.digest(upper(trim(p_code)), 'sha256'), expiry, 0, null)
  on conflict (proposal_id) do update
    set advisor_id = excluded.advisor_id,
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        verified_at = null,
        created_at = now();
  update public.club_proposals
     set pending_advisor_id = actor_id,
         updated_at = now()
   where id = p_proposal_id;
  return expiry;
end;
$$;

create or replace function public.verify_club_advisor_code(p_proposal_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  stored private.club_advisor_codes%rowtype;
begin
  if not private.is_active_actor() or not exists (
    select 1 from public.club_proposals p where p.id = p_proposal_id and p.proposer_id = actor_id
  ) then
    return false;
  end if;
  select * into stored from private.club_advisor_codes c
   where c.proposal_id = p_proposal_id for update;
  if not found or stored.expires_at <= now() or stored.attempts >= 5 or stored.verified_at is not null then
    return false;
  end if;
  if stored.code_hash <> extensions.digest(upper(trim(coalesce(p_code, ''))), 'sha256') then
    update private.club_advisor_codes
       set attempts = least(attempts + 1, 5)
     where proposal_id = p_proposal_id;
    return false;
  end if;
  update private.club_advisor_codes set verified_at = now() where proposal_id = p_proposal_id;
  update public.club_proposals
     set advisor_id = stored.advisor_id,
         pending_advisor_id = null,
         advisor_confirmed_at = now(),
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id and proposer_id = actor_id;
  return found;
end;
$$;

create or replace function public.submit_formal_club_request(
  p_proposal_id uuid,
  p_objectives text,
  p_schedule_plan text,
  p_community_impact text,
  p_slots jsonb
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
    raise exception 'Solo quien propone la iniciativa puede enviar el registro formal';
  end if;
  if prop.status not in ('en_documentacion', 'en_validacion', 'incompleta') then
    raise exception 'Esta solicitud ya fue enviada o cerrada';
  end if;
  if length(trim(coalesce(p_schedule_plan, ''))) < 10 then
    raise exception 'Describe las actividades a realizar del club (mínimo 10 caracteres)';
  end if;
  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_slots, '[]'::jsonb)) < 1 then
    raise exception 'Indica al menos una fecha y hora tentativa para la cita';
  end if;

  update public.club_proposals
     set objectives = trim(coalesce(p_objectives, objectives)),
         schedule_plan = trim(coalesce(p_schedule_plan, schedule_plan)),
         community_impact = trim(coalesce(p_community_impact, community_impact)),
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  if not private.club_proposal_ready_for_appointment(p_proposal_id) then
    raise exception 'Faltan requisitos para el registro formal: 20 interesados, documentos completos de cada participante, profesor coordinador confirmado y actividades a realizar';
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
      'El proponente envió el registro formal del club y solicitó cita con la coordinación correspondiente.',
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
      'Reúne los 20 votos, documentos de integrantes, actividades a realizar y profesor coordinador confirmado. Lista para revisar y agendar cita.',
      '/clubes/propuestas/' || p_proposal_id::text,
      'alta'
    );
  end loop;

  return appointment_id;
end;
$$;
revoke all on function public.submit_formal_club_request(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_formal_club_request(uuid, text, text, text, jsonb) to authenticated;

create or replace function private.mark_club_appointment_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.club_proposal_ready_for_appointment(new.proposal_id) then
    raise exception 'La propuesta aún no cumple los requisitos para solicitar cita';
  end if;
  update public.club_proposals
     set status = 'cita_pendiente',
         formal_submitted_at = coalesce(formal_submitted_at, now()),
         updated_at = now()
   where id = new.proposal_id
     and proposer_id = new.requested_by
     and status in ('en_documentacion', 'en_validacion', 'incompleta', 'cita_pendiente');
  if not found then
    raise exception 'La propuesta no está lista para solicitar cita';
  end if;
  return new;
end;
$$;

-- Actualizar claim_inactive_club_proposal para leer club_claim_inactivity_days
create or replace function public.claim_inactive_club_proposal(p_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prop public.club_proposals%rowtype;
  inactivity_days integer := 7;
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  select coalesce((select value_int from public.system_settings where key = 'club_claim_inactivity_days'), 7)
    into inactivity_days;

  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or prop.status in ('registrado', 'rechazada') or prop.proposer_id = actor_id then
    return false;
  end if;
  if prop.last_proposer_activity_at > now() - (inactivity_days::text || ' days')::interval then
    raise exception 'El proponente aún está dentro del plazo activo de % días', inactivity_days;
  end if;
  if not exists (select 1 from public.club_interests where proposal_id = p_proposal_id and user_id = actor_id) then
    raise exception 'Solo una persona que ya marcó interés en la propuesta puede tomar su seguimiento';
  end if;

  update public.club_proposals
     set proposer_id = actor_id,
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  perform private.notify_user(
    prop.proposer_id,
    'clubes',
    'Seguimiento de propuesta transferido por inactividad',
    'Otra persona interesada retomó el seguimiento de «' || prop.name || '» tras ' || inactivity_days || ' días sin actividad.',
    '/clubes/propuestas/' || p_proposal_id::text,
    'alta'
  );
  return true;
end;
$$;

-- 4. Políticas RLS para propuestas, documentos, citas y control total de clubes por área
drop policy if exists club_proposals_owner_or_reviewer_update on public.club_proposals;
drop policy if exists club_proposals_reviewer_update on public.club_proposals;
create policy club_proposals_owner_or_reviewer_update on public.club_proposals
for update to authenticated using (
  proposer_id = (select auth.uid())
  or private.can_manage_club_kind(kind)
) with check (
  proposer_id = (select auth.uid())
  or private.can_manage_club_kind(kind)
);

drop policy if exists club_docs_subdirection_review on public.club_proposal_documents;
create policy club_docs_subdirection_review on public.club_proposal_documents
for update to authenticated using (
  exists (
    select 1 from public.club_proposals p
     where p.id = proposal_id and private.can_manage_club_kind(p.kind)
  )
) with check (
  exists (
    select 1 from public.club_proposals p
     where p.id = proposal_id and private.can_manage_club_kind(p.kind)
  )
);

drop policy if exists club_appointments_owner_or_reviewer_read on public.club_appointments;
create policy club_appointments_owner_or_reviewer_read on public.club_appointments
for select to authenticated using (
  requested_by = (select auth.uid())
  or exists (
    select 1 from public.club_proposals p
     where p.id = proposal_id
       and (p.advisor_id = (select auth.uid()) or private.can_manage_club_kind(p.kind))
  )
);

drop policy if exists club_appointments_subdirection_confirm on public.club_appointments;
create policy club_appointments_subdirection_confirm on public.club_appointments
for update to authenticated using (
  exists (
    select 1 from public.club_proposals p
     where p.id = proposal_id and private.can_manage_club_kind(p.kind)
  )
) with check (
  exists (
    select 1 from public.club_proposals p
     where p.id = proposal_id and private.can_manage_club_kind(p.kind)
  )
);

drop policy if exists clubs_active_public_read on public.clubs;
create policy clubs_active_public_read on public.clubs
for select to anon, authenticated using (
  active
  or private.can_manage_club_kind(kind)
  or leader_id = (select auth.uid())
  or advisor_id = (select auth.uid())
);

drop policy if exists clubs_academic_area_insert on public.clubs;
drop policy if exists clubs_area_insert on public.clubs;
create policy clubs_area_insert on public.clubs
for insert to authenticated with check (
  private.can_manage_club_kind(kind)
);

drop policy if exists clubs_area_or_manager_update on public.clubs;
drop policy if exists clubs_academic_area_update on public.clubs;
create policy clubs_area_or_manager_update on public.clubs
for update to authenticated using (
  private.can_manage_club_kind(kind)
  or private.can_publish_club(id)
) with check (
  private.can_manage_club_kind(kind)
  or private.can_publish_club(id)
);

drop policy if exists clubs_admin_delete on public.clubs;
create policy clubs_area_delete on public.clubs
for delete to authenticated using (
  private.can_manage_club_kind(kind)
);

drop policy if exists memberships_own_or_reviewer_read on public.memberships;
drop policy if exists memberships_advisor_read on public.memberships;
create policy memberships_own_or_reviewer_read on public.memberships
for select to authenticated using (
  user_id = (select auth.uid())
  or private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
);

drop policy if exists memberships_manager_review on public.memberships;
create policy memberships_manager_review on public.memberships
for update to authenticated using (
  private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
) with check (
  private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
);

drop policy if exists memberships_owner_delete on public.memberships;
create policy memberships_owner_or_manager_delete on public.memberships
for delete to authenticated using (
  user_id = (select auth.uid())
  or private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
);

drop policy if exists club_posts_managers_insert on public.club_posts;
create policy club_posts_managers_insert on public.club_posts
for insert to authenticated with check (
  author_id = (select auth.uid())
  and (
    private.can_publish_club(club_id)
    or exists (
      select 1 from public.clubs c
       where c.id = club_id and private.can_manage_club_kind(c.kind)
    )
  )
);

drop policy if exists club_posts_manager_update on public.club_posts;
create policy club_posts_manager_update on public.club_posts
for update to authenticated using (
  (author_id = (select auth.uid()) and private.can_publish_club(club_id))
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
) with check (
  (author_id = (select auth.uid()) and private.can_publish_club(club_id))
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
);

drop policy if exists club_posts_author_or_moderator_delete on public.club_posts;
create policy club_posts_manager_delete on public.club_posts
for delete to authenticated using (
  private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
);

drop policy if exists club_events_public_or_manager_read on public.club_events;
create policy club_events_public_or_manager_read on public.club_events
for select to anon, authenticated using (
  approval_status = 'aprobado'
  or created_by = (select auth.uid())
  or private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
);

drop policy if exists club_events_member_submit on public.club_events;
create policy club_events_member_submit on public.club_events
for insert to authenticated with check (
  created_by = (select auth.uid())
  and private.is_active_actor()
  and (
    (approval_status = 'pendiente' and (private.is_club_member(club_id) or private.can_publish_club(club_id)))
    or (
      exists (
        select 1 from public.clubs c
         where c.id = club_id and private.can_manage_club_kind(c.kind)
      )
      and (approval_status = 'pendiente' or (approval_status = 'aprobado' and approved_by = (select auth.uid())))
    )
  )
);

drop policy if exists club_events_staff_approve on public.club_events;
create policy club_events_staff_approve on public.club_events
for update to authenticated using (
  private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
) with check (
  (
    exists (
      select 1 from public.clubs c
       where c.id = club_id and private.can_manage_club_kind(c.kind)
    )
    and (approval_status <> 'aprobado' or approved_by = (select auth.uid()))
  )
  or (private.can_publish_club(club_id) and approval_status = 'pendiente')
);

drop policy if exists club_events_manager_delete on public.club_events;
create policy club_events_manager_delete on public.club_events
for delete to authenticated using (
  private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_id and private.can_manage_club_kind(c.kind)
  )
);

-- RPC para consultar correos de contacto de moderadores del club (para integrantes, moderadores y área)
create or replace function public.get_club_contact_directory(p_club_id uuid)
returns table (
  leader_name text,
  leader_email text,
  advisor_name text,
  advisor_email text,
  advisor_room text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ul.name as leader_name,
    pl.email as leader_email,
    ua.name as advisor_name,
    pa.email as advisor_email,
    coalesce(
      nullif(trim(cub.label || ' · ' || cub.building || coalesce(' · Piso ' || cub.floor, '')), ''),
      mr.room_code
    ) as advisor_room
  from public.clubs c
  left join public.users ul on ul.id = c.leader_id
  left join private.user_private pl on pl.user_id = c.leader_id
  left join public.users ua on ua.id = c.advisor_id
  left join private.user_private pa on pa.user_id = c.advisor_id
  left join public.cubicles cub on cub.professor_id = c.advisor_id
  left join lateral (
    select mp.room_code
      from public.map_room_people mp
     where mp.id = c.advisor_id
     limit 1
  ) mr on true
  where c.id = p_club_id
    and (
      private.is_club_member(p_club_id)
      or private.can_manage_club_kind(c.kind)
    );
$$;
revoke all on function public.get_club_contact_directory(uuid) from public, anon;
grant execute on function public.get_club_contact_directory(uuid) to authenticated;

-- 5. Espacios y Eventos: Sala 14 para Subdirección Académica y Auditorio para Becas
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
             (private.can_manage_area('subdireccion_academica') and lower(s.name) = 'sala 14')
             or (private.can_manage_area('becas') and lower(s.name) = 'auditorio')
             or private.can_manage_area('clubes_academicos')
             or private.can_manage_area('clubes_culturales')
           )
      );
$$;
revoke all on function private.can_manage_space_event(uuid) from public;
grant execute on function private.can_manage_space_event(uuid) to authenticated;

drop policy if exists space_events_approved_read on public.space_events;
create policy space_events_approved_read on public.space_events
for select to anon, authenticated
using (
  (approval_status = 'aprobado' and is_public = true)
  or created_by = (select auth.uid())
  or private.can_manage_space_event(space_id)
);

drop policy if exists space_events_staff_publish on public.space_events;
create policy space_events_staff_publish on public.space_events
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and approval_status = 'aprobado'
  and authorized_by = (select auth.uid())
  and private.can_manage_space_event(space_id)
);

drop policy if exists space_events_staff_review on public.space_events;
create policy space_events_staff_review on public.space_events
for update to authenticated
using (private.can_manage_space_event(space_id))
with check (private.can_manage_space_event(space_id));

drop policy if exists space_events_staff_delete on public.space_events;
create policy space_events_staff_delete on public.space_events
for delete to authenticated
using (private.can_manage_space_event(space_id));

-- 6. Foro: permisos y notificaciones por área + tipo de solicitud
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
      ))
      or (p_request_kind = 'nuevo_club' and (
        private.can_manage_area('subdireccion_academica')
        or private.can_manage_area('clubes_academicos')
        or private.can_manage_area('clubes_culturales')
      ))
      or (p_area = 'infraestructura' and (
        private.can_manage_area('prefectura')
        or private.can_manage_area('subdireccion_academica')
      ))
      or (p_request_kind = 'cambio_info' and (
        private.can_manage_area('prefectura')
        or private.can_manage_area('subdireccion_academica')
      ));
$$;
revoke all on function private.can_manage_forum_question(text, text) from public;
grant execute on function private.can_manage_forum_question(text, text) to authenticated;

drop policy if exists questions_area_update on public.questions;
create policy questions_area_update on public.questions
for update to authenticated
using (private.can_manage_forum_question(area, request_kind))
with check (private.can_manage_forum_question(area, request_kind));

drop policy if exists questions_area_delete on public.questions;
create policy questions_area_delete on public.questions
for delete to authenticated
using (private.can_manage_forum_question(area, request_kind));

drop policy if exists answers_active_user_insert on public.answers;
create policy answers_active_user_insert on public.answers
for insert to authenticated with check (
  author_id = (select auth.uid()) and private.is_active_actor()
  and (not official or exists (
    select 1 from public.questions q
     where q.id = question_id and private.can_manage_forum_question(q.area, q.request_kind)
  ))
);

drop policy if exists answers_area_update on public.answers;
create policy answers_area_update on public.answers
for update to authenticated using (exists (
  select 1 from public.questions q
   where q.id = question_id and private.can_manage_forum_question(q.area, q.request_kind)
)) with check (exists (
  select 1 from public.questions q
   where q.id = question_id and private.can_manage_forum_question(q.area, q.request_kind)
));

create or replace function private.after_forum_question_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mod_row record;
begin
  for mod_row in
    select distinct u.id
      from public.users u
     where u.is_active and not u.banned
       and u.id <> new.author_id
       and (
         u.role = 'admin'
         or (u.role = 'moderador' and u.area = new.area)
         or (new.area = 'clubes' and u.role = 'moderador' and u.area in ('subdireccion_academica', 'clubes_academicos', 'clubes_culturales'))
         or (new.request_kind = 'nuevo_club' and u.role = 'moderador' and u.area in ('subdireccion_academica', 'clubes_academicos', 'clubes_culturales'))
         or (new.area = 'infraestructura' and u.role = 'moderador' and u.area in ('prefectura', 'subdireccion_academica'))
         or (new.request_kind = 'cambio_info' and u.role = 'moderador' and u.area in ('prefectura', 'subdireccion_academica'))
       )
  loop
    perform private.notify_user(
      mod_row.id,
      'foro',
      case new.request_kind
        when 'actualizar_guia' then 'Solicitud para actualizar guía (' || new.area || ')'
        when 'nuevo_club' then 'Solicitud de nuevo club en el foro'
        when 'cambio_info' then 'Solicitud de cambio de información / cubículo'
        else 'Nueva pregunta en ' || new.area
      end,
      new.title,
      '/foro?duda=' || new.id::text || '#duda-' || new.id::text,
      'normal'
    );
  end loop;
  return new;
end;
$$;
