-- Auditoría integral multi-módulo: Auth/RBAC, Clubes, Guías/Foro, Eventos/Mapa y Objetos Perdidos P2P

create extension if not exists unaccent with schema extensions;

-- 1. Realtime: incluir guías y sugerencias para reflejar cambios en vivo en /foro y /guias/[id]
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['guides', 'guide_suggestions'] loop
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

-- 2. Eliminar firmas duplicadas previas (sobrecargas PostgREST) y ajustar privilegios excesivos
drop function if exists public.create_lost_item(text, text, text, text, text, text, text);
drop function if exists public.create_lost_item(text, text, text, text, text, text, text, text);
drop function if exists public.submit_lost_item_claim(uuid, text, text);
drop function if exists public.submit_lost_item_claim(uuid, text, text, text);
drop function if exists public.resubmit_club_membership(uuid);
drop function if exists public.resubmit_club_membership(uuid, text);

revoke all on function public.trigger_scheduled_avisos() from public, anon;
grant execute on function public.trigger_scheduled_avisos() to authenticated;

-- Evitar abuso directo vía RPC de notificaciones entre cuentas arbitrarias
revoke all on function public.notify_user_event(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_area_moderators(text, text, text, text, text) from public, anon, authenticated;

-- 3. Registro, boleta única y protección administrativa
create or replace function public.check_registration_availability(p_boleta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nullif(trim(coalesce(p_boleta, '')), '') is null then true
    else not exists (
      select 1 from private.user_private up
       where lower(trim(up.boleta)) = lower(trim(p_boleta))
    )
  end;
$$;
revoke all on function public.check_registration_availability(text) from public;
grant execute on function public.check_registration_availability(text) to anon, authenticated;

create or replace function public.admin_set_user_banned(p_user_id uuid, p_banned boolean)
returns table (name text, banned boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not private.is_admin_actor() then
    raise exception 'Solo administración puede cambiar el veto';
  end if;
  if p_user_id = actor_id then
    raise exception 'No puedes vetar ni deshabilitar tu propia cuenta';
  end if;
  update public.users u
     set admin_banned = p_banned,
         banned = p_banned or exists (
           select 1 from public.moderation_suspensions s
            where s.user_id = u.id and s.is_permanent
         )
   where u.id = p_user_id
     and not u.is_superadmin
     and u.role <> 'admin'
   returning u.name, u.banned into name, banned;
  if not found then
    return;
  end if;
  return next;
end;
$$;
revoke all on function public.admin_set_user_banned(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_banned(uuid, boolean) to authenticated;

-- 4. Moderación: aislar áreas, impedir que oficinas o moderadores sancionen a otro staff/moderador
create or replace function public.register_moderation_strike(
  p_user_id uuid, p_area text, p_reason text, p_source_type text
)
returns table (strike_id uuid, strike_total integer, suspension_id uuid, target_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role;
  target_role public.user_role;
  inserted_id uuid;
  total integer;
  created_suspension uuid;
  person_name text;
begin
  if not private.is_active_actor() or not private.can_manage_area(p_area) or exists (
    select 1 from public.users u where u.id = actor_id and u.role = 'moderador'
      and u.area in ('becas', 'catt', 'gestion_escolar', 'subdireccion_academica')
  ) then
    raise exception 'No tienes permiso para moderar esta área';
  end if;
  if p_user_id = actor_id or length(trim(coalesce(p_reason, ''))) < 8
     or length(p_reason) > 1000 or coalesce(p_source_type, '') not in ('foro', 'guia', 'aviso', 'club', 'objeto', 'otro') then
    raise exception 'Los datos de la infracción no son válidos';
  end if;
  select u.role, u.name into target_role, person_name
    from public.users u
   where u.id = p_user_id and u.is_active and u.role <> 'admin';
  if not found then
    raise exception 'No encontramos a la persona o no se puede sancionar esa cuenta';
  end if;
  select u.role into actor_role from public.users u where u.id = actor_id;
  if actor_role = 'moderador' and target_role = 'moderador' then
    raise exception 'Solo administración general puede sancionar cuentas de moderación';
  end if;

  insert into public.moderation_strikes (user_id, moderator_id, area, reason, source_type)
  values (p_user_id, actor_id, p_area, trim(p_reason), p_source_type)
  returning id into inserted_id;

  select count(*)::integer into total
    from public.moderation_strikes ms where ms.user_id = p_user_id;
  select s.id into created_suspension
    from public.moderation_suspensions s
   where s.user_id = p_user_id and s.strike_count = total
   order by s.created_at desc limit 1;

  insert into public.notifications (user_id, title, body, href)
  values (
    p_user_id,
    case when created_suspension is null then 'Infracción registrada' else 'Nueva suspensión' end,
    case when created_suspension is null
      then 'Se registró una infracción en tu cuenta. Puedes revisar los detalles en Apelaciones.'
      else 'Esta infracción activó una suspensión. Consulta el motivo y presenta una apelación en la plataforma.'
    end,
    '/apelaciones'
  );

  return query select inserted_id, total, created_suspension, person_name;
end;
$$;
revoke all on function public.register_moderation_strike(uuid, text, text, text) from public, anon;
grant execute on function public.register_moderation_strike(uuid, text, text, text) to authenticated;

drop policy if exists moderation_strikes_area_insert on public.moderation_strikes;
create policy moderation_strikes_area_insert on public.moderation_strikes
for insert to authenticated with check (
  moderator_id = (select auth.uid())
  and private.is_active_actor()
  and private.can_manage_area(area)
  and (
    private.is_admin_actor()
    or (
      not exists (
        select 1 from public.users me
         where me.id = (select auth.uid())
           and me.role = 'moderador'
           and me.area in ('becas', 'catt', 'gestion_escolar', 'subdireccion_academica')
      )
      and exists (
        select 1 from public.users target
         where target.id = moderation_strikes.user_id
           and target.role in ('alumno', 'profesor')
           and target.is_active
      )
    )
  )
);

-- 5. Foro/Insignias: otorgar insignia oficial también cuando la respuesta nace oficial en INSERT
create or replace function private.after_forum_answer_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  question_row public.questions%rowtype;
begin
  if new.official and (tg_op = 'INSERT' or not old.official) then
    select * into question_row from public.questions where id = new.question_id;
    update public.questions set status = 'respondida', updated_at = now()
     where id = new.question_id and status <> 'cerrada';
    if tg_op = 'UPDATE' and question_row.author_id <> new.author_id then
      perform private.notify_user(
        question_row.author_id,
        'foro',
        'Respuesta validada como oficial',
        'Una respuesta en «' || question_row.title || '» fue validada oficialmente por el área.',
        '/foro?duda=' || new.question_id::text || '#duda-' || new.question_id::text,
        'alta'
      );
    end if;
    perform private.award_badge(new.author_id, 'respuesta_oficial_validada', 'Respuesta avalada por el área');
  end if;
  return new;
end;
$$;

drop trigger if exists forum_answer_official_update on public.answers;
create trigger forum_answer_official_update
after insert or update on public.answers
for each row execute function private.after_forum_answer_update();

-- 6. Clubes: privacidad de publicaciones internas (CU-20), filtros de entrada, votantes y trámite completo
alter table public.clubs
  add column if not exists join_questions jsonb not null default '[]'::jsonb;

alter table public.memberships
  add column if not exists application_answers jsonb not null default '[]'::jsonb;

alter table public.club_proposals
  add column if not exists docs_ready_notified_at timestamptz;

alter table public.club_appointments
  add column if not exists meeting_mode text not null default 'presencial',
  add column if not exists meeting_location text,
  add column if not exists advisor_confirmed_at timestamptz,
  add column if not exists advisor_note text,
  add column if not exists proposer_confirmed_at timestamptz;

alter table public.club_appointments drop constraint if exists club_appointments_meeting_mode_check;
alter table public.club_appointments add constraint club_appointments_meeting_mode_check check (
  meeting_mode in ('presencial', 'en_linea')
);

-- Restaurar privacidad real de club_posts (integrantes aceptados, gestor del club o área encargada)
drop policy if exists club_posts_member_read on public.club_posts;
create policy club_posts_member_read on public.club_posts
for select to authenticated using (
  private.is_club_member(club_id)
  or private.can_publish_club(club_id)
  or exists (
    select 1 from public.clubs c
     where c.id = club_posts.club_id
       and private.can_manage_club_kind(c.kind)
  )
);

-- Blindar columnas sensibles de club_proposals y clubs contra manipulación directa vía PostgREST
create or replace function private.guard_club_proposal_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not private.can_manage_club_kind(old.kind) then
    if new.proposer_id is distinct from old.proposer_id
       or new.status is distinct from old.status
       or new.interested_count is distinct from old.interested_count
       or new.advisor_id is distinct from old.advisor_id
       or new.advisor_confirmed_at is distinct from old.advisor_confirmed_at
       or new.pending_advisor_id is distinct from old.pending_advisor_id
       or new.formal_submitted_at is distinct from old.formal_submitted_at
       or new.review_observations is distinct from old.review_observations
       or new.kind is distinct from old.kind then
      raise exception 'No tienes permiso para modificar directamente el estado o validación de la propuesta';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_club_proposal_write() from public, anon, authenticated;

drop trigger if exists trg_guard_club_proposal_write on public.club_proposals;
create trigger trg_guard_club_proposal_write
before update on public.club_proposals
for each row execute function private.guard_club_proposal_write();

create or replace function private.guard_club_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not private.can_manage_club_kind(old.kind) then
    if new.leader_id is distinct from old.leader_id
       or new.advisor_id is distinct from old.advisor_id
       or new.kind is distinct from old.kind
       or new.active is distinct from old.active
       or new.proposal_id is distinct from old.proposal_id then
      raise exception 'Solo el área encargada puede reasignar liderazgo, tipo o vigencia del club';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_club_write() from public, anon, authenticated;

drop trigger if exists trg_guard_club_write on public.clubs;
create trigger trg_guard_club_write
before update on public.clubs
for each row execute function private.guard_club_write();

-- Solo alumnos activos pueden proponer clubes, votar intereses o pedir membresía estudiantil
drop policy if exists club_proposals_owner_insert on public.club_proposals;
create policy club_proposals_owner_insert on public.club_proposals
for insert to authenticated with check (
  proposer_id = (select auth.uid())
  and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'alumno')
  and status = 'abierta'
  and advisor_id is null
  and advisor_confirmed_at is null
  and interested_count = 0
);

drop policy if exists club_interests_owner_insert on public.club_interests;
create policy club_interests_owner_insert on public.club_interests
for insert to authenticated with check (
  user_id = (select auth.uid())
  and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'alumno')
  and exists (
    select 1 from public.club_proposals p
     where p.id = proposal_id
       and p.proposer_id <> (select auth.uid())
       and p.status in ('abierta', 'en_documentacion', 'en_validacion')
  )
);

drop policy if exists club_interests_owner_delete on public.club_interests;
create policy club_interests_owner_delete on public.club_interests
for delete to authenticated using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.club_proposals p
     where p.id = proposal_id
       and p.status in ('abierta', 'en_documentacion', 'en_validacion', 'incompleta')
  )
);

drop policy if exists memberships_owner_insert on public.memberships;
create policy memberships_owner_insert on public.memberships
for insert to authenticated with check (
  user_id = (select auth.uid())
  and status = 'pendiente'
  and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'alumno')
  and exists (select 1 from public.clubs c where c.id = club_id and c.active)
);

create or replace function public.resubmit_club_membership(
  p_club_id uuid,
  p_note text default null,
  p_answers jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not private.is_active_actor() then return false; end if;
  if not exists (select 1 from public.users u where u.id = actor_id and u.role = 'alumno') then
    return false;
  end if;
  update public.memberships
     set status = 'pendiente',
         application_note = coalesce(nullif(trim(p_note), ''), application_note),
         application_answers = coalesce(p_answers, application_answers, '[]'::jsonb),
         updated_at = now()
   where club_id = p_club_id
     and user_id = actor_id
     and status = 'rechazada'
     and exists (select 1 from public.clubs c where c.id = p_club_id and c.active);
  return found;
end;
$$;
revoke all on function public.resubmit_club_membership(uuid, text, jsonb) from public, anon;
grant execute on function public.resubmit_club_membership(uuid, text, jsonb) to authenticated;

-- Helper de lectura de dossier para asesor (invitado o confirmado), proponente y staff
create or replace function private.can_view_proposal_dossier(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_review_club_proposal(p_proposal_id)
      or exists (
        select 1 from public.club_proposals p
         where p.id = p_proposal_id
           and (p.advisor_id = (select auth.uid()) or p.pending_advisor_id = (select auth.uid()))
      );
$$;
revoke all on function private.can_view_proposal_dossier(uuid) from public;
grant execute on function private.can_view_proposal_dossier(uuid) to authenticated;

-- Actualizar políticas de lectura para que el asesor también pueda consultar expediente e intereses
drop policy if exists club_interests_own_or_club_moderator_read on public.club_interests;
create policy club_interests_own_or_club_moderator_read on public.club_interests
for select to authenticated using (
  user_id = (select auth.uid())
  or private.can_view_proposal_dossier(proposal_id)
  or exists (
    select 1 from public.club_proposals p where p.id = proposal_id and p.proposer_id = (select auth.uid())
  )
);

drop policy if exists club_participant_profiles_read on public.club_participant_profiles;
create policy club_participant_profiles_read on public.club_participant_profiles
for select to authenticated using (
  user_id = (select auth.uid())
  or private.can_view_proposal_dossier(proposal_id)
);

drop policy if exists club_docs_owner_or_reviewer_read on public.club_proposal_documents;
create policy club_docs_owner_or_reviewer_read on public.club_proposal_documents
for select to authenticated using (
  user_id = (select auth.uid())
  or private.can_view_proposal_dossier(proposal_id)
);

-- Permitir al integrante reemplazar documentos equivocados antes de revisión final
drop policy if exists club_docs_owner_resubmit on public.club_proposal_documents;
create policy club_docs_owner_resubmit on public.club_proposal_documents
for update to authenticated using (
  user_id = (select auth.uid())
  and status in ('faltante', 'recibido', 'requiere_correccion')
  and private.is_active_actor()
  and exists (
    select 1 from public.club_proposals p
     where p.id = proposal_id
       and p.status in ('en_documentacion', 'en_validacion', 'incompleta')
       and (p.proposer_id = (select auth.uid()) or exists (
         select 1 from public.club_interests i where i.proposal_id = p.id and i.user_id = (select auth.uid())
       ))
  )
) with check (
  user_id = (select auth.uid())
  and status = 'recibido'
  and storage_path like proposal_id::text || '/' || (select auth.uid())::text || '/%'
  and private.is_active_actor()
);

-- Corregir storage policy por claridad y permitir reemplazo/re-subida de doc
drop policy if exists club_documents_owner_upload on storage.objects;
create policy club_documents_owner_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'club-documents'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_active_actor()
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1 from public.club_proposals p
     where p.id = ((storage.foldername(name))[1])::uuid
       and p.status in ('en_documentacion', 'en_validacion', 'cita_pendiente', 'incompleta')
       and (p.proposer_id = (select auth.uid()) or exists (
         select 1 from public.club_interests i where i.proposal_id = p.id and i.user_id = (select auth.uid())
       ))
  )
);

-- Actualizar helper is_proposal_participant para aceptar también estado 'incompleta'
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
grant execute on function private.is_proposal_participant(uuid) to authenticated;

-- Corregir conteo de progreso de documentos + carrera/teléfono
drop function if exists public.get_club_proposal_progress_summary();
create or replace function public.get_club_proposal_progress_summary()
returns table (
  proposal_id uuid,
  participants_count integer,
  participants_complete_docs integer,
  required_threshold integer,
  proposer_complete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20) as threshold
  ),
  participants as (
    select p.id as proposal_id, p.proposer_id as user_id, true as is_proposer
    from public.club_proposals p
    where p.status <> 'registrado'
    union all
    select ci.proposal_id, ci.user_id, false as is_proposer
    from public.club_interests ci
    join public.club_proposals p on p.id = ci.proposal_id
    where p.status <> 'registrado' and ci.user_id <> p.proposer_id
  ),
  doc_counts as (
    select
      pa.proposal_id,
      pa.user_id,
      pa.is_proposer,
      count(distinct d.document_type) filter (
        where d.document_type in ('credencial_ipn', 'boleta', 'firma', 'vigencia_ims')
          and d.status in ('recibido', 'validacion_presencial_pendiente')
      ) as valid_docs,
      exists (
        select 1 from public.club_participant_profiles cp
         where cp.proposal_id = pa.proposal_id
           and cp.user_id = pa.user_id
           and length(trim(coalesce(cp.career, ''))) >= 2
           and length(trim(coalesce(cp.phone, ''))) >= 8
      ) as has_profile
    from participants pa
    left join public.club_proposal_documents d
      on d.proposal_id = pa.proposal_id
     and d.user_id = pa.user_id
    group by pa.proposal_id, pa.user_id, pa.is_proposer
  )
  select
    dc.proposal_id,
    count(*)::integer as participants_count,
    count(*) filter (where dc.valid_docs >= 4 and dc.has_profile)::integer as participants_complete_docs,
    (select threshold from cfg)::integer as required_threshold,
    coalesce(bool_or(dc.is_proposer and dc.valid_docs >= 4 and dc.has_profile), false) as proposer_complete
  from doc_counts dc
  group by dc.proposal_id;
$$;
revoke all on function public.get_club_proposal_progress_summary() from public;
grant execute on function public.get_club_proposal_progress_summary() to anon, authenticated;

-- Helper: ¿Ya completaron docs y perfil el proponente + al menos `threshold` votantes (sin bloqueo por 1 votante extra inactivo)?
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
    select id, proposer_id from public.club_proposals where id = p_proposal_id
  ),
  voter_status as (
    select
      ci.user_id,
      (
        select count(distinct d.document_type)
          from public.club_proposal_documents d
         where d.proposal_id = p_proposal_id
           and d.user_id = ci.user_id
           and d.document_type in ('credencial_ipn', 'boleta', 'firma', 'vigencia_ims')
           and d.status in ('recibido', 'validacion_presencial_pendiente')
      ) >= 4
      and exists (
        select 1 from public.club_participant_profiles cp
         where cp.proposal_id = p_proposal_id and cp.user_id = ci.user_id
           and length(trim(coalesce(cp.career, ''))) >= 2
           and length(trim(coalesce(cp.phone, ''))) >= 8
      ) as is_complete
    from public.club_interests ci
    join prop p on p.id = ci.proposal_id
    where ci.user_id <> p.proposer_id
  ),
  proposer_status as (
    select
      (
        select count(distinct d.document_type)
          from public.club_proposal_documents d
         where d.proposal_id = p_proposal_id
           and d.user_id = p.proposer_id
           and d.document_type in ('credencial_ipn', 'boleta', 'firma', 'vigencia_ims')
           and d.status in ('recibido', 'validacion_presencial_pendiente')
      ) >= 4
      and exists (
        select 1 from public.club_participant_profiles cp
         where cp.proposal_id = p_proposal_id and cp.user_id = p.proposer_id
           and length(trim(coalesce(cp.career, ''))) >= 2
           and length(trim(coalesce(cp.phone, ''))) >= 8
      ) as is_complete
    from prop p
  )
  select coalesce((select is_complete from proposer_status), false)
     and (select count(*) from voter_status) >= (select threshold from cfg)
     and (select count(*) filter (where is_complete) from voter_status) >= (select threshold from cfg);
$$;
revoke all on function private.club_proposal_docs_ready(uuid) from public;
grant execute on function private.club_proposal_docs_ready(uuid) to authenticated;

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
       and length(trim(coalesce(p.objectives, ''))) >= 10
       and length(trim(coalesce(p.schedule_plan, ''))) >= 10
       and length(trim(coalesce(p.activities_detail, ''))) >= 10
       and length(trim(coalesce(p.requested_spaces, ''))) >= 3
       and length(trim(coalesce(p.community_impact, ''))) >= 10
       and private.club_proposal_docs_ready(p.id)
  );
$$;
revoke all on function private.club_proposal_ready_for_appointment(uuid) from public;
grant execute on function private.club_proposal_ready_for_appointment(uuid) to authenticated;

-- Trigger: notificar al proponente en cuanto se completen los documentos de la meta de votantes + proponente
create or replace function private.notify_proposer_when_docs_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prop public.club_proposals%rowtype;
begin
  select * into prop from public.club_proposals where id = new.proposal_id for update;
  if not found or prop.docs_ready_notified_at is not null then
    return new;
  end if;
  if prop.status in ('en_documentacion', 'en_validacion', 'incompleta')
     and private.club_proposal_docs_ready(prop.id) then
    update public.club_proposals
       set docs_ready_notified_at = now(), updated_at = now()
     where id = prop.id;
    perform private.notify_user(
      prop.proposer_id,
      'clubes',
      'Documentos de integrantes completos: ' || prop.name,
      'Los votantes y tú completaron sus documentos y datos. Ya puedes llenar el registro formal y cronograma de actividades para enviarlo a Subdirección.',
      '/clubes/propuestas/' || prop.id::text || '#registro-formal',
      'alta'
    );
  end if;
  return new;
end;
$$;
revoke all on function private.notify_proposer_when_docs_ready() from public, anon, authenticated;

drop trigger if exists trg_notify_docs_ready_on_doc on public.club_proposal_documents;
create trigger trg_notify_docs_ready_on_doc
after insert or update on public.club_proposal_documents
for each row execute function private.notify_proposer_when_docs_ready();

drop trigger if exists trg_notify_docs_ready_on_profile on public.club_participant_profiles;
create trigger trg_notify_docs_ready_on_profile
after insert or update on public.club_participant_profiles
for each row execute function private.notify_proposer_when_docs_ready();

-- Sincronizar interested_count y promover automáticamente
create or replace function private.promote_club_proposal_at_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := coalesce(new.proposal_id, old.proposal_id);
  votes integer;
  threshold integer := 20;
  prop public.club_proposals%rowtype;
  voter record;
begin
  select count(*)::integer into votes
    from public.club_interests where proposal_id = target_id;

  select coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20)
    into threshold;

  select * into prop from public.club_proposals where id = target_id for update;
  if not found then
    return null;
  end if;

  update public.club_proposals
     set interested_count = votes,
         status = case
           when status = 'abierta' and votes >= threshold then 'en_documentacion'
           else status
         end,
         last_proposer_activity_at = case
           when status = 'abierta' and votes >= threshold then now()
           else last_proposer_activity_at
         end,
         updated_at = now()
   where id = target_id;

  if prop.status = 'abierta' and votes >= threshold then
    perform private.notify_user(
      prop.proposer_id,
      'clubes',
      'Tu propuesta alcanzó los ' || threshold || ' votos: ' || prop.name,
      'Ya alcanzaste el mínimo requerido. Consigue la confirmación de tu profesor asesor y pide a los votantes subir sus documentos para desbloquear el registro formal.',
      '/clubes/propuestas/' || target_id::text,
      'alta'
    );

    for voter in
      select distinct ci.user_id
        from public.club_interests ci
       where ci.proposal_id = target_id
         and ci.user_id <> prop.proposer_id
    loop
      perform private.notify_user(
        voter.user_id,
        'clubes',
        'Sube tus documentos para el club «' || prop.name || '»',
        'La propuesta que apoyaste alcanzó los ' || threshold || ' votos. Entra al sistema para completar tu carrera, teléfono y los 4 documentos requeridos.',
        '/clubes/propuestas/' || target_id::text || '#mis-documentos',
        'alta'
      );
    end loop;
  end if;

  return null;
end;
$$;

-- Helper para promover propuestas abiertas si admin reduce club_interest_threshold
create or replace function public.promote_eligible_club_proposals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  threshold integer := 20;
  prop record;
  promoted integer := 0;
  voter record;
begin
  if not private.is_admin_actor() then
    return 0;
  end if;
  select coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20)
    into threshold;
  for prop in
    select id, proposer_id, name from public.club_proposals
     where status = 'abierta' and interested_count >= threshold
     for update
  loop
    update public.club_proposals
       set status = 'en_documentacion', last_proposer_activity_at = now(), updated_at = now()
     where id = prop.id;
    promoted := promoted + 1;
    perform private.notify_user(
      prop.proposer_id, 'clubes',
      'Tu propuesta alcanzó los ' || threshold || ' votos: ' || prop.name,
      'La meta se actualizó. Ya puedes reunir documentos y profesor coordinador.',
      '/clubes/propuestas/' || prop.id::text, 'alta'
    );
    for voter in select distinct user_id from public.club_interests where proposal_id = prop.id and user_id <> prop.proposer_id loop
      perform private.notify_user(
        voter.user_id, 'clubes',
        'Sube tus documentos para el club «' || prop.name || '»',
        'La propuesta alcanzó la meta. Entra para completar tu carrera, teléfono y 4 documentos.',
        '/clubes/propuestas/' || prop.id::text || '#mis-documentos', 'alta'
      );
    end loop;
  end loop;
  return promoted;
end;
$$;
revoke all on function public.promote_eligible_club_proposals() from public, anon;
grant execute on function public.promote_eligible_club_proposals() to authenticated;

-- Impedir tomar el mando por inactividad mientras la propuesta sigue 'abierta' (antes de 20 votos)
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
  threshold integer := 20;
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  if not exists (select 1 from public.users u where u.id = actor_id and u.role = 'alumno') then
    raise exception 'Solo un alumno activo puede tomar el mando como moderador del club';
  end if;

  select coalesce((select value_int from public.system_settings where key = 'club_claim_inactivity_days'), 5) into inactivity_days;
  select coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20) into threshold;

  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or prop.status in ('abierta', 'cita_pendiente', 'cita_confirmada', 'registrado', 'rechazada')
     or prop.proposer_id = actor_id
     or prop.formal_submitted_at is not null
     or prop.interested_count < threshold then
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

-- Flujo de Profesor Asesor: evitar secuestro por cualquier docente y permitir confirmación directa sin depender solo de SMTP
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
  prop public.club_proposals%rowtype;
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
  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found
     or prop.status not in ('en_documentacion', 'en_validacion', 'incompleta')
     or prop.interested_count < threshold
     or prop.advisor_confirmed_at is not null then
    raise exception 'La propuesta aún no está lista para confirmar asesoría';
  end if;
  if prop.pending_advisor_id is not null and prop.pending_advisor_id <> actor_id then
    raise exception 'El proponente ya invitó a otro profesor para coordinar esta propuesta';
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
revoke all on function public.issue_club_advisor_code(uuid, text) from public, anon;
grant execute on function public.issue_club_advisor_code(uuid, text) to authenticated;

create or replace function public.verify_club_advisor_code(p_proposal_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  stored private.club_advisor_codes%rowtype;
  prop public.club_proposals%rowtype;
begin
  if not private.is_active_actor() then return false; end if;
  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or (prop.proposer_id <> actor_id and prop.pending_advisor_id <> actor_id) then
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
         status = case when status = 'en_documentacion' then 'en_validacion' else status end,
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  perform private.notify_user(
    prop.proposer_id, 'clubes',
    'Profesor coordinador confirmado: ' || prop.name,
    'El profesor coordinador validó su participación en tu propuesta de club.',
    '/clubes/propuestas/' || p_proposal_id::text, 'alta'
  );
  return true;
end;
$$;
revoke all on function public.verify_club_advisor_code(uuid, text) from public, anon;
grant execute on function public.verify_club_advisor_code(uuid, text) to authenticated;

-- Permitir al profesor invitado confirmar su asesoría directamente dentro de su sesión (respaldo si no llega SMTP)
create or replace function public.confirm_club_advisor_by_teacher(p_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prop public.club_proposals%rowtype;
  prof_name text;
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  select u.name into prof_name from public.users u where u.id = actor_id and u.role = 'profesor' and u.is_active and not u.banned;
  if not found then
    raise exception 'Solo un profesor activo puede confirmar asesoría';
  end if;
  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or prop.advisor_confirmed_at is not null or prop.pending_advisor_id <> actor_id then
    raise exception 'No tienes una invitación pendiente vigente para esta propuesta';
  end if;

  update private.club_advisor_codes
     set verified_at = now()
   where proposal_id = p_proposal_id and advisor_id = actor_id;

  update public.club_proposals
     set advisor_id = actor_id,
         pending_advisor_id = null,
         advisor_confirmed_at = now(),
         status = case when status = 'en_documentacion' then 'en_validacion' else status end,
         last_proposer_activity_at = now(),
         updated_at = now()
   where id = p_proposal_id;

  perform private.notify_user(
    prop.proposer_id, 'clubes',
    'Profesor asesor confirmado: ' || prop.name,
    prof_name || ' aceptó coordinar el club desde su cuenta institucional.',
    '/clubes/propuestas/' || p_proposal_id::text, 'alta'
  );
  return true;
end;
$$;
revoke all on function public.confirm_club_advisor_by_teacher(uuid) from public, anon;
grant execute on function public.confirm_club_advisor_by_teacher(uuid) to authenticated;

-- Envío formal: exige todos los campos del proyecto ejecutivo y cancela citas previas si hubo observación 'incompleta'
drop function if exists public.submit_formal_club_request(uuid, text, text, text, jsonb, text, text);
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

  -- Cancelar citas confirmadas antiguas si la propuesta había vuelto a estado incompleta
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

-- Listado seguro de padrón de participantes + boleta + carrera + teléfono + documentos para revisión
create or replace function public.get_proposal_roster_for_review(p_proposal_id uuid)
returns table (
  user_id uuid,
  name text,
  email text,
  boleta text,
  career text,
  phone text,
  is_proposer boolean,
  docs_received integer,
  docs_json jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not private.is_active_actor() or not private.can_view_proposal_dossier(p_proposal_id) then
    raise exception 'Sin permiso para consultar el padrón de esta propuesta';
  end if;

  return query
  with prop as (
    select p.id, p.proposer_id from public.club_proposals p where p.id = p_proposal_id
  ),
  members as (
    select p.proposer_id as uid, true as is_prop from prop p
    union all
    select ci.user_id as uid, false as is_prop
      from public.club_interests ci
      join prop p on p.id = ci.proposal_id
     where ci.user_id <> p.proposer_id
  )
  select
    m.uid as user_id,
    u.name,
    case when private.can_review_club_proposal(p_proposal_id) or m.uid = actor_id then up.email else null end as email,
    up.boleta,
    coalesce(cp.career, '') as career,
    coalesce(cp.phone, '') as phone,
    m.is_prop as is_proposer,
    (
      select count(distinct d.document_type)::integer
        from public.club_proposal_documents d
       where d.proposal_id = p_proposal_id and d.user_id = m.uid
         and d.status in ('recibido', 'validacion_presencial_pendiente')
    ) as docs_received,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'document_type', d.document_type,
        'storage_path', d.storage_path,
        'status', d.status,
        'review_note', d.review_note
      ) order by d.document_type)
        from public.club_proposal_documents d
       where d.proposal_id = p_proposal_id and d.user_id = m.uid
    ), '[]'::jsonb) as docs_json
  from members m
  join public.users u on u.id = m.uid
  left join private.user_private up on up.user_id = m.uid
  left join public.club_participant_profiles cp on cp.proposal_id = p_proposal_id and cp.user_id = m.uid
  order by m.is_prop desc, u.name asc;
end;
$$;
revoke all on function public.get_proposal_roster_for_review(uuid) from public, anon;
grant execute on function public.get_proposal_roster_for_review(uuid) to authenticated;

-- Confirmación / disponibilidad del profesor coordinador respecto a la junta con Subdirección
create or replace function public.advisor_respond_appointment(
  p_proposal_id uuid,
  p_confirm boolean,
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
  mod_row record;
begin
  if not private.is_active_actor() then raise exception 'Se requiere cuenta activa'; end if;
  select * into prop from public.club_proposals where id = p_proposal_id;
  if not found or prop.advisor_id <> actor_id then
    raise exception 'Solo el profesor coordinador asignado puede responder sobre la reunión';
  end if;
  select * into appt from public.club_appointments
   where proposal_id = p_proposal_id and status in ('pendiente', 'confirmada')
   order by created_at desc limit 1 for update;
  if not found then return false; end if;

  update public.club_appointments
     set advisor_confirmed_at = case when p_confirm then now() else null end,
         advisor_note = nullif(trim(left(coalesce(p_note, ''), 400)), '')
   where id = appt.id;

  for mod_row in
    select u.id from public.users u
     where u.is_active and not u.banned
       and (u.role = 'admin'
         or (prop.kind = 'academico' and u.role = 'moderador' and u.area in ('subdireccion_academica', 'clubes_academicos'))
         or (prop.kind in ('cultural', 'deportivo') and u.role = 'moderador' and u.area = 'clubes_culturales'))
  loop
    perform private.notify_user(
      mod_row.id, 'clubes',
      case when p_confirm then 'Profesor confirmó asistencia a cita: ' || prop.name else 'Profesor sugirió ajuste de horario: ' || prop.name end,
      coalesce(nullif(trim(p_note), ''), case when p_confirm then 'El profesor coordinador confirmó su asistencia a la reunión.' else 'El profesor solicitó revisar el horario propuesto.' end),
      '/clubes/propuestas/' || p_proposal_id::text, 'alta'
    );
  end loop;
  return true;
end;
$$;
revoke all on function public.advisor_respond_appointment(uuid, boolean, text) from public, anon;
grant execute on function public.advisor_respond_appointment(uuid, boolean, text) to authenticated;

-- 7. Eventos & Espacios: prevención de colisiones y bypass por texto libre
alter table public.club_events
  add column if not exists ends_at timestamptz;

create or replace function private.club_event_venue_area(p_location text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_location, '') ~* '\mauditorio\M' then 'becas'
    when coalesce(p_location, '') ~* '\msala\s*14\M' then 'subdireccion_academica'
    else null
  end;
$$;

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
  ),
  effective as (
    select p_starts_at as s, coalesce(p_ends_at, p_starts_at + interval '2 hours') as e
  )
  select title
    from (
      select se.title, se.starts_at, coalesce(se.ends_at, se.starts_at + interval '2 hours') as ends_at
        from public.space_events se
       where se.space_id = p_space_id
         and se.approval_status <> 'rechazada'
         and se.approval_status <> 'rechazado'
         and (p_exclude_event_id is null or se.id <> p_exclude_event_id)
      union all
      select ce.title, ce.starts_at, coalesce(ce.ends_at, ce.starts_at + interval '2 hours') as ends_at
        from public.club_events ce
        join target_space ts on lower(trim(split_part(ce.location, '·', 1))) = lower(trim(ts.name))
       where ce.approval_status <> 'rechazado'
         and (p_exclude_event_id is null or ce.id <> p_exclude_event_id)
    ) ev, effective ef
   where tstzrange(ev.starts_at, ev.ends_at, '[)') && tstzrange(ef.s, ef.e, '[)')
   order by ev.starts_at asc
   limit 1;
$$;
revoke all on function public.check_space_event_overlap(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.check_space_event_overlap(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- 8. Mapa 3D: RPC segura para profesor + permisos de resolución para Prefectura
create or replace function public.assign_my_map_room(
  p_code text,
  p_label text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_code text := upper(trim(coalesce(p_code, '')));
  clean_label text := trim(left(coalesce(p_label, ''), 80));
  building_name text;
  floor_name text;
begin
  if not private.is_active_actor() or not exists (
    select 1 from public.users u where u.id = actor_id and u.role = 'profesor' and not u.banned
  ) then
    raise exception 'Solo un profesor activo puede confirmar su espacio en el mapa';
  end if;
  if clean_code !~ '^(G[01]0[0-9]|[1-4][0-2](0[1-9]|1[0-3]))$' then
    raise exception 'Código de espacio no válido';
  end if;

  insert into public.map_rooms (code, kind, name, description)
  values (clean_code, 'cubiculo', case when clean_label <> '' then clean_label else 'Cubículo ' || clean_code end, '')
  on conflict (code) do update
    set name = case when public.map_rooms.name = '' and clean_label <> '' then clean_label else public.map_rooms.name end;

  -- Evitar asignaciones fantasma en salones o cubículos anteriores
  delete from public.map_room_professors
   where professor_id = actor_id and room_code <> clean_code;

  insert into public.map_room_professors (room_code, professor_id)
  values (clean_code, actor_id)
  on conflict (room_code, professor_id) do nothing;

  building_name := case when left(clean_code, 1) = 'G' then 'Edificio de Gobierno' else 'Edificio ' || left(clean_code, 1) end;
  floor_name := case when substr(clean_code, 2, 1) = '0' then 'Planta baja' else 'Piso ' || substr(clean_code, 2, 1) end;

  if exists (select 1 from public.cubicles where professor_id = actor_id) then
    update public.cubicles
       set room_code = clean_code,
           building = building_name,
           floor = floor_name,
           label = case when length(trim(label)) = 0 and clean_label <> '' then clean_label else label end
     where professor_id = actor_id;
  else
    insert into public.cubicles (professor_id, label, building, floor, room_code, x, y)
    values (actor_id, case when clean_label <> '' then clean_label else 'Cubículo ' || clean_code end, building_name, floor_name, clean_code, 50, 50);
  end if;

  return true;
end;
$$;
revoke all on function public.assign_my_map_room(text, text) from public, anon;
grant execute on function public.assign_my_map_room(text, text) to authenticated;

drop policy if exists map_rooms_admin on public.map_rooms;
create policy map_rooms_admin on public.map_rooms
for all to authenticated
using (private.is_admin_actor() or private.can_manage_area('prefectura'))
with check (private.is_admin_actor() or private.can_manage_area('prefectura'));

drop policy if exists map_room_suggestions_delete on public.map_room_suggestions;
create policy map_room_suggestions_delete on public.map_room_suggestions
for delete to authenticated using (
  suggested_by = (select auth.uid())
  or professor_id = (select auth.uid())
  or private.is_admin_actor()
  or private.can_manage_area('prefectura')
);

drop policy if exists map_room_professors_manage on public.map_room_professors;
create policy map_room_professors_manage on public.map_room_professors
for all to authenticated
using (professor_id = (select auth.uid()) or private.is_admin_actor() or private.can_manage_area('prefectura'))
with check (professor_id = (select auth.uid()) or private.is_admin_actor() or private.can_manage_area('prefectura'));

-- 9. Objetos Perdidos P2P: Pregunta llave realista + validación humana + oferta en 'perdido' + renovación QR + pg_trgm con unaccent
alter table private.lost_item_secrets
  add column if not exists answer_text text;

alter table private.lost_item_claim_answers
  add column if not exists claimant_answer text,
  add column if not exists match_score numeric(4,3);

alter table public.lost_item_claims
  add column if not exists answer_score numeric(4,3);

alter table public.lost_item_claims drop constraint if exists lost_item_claims_status_check;
alter table public.lost_item_claims add constraint lost_item_claims_status_check check (
  status in ('pendiente', 'en_revision', 'respuesta_correcta', 'aprobada', 'rechazada', 'entregada', 'cancelada')
);

create or replace function private.normalize_secret_answer(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    regexp_replace(extensions.unaccent(lower(coalesce(p_text, ''))), '[^a-z0-9\s]+', ' ', 'g'),
    '\s+', ' ', 'g'
  ));
$$;
revoke all on function private.normalize_secret_answer(text) from public, anon, authenticated;

create or replace function private.score_secret_answer(p_expected text, p_given text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  exp_norm text := private.normalize_secret_answer(p_expected);
  giv_norm text := private.normalize_secret_answer(p_given);
  exp_tokens text[];
  giv_tokens text[];
  shared_tokens integer := 0;
  union_tokens integer := 0;
  t text;
  sim numeric;
  wsim numeric;
  contain_score numeric := 0;
  tok_score numeric := 0;
begin
  if length(exp_norm) = 0 or length(giv_norm) = 0 then
    return 0;
  end if;
  if exp_norm = giv_norm then
    return 1.000;
  end if;

  if length(giv_norm) >= 3 and position(giv_norm in exp_norm) > 0 then
    contain_score := greatest(contain_score, 0.72 + least(0.23, (length(giv_norm)::numeric / greatest(length(exp_norm), 1)::numeric) * 0.23));
  end if;
  if length(exp_norm) >= 3 and position(exp_norm in giv_norm) > 0 then
    contain_score := greatest(contain_score, 0.85);
  end if;

  exp_tokens := array(select distinct x from unnest(string_to_array(exp_norm, ' ')) as x where length(x) >= 2);
  giv_tokens := array(select distinct x from unnest(string_to_array(giv_norm, ' ')) as x where length(x) >= 2);

  if coalesce(array_length(exp_tokens, 1), 0) > 0 and coalesce(array_length(giv_tokens, 1), 0) > 0 then
    foreach t in array exp_tokens loop
      if t = any(giv_tokens) then
        shared_tokens := shared_tokens + 1;
      end if;
    end loop;
    union_tokens := coalesce(array_length(exp_tokens, 1), 0) + coalesce(array_length(giv_tokens, 1), 0) - shared_tokens;
    if union_tokens > 0 then
      tok_score := greatest(
        shared_tokens::numeric / union_tokens::numeric,
        (shared_tokens::numeric / array_length(exp_tokens, 1)::numeric) * 0.85
      );
    end if;
  end if;

  sim := coalesce(extensions.similarity(exp_norm, giv_norm), 0);
  wsim := coalesce(extensions.word_similarity(exp_norm, giv_norm), 0);

  return round(least(1.0, greatest(sim, wsim, contain_score, tok_score))::numeric, 3);
end;
$$;
revoke all on function private.score_secret_answer(text, text) from public, anon, authenticated;

create or replace function public.create_lost_item(
  p_kind text,
  p_title text,
  p_description text,
  p_place text,
  p_photo_url text,
  p_security_question text,
  p_answer_hash text,
  p_photo_url_2 text default null,
  p_security_answer_plain text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_id uuid;
  clean_plain text := trim(coalesce(p_security_answer_plain, ''));
begin
  if not private.is_active_actor() then raise exception 'Se requiere una cuenta activa'; end if;
  if p_kind not in ('perdido', 'encontrado') then raise exception 'Tipo de reporte inválido'; end if;
  if length(trim(coalesce(p_title, ''))) not between 3 and 120
     or length(trim(coalesce(p_description, ''))) not between 10 and 2000
     or length(trim(coalesce(p_place, ''))) not between 2 and 160 then
    raise exception 'Completa título, descripción y lugar';
  end if;
  if p_kind = 'encontrado' and (length(trim(coalesce(p_security_question, ''))) < 5 or (length(coalesce(p_answer_hash, '')) <> 64 and length(clean_plain) < 2)) then
    raise exception 'Los objetos encontrados necesitan pregunta y respuesta de seguridad';
  end if;

  insert into public.lost_items (reporter_id, kind, title, description, place, photo_url, photo_url_2, security_question)
  values (
    actor_id,
    p_kind,
    trim(p_title),
    trim(p_description),
    trim(p_place),
    p_photo_url,
    p_photo_url_2,
    case when p_kind = 'encontrado' then trim(p_security_question) else null end
  )
  returning id into item_id;

  if p_kind = 'encontrado' then
    insert into private.lost_item_secrets (lost_item_id, security_answer_hash, answer_text)
    values (
      item_id,
      case when length(coalesce(p_answer_hash, '')) = 64 then lower(p_answer_hash) else encode(extensions.digest(lower(clean_plain), 'sha256'), 'hex') end,
      nullif(clean_plain, '')
    );
  end if;
  return item_id;
end;
$$;
revoke all on function public.create_lost_item(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_lost_item(text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.submit_lost_item_claim(
  p_item_id uuid,
  p_answer_text text,
  p_note text default null,
  p_evidence_path text default null,
  p_answer_hash text default null
)
returns table (claim_id uuid, status text, score numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expected_hash text;
  expected_plain text;
  item_owner uuid;
  item_status text;
  item_kind text;
  item_title text;
  new_claim_id uuid;
  attempts integer;
  computed_score numeric(4,3) := 1.000;
  claim_status text;
  clean_answer text := trim(coalesce(p_answer_text, ''));
begin
  if not private.is_active_actor() then raise exception 'Se requiere una cuenta activa'; end if;
  select li.reporter_id, li.status, li.kind, li.title, s.security_answer_hash, s.answer_text
    into item_owner, item_status, item_kind, item_title, expected_hash, expected_plain
    from public.lost_items li
    left join private.lost_item_secrets s on s.lost_item_id = li.id
   where li.id = p_item_id for update of li;
  if not found or item_status <> 'abierto' or item_owner = actor_id then
    raise exception 'No se puede enviar un reclamo o aviso para este reporte';
  end if;
  if exists (select 1 from public.lost_item_claims c where c.lost_item_id = p_item_id and c.claimant_id = actor_id) then
    raise exception 'Ya enviaste una solicitud para este reporte';
  end if;

  if item_kind = 'perdido' then
    -- Flujo "Yo lo encontré" para reportes de objetos perdidos
    insert into public.lost_item_claims (lost_item_id, claimant_id, status, claimant_note, evidence_path, answer_score)
    values (p_item_id, actor_id, 'en_revision', nullif(trim(p_note), ''), nullif(trim(p_evidence_path), ''), 1.000)
    returning id into new_claim_id;

    insert into private.lost_item_claim_answers (claim_id, answer_hash, claimant_answer, match_score)
    values (new_claim_id, coalesce(nullif(lower(p_answer_hash), ''), encode(extensions.digest(coalesce(nullif(trim(p_note), ''), 'hallado'), 'sha256'), 'hex')), nullif(trim(p_note), ''), 1.000);

    perform private.notify_user(
      item_owner,
      'objetos',
      'Alguien reportó haber encontrado tu objeto: ' || item_title,
      'Un integrante de la comunidad indicó que encontró «' || item_title || '». Revisa su mensaje y aprueba para generar el código QR de entrega.',
      '/objetos/' || p_item_id::text,
      'alta'
    );
    return query select new_claim_id, 'en_revision'::text, 1.000::numeric;
    return;
  end if;

  -- Flujo de "Pregunta llave" en objetos encontrados
  insert into private.lost_claim_attempts as a (item_id, user_id, attempts)
  values (p_item_id, actor_id, 1)
  on conflict (item_id, user_id) do update set attempts = a.attempts + 1
  returning a.attempts into attempts;

  if attempts > 5 then
    return query select null::uuid, 'limite'::text, 0::numeric;
    return;
  end if;

  if expected_plain is not null and length(trim(expected_plain)) > 0 then
    computed_score := private.score_secret_answer(expected_plain, clean_answer);
  elsif expected_hash is not null and (expected_hash = lower(coalesce(p_answer_hash, '')) or expected_hash = encode(extensions.digest(lower(clean_answer), 'sha256'), 'hex')) then
    computed_score := 1.000;
  else
    computed_score := 0.000;
  end if;

  -- Aceptación realista: si tiene evidencia adjunta (>=0.25) o similitud >= 0.40 pasa a revisión de quien encontró el objeto
  if computed_score < 0.40 and (p_evidence_path is null or computed_score < 0.25) then
    return query select null::uuid, 'incorrecta'::text, computed_score;
    return;
  end if;

  claim_status := case when computed_score >= 0.72 then 'respuesta_correcta' else 'en_revision' end;

  insert into public.lost_item_claims (lost_item_id, claimant_id, status, claimant_note, evidence_path, answer_score)
  values (p_item_id, actor_id, claim_status, nullif(trim(p_note), ''), nullif(trim(p_evidence_path), ''), computed_score)
  returning id into new_claim_id;

  insert into private.lost_item_claim_answers (claim_id, answer_hash, claimant_answer, match_score)
  values (
    new_claim_id,
    coalesce(nullif(lower(p_answer_hash), ''), encode(extensions.digest(lower(clean_answer), 'sha256'), 'hex')),
    clean_answer,
    computed_score
  );

  perform private.notify_user(
    item_owner,
    'objetos',
    case when claim_status = 'respuesta_correcta' then 'Reclamo con coincidencia alta: ' || item_title else 'Nuevo reclamo por revisar: ' || item_title end,
    'Recibiste una respuesta a tu pregunta de seguridad (coincidencia ' || round(computed_score * 100)::text || '%). Revisa la respuesta y decide si corresponde al dueño real.',
    '/objetos/' || p_item_id::text,
    'alta'
  );
  return query select new_claim_id, claim_status, computed_score;
end;
$$;
revoke all on function public.submit_lost_item_claim(uuid, text, text, text, text) from public, anon;
grant execute on function public.submit_lost_item_claim(uuid, text, text, text, text) to authenticated;

create or replace function public.review_lost_item_claim(
  p_claim_id uuid, p_approve boolean, p_review_note text, p_token text, p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_row public.lost_item_claims%rowtype;
  item_owner uuid;
  item_status text;
  item_kind text;
  handoff_id uuid;
  actual_finder uuid;
  actual_recipient uuid;
begin
  select c.* into claim_row from public.lost_item_claims c where c.id = p_claim_id for update;
  if not found then raise exception 'No encontramos el reclamo'; end if;
  select li.reporter_id, li.status, li.kind
    into item_owner, item_status, item_kind
    from public.lost_items li where li.id = claim_row.lost_item_id for update;

  if item_owner <> (select auth.uid()) or claim_row.status not in ('respuesta_correcta', 'en_revision', 'pendiente') then
    raise exception 'Solo quien publicó el reporte puede decidir sobre este reclamo';
  end if;
  if item_status <> 'abierto' then raise exception 'El reporte ya no está abierto'; end if;
  if p_approve and exists (select 1 from public.lost_item_claims c where c.lost_item_id = claim_row.lost_item_id and c.status = 'aprobada') then
    raise exception 'Ya hay una entrega aprobada para este objeto';
  end if;

  if p_approve then
    if length(coalesce(p_token, '')) < 6 or length(coalesce(p_token_hash, '')) <> 64 then
      raise exception 'No se generó el código de entrega';
    end if;

    -- En 'encontrado': reporter es finder, claimant es recipient. En 'perdido': claimant es finder, reporter es recipient.
    if item_kind = 'perdido' then
      actual_finder := claim_row.claimant_id;
      actual_recipient := item_owner;
    else
      actual_finder := item_owner;
      actual_recipient := claim_row.claimant_id;
    end if;

    update public.lost_item_claims
       set status = 'aprobada', review_note = nullif(trim(p_review_note), ''), reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
     where id = p_claim_id;

    insert into public.lost_item_handoffs (claim_id, finder_id, recipient_id)
    values (p_claim_id, actual_finder, actual_recipient)
    returning id into handoff_id;

    insert into private.lost_item_handoff_secrets (handoff_id, token_hash, token)
    values (handoff_id, lower(p_token_hash), upper(p_token));

    insert into public.notifications (user_id, title, body, href)
    values (
      claim_row.claimant_id,
      'Solicitud aprobada para entrega',
      'Se habilitó el código QR y el contacto institucional para acordar la entrega física.',
      '/objetos/' || claim_row.lost_item_id::text
    );
  else
    update public.lost_item_claims
       set status = 'rechazada', review_note = nullif(trim(p_review_note), ''), reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
     where id = p_claim_id;

    insert into public.notifications (user_id, title, body, href)
    values (
      claim_row.claimant_id,
      'Actualización de tu solicitud',
      coalesce(nullif(trim(p_review_note), ''), 'Quien publicó el reporte determinó que los detalles no corresponden al objeto.'),
      '/objetos/' || claim_row.lost_item_id::text
    );
  end if;
  return handoff_id;
end;
$$;
revoke all on function public.review_lost_item_claim(uuid, boolean, text, text, text) from public, anon;
grant execute on function public.review_lost_item_claim(uuid, boolean, text, text, text) to authenticated;

create or replace function public.get_lost_item_claims_for_review(p_item_id uuid)
returns table (
  id uuid,
  claimant_id uuid,
  claimant_name text,
  status text,
  claimant_note text,
  evidence_path text,
  created_at timestamptz,
  answer_text text,
  answer_score numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not private.is_active_actor() then return; end if;
  if not private.is_admin_actor() and not exists (
    select 1 from public.lost_items li where li.id = p_item_id and li.reporter_id = actor_id
  ) then
    return;
  end if;
  return query
  select c.id,
         c.claimant_id,
         u.name as claimant_name,
         c.status,
         c.claimant_note,
         c.evidence_path,
         c.created_at,
         ca.claimant_answer as answer_text,
         coalesce(c.answer_score, ca.match_score) as answer_score
    from public.lost_item_claims c
    join public.users u on u.id = c.claimant_id
    left join private.lost_item_claim_answers ca on ca.claim_id = c.id
   where c.lost_item_id = p_item_id
   order by (c.status = 'aprobada') desc, coalesce(c.answer_score, 0) desc, c.created_at desc;
end;
$$;
revoke all on function public.get_lost_item_claims_for_review(uuid) from public, anon;
grant execute on function public.get_lost_item_claims_for_review(uuid) to authenticated;

create or replace function public.get_my_lost_item_claim(p_item_id uuid)
returns table (
  id uuid,
  status text,
  claimant_note text,
  review_note text,
  answer_score numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.status, c.claimant_note, c.review_note, c.answer_score, c.created_at
    from public.lost_item_claims c
   where c.lost_item_id = p_item_id and c.claimant_id = (select auth.uid())
   limit 1;
$$;
revoke all on function public.get_my_lost_item_claim(uuid) from public, anon;
grant execute on function public.get_my_lost_item_claim(uuid) to authenticated;

drop function if exists public.get_my_lost_item_handoff(uuid);
create or replace function public.get_my_lost_item_handoff(p_item_id uuid)
returns table (handoff_id uuid, token text, expires_at timestamptz, is_expired boolean, finder_id uuid, recipient_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, s.token, h.expires_at, (h.expires_at <= now()) as is_expired, h.finder_id, h.recipient_id
    from public.lost_item_handoffs h
    join public.lost_item_claims c on c.id = h.claim_id
    join private.lost_item_handoff_secrets s on s.handoff_id = h.id
   where c.lost_item_id = p_item_id
     and (h.recipient_id = (select auth.uid()) or h.finder_id = (select auth.uid()))
     and h.status = 'pendiente'
   order by h.created_at desc
   limit 1;
$$;
revoke all on function public.get_my_lost_item_handoff(uuid) from public, anon;
grant execute on function public.get_my_lost_item_handoff(uuid) to authenticated;

create or replace function public.renew_lost_item_handoff(
  p_item_id uuid,
  p_token text,
  p_token_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  handoff public.lost_item_handoffs%rowtype;
  new_expiry timestamptz := now() + interval '24 hours';
begin
  if not private.is_active_actor() then raise exception 'Se requiere cuenta activa'; end if;
  if length(coalesce(p_token, '')) < 6 or length(coalesce(p_token_hash, '')) <> 64 then
    raise exception 'Código inválido';
  end if;
  select h.* into handoff
    from public.lost_item_handoffs h
    join public.lost_item_claims c on c.id = h.claim_id
   where c.lost_item_id = p_item_id
     and h.status = 'pendiente'
     and (h.finder_id = actor_id or h.recipient_id = actor_id)
   order by h.created_at desc limit 1
   for update of h;
  if not found then
    raise exception 'No hay una entrega pendiente renovable para este reporte';
  end if;

  update public.lost_item_handoffs set expires_at = new_expiry where id = handoff.id;
  update private.lost_item_handoff_secrets
     set token = upper(p_token), token_hash = lower(p_token_hash)
   where handoff_id = handoff.id;

  insert into public.notifications (user_id, title, body, href)
  values (
    case when actor_id = handoff.finder_id then handoff.recipient_id else handoff.finder_id end,
    'Código QR de entrega renovado',
    'Se generó un nuevo código QR de entrega válido por 24 horas adicionales.',
    '/objetos/' || p_item_id::text
  );
  return new_expiry;
end;
$$;
revoke all on function public.renew_lost_item_handoff(uuid, text, text) from public, anon;
grant execute on function public.renew_lost_item_handoff(uuid, text, text) to authenticated;

create or replace function public.complete_lost_item_handoff(p_handoff_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  handoff public.lost_item_handoffs%rowtype;
  expected_hash text;
  item_id uuid;
  item_status text;
  other_id uuid;
begin
  select h.* into handoff from public.lost_item_handoffs h where h.id = p_handoff_id for update;
  if not found or (handoff.finder_id <> actor_id and handoff.recipient_id <> actor_id) or handoff.status <> 'pendiente' or handoff.expires_at <= now() then
    return false;
  end if;
  select li.id, li.status into item_id, item_status
    from public.lost_items li
    join public.lost_item_claims c on c.lost_item_id = li.id
   where c.id = handoff.claim_id for update of li;
  if item_status <> 'abierto' then return false; end if;

  select s.token_hash into expected_hash from private.lost_item_handoff_secrets s where s.handoff_id = p_handoff_id;
  if expected_hash is null or expected_hash <> lower(coalesce(p_token_hash, '')) then return false; end if;

  other_id := case when actor_id = handoff.finder_id then handoff.recipient_id else handoff.finder_id end;

  update public.lost_item_handoffs
     set status = 'completado', verified_by = other_id, verified_at = now(), completed_at = now()
   where id = p_handoff_id;
  update public.lost_item_claims set status = 'entregada', updated_at = now() where id = handoff.claim_id;
  update public.lost_items set status = 'entregado' where id = item_id;
  insert into public.notifications (user_id, title, body, href)
  values (other_id, 'Entrega confirmada', 'El objeto se marcó como entregado mediante verificación QR.', '/objetos/' || item_id::text);
  return true;
end;
$$;
revoke all on function public.complete_lost_item_handoff(uuid, text) from public, anon;
grant execute on function public.complete_lost_item_handoff(uuid, text) to authenticated;

-- Matching automático mejorado: usa unaccent + similarity(título) + similarity(título + desc) realista (>= 0.45 o word_similarity >= 0.65)
create or replace function private.match_lost_item_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  score numeric(5,4);
  new_norm_title text := private.normalize_secret_answer(new.title);
  new_norm_full text := private.normalize_secret_answer(concat_ws(' ', new.title, new.description, new.place));
  first_match uuid := null;
begin
  for candidate in
    select li.id,
           li.reporter_id,
           round(least(1.0, greatest(
             extensions.similarity(private.normalize_secret_answer(concat_ws(' ', li.title, li.description)), private.normalize_secret_answer(concat_ws(' ', new.title, new.description))),
             extensions.similarity(private.normalize_secret_answer(li.title), new_norm_title) * 0.55
               + extensions.word_similarity(new_norm_title, private.normalize_secret_answer(concat_ws(' ', li.title, li.description))) * 0.45,
             extensions.similarity(private.normalize_secret_answer(concat_ws(' ', li.title, li.description, li.place)), new_norm_full)
           ))::numeric, 4) as score
      from public.lost_items li
     where li.id <> new.id
       and li.kind <> new.kind
       and li.status = 'abierto'
  loop
    score := candidate.score;
    if score >= 0.48 then
      insert into public.lost_item_matches (item_a_id, item_b_id, similarity_score)
      values (least(candidate.id, new.id), greatest(candidate.id, new.id), score)
      on conflict (item_a_id, item_b_id) do update
        set similarity_score = greatest(public.lost_item_matches.similarity_score, excluded.similarity_score);

      update public.lost_items
         set matched_id = new.id
       where id = candidate.id and matched_id is null;

      if first_match is null then
        first_match := candidate.id;
        update public.lost_items set matched_id = candidate.id where id = new.id and matched_id is null;
      end if;

      perform private.notify_user(
        candidate.reporter_id,
        'objetos',
        'Posible coincidencia con tu reporte: ' || new.title,
        'Se publicó un objeto del tipo contrario con detalles similares (' || round(score * 100)::text || '%).',
        '/objetos/' || candidate.id::text,
        'alta'
      );
      if candidate.reporter_id <> new.reporter_id then
        perform private.notify_user(
          new.reporter_id,
          'objetos',
          'Posible coincidencia encontrada',
          'Hay un reporte abierto previo con características similares al tuyo (' || round(score * 100)::text || '%).',
          '/objetos/' || new.id::text,
          'alta'
        );
      end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.match_lost_item_after_insert() from public, anon, authenticated;

-- 10. Guías, Foro y Notificaciones: mapear áreas de contenido ('clubes', 'infraestructura', 'general') a moderadores reales y enlaces consistentes
create or replace function private.can_manage_content_area(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or private.can_manage_area(p_area)
      or (p_area = 'clubes' and (
        private.can_manage_area('clubes_academicos')
        or private.can_manage_area('clubes_culturales')
      ))
      or (p_area = 'infraestructura' and private.can_manage_area('prefectura'))
      or (p_area = 'general' and private.can_manage_area('comunicacion'));
$$;
revoke all on function private.can_manage_content_area(text) from public;
grant execute on function private.can_manage_content_area(text) to authenticated;

drop policy if exists guides_area_insert on public.guides;
create policy guides_area_insert on public.guides
for insert to authenticated with check (author_id = (select auth.uid()) and private.can_manage_content_area(area));

drop policy if exists guides_area_update on public.guides;
create policy guides_area_update on public.guides
for update to authenticated using (private.can_manage_content_area(area))
with check (private.can_manage_content_area(area));

drop policy if exists guides_area_delete on public.guides;
create policy guides_area_delete on public.guides
for delete to authenticated using (private.can_manage_content_area(area));

drop policy if exists guide_versions_area_insert on public.guide_versions;
create policy guide_versions_area_insert on public.guide_versions
for insert to authenticated with check (
  edited_by = (select auth.uid()) and exists (
    select 1 from public.guides g where g.id = guide_id and private.can_manage_content_area(g.area)
  )
);

drop policy if exists guide_suggestions_area_review on public.guide_suggestions;
create policy guide_suggestions_area_review on public.guide_suggestions
for update to authenticated using (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_content_area(g.area)
)) with check (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_content_area(g.area)
));

drop policy if exists guide_suggestions_area_delete on public.guide_suggestions;
create policy guide_suggestions_area_delete on public.guide_suggestions
for delete to authenticated using (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_content_area(g.area)
));

drop policy if exists guide_step_questions_area_update on public.guide_step_questions;
create policy guide_step_questions_area_update on public.guide_step_questions
for update to authenticated using (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_content_area(g.area)
)) with check (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_content_area(g.area)
));

drop policy if exists guide_step_answers_owner_insert on public.guide_step_answers;
create policy guide_step_answers_owner_insert on public.guide_step_answers
for insert to authenticated with check (
  author_id = (select auth.uid()) and private.is_active_actor()
  and (not official or exists (
    select 1 from public.guide_step_questions q join public.guides g on g.id = q.guide_id
    where q.id = question_id and private.can_manage_content_area(g.area)
  ))
);

drop policy if exists guide_step_answers_area_update on public.guide_step_answers;
create policy guide_step_answers_area_update on public.guide_step_answers
for update to authenticated using (exists (
  select 1 from public.guide_step_questions q join public.guides g on g.id = q.guide_id
  where q.id = question_id and private.can_manage_content_area(g.area)
)) with check (exists (
  select 1 from public.guide_step_questions q join public.guides g on g.id = q.guide_id
  where q.id = question_id and private.can_manage_content_area(g.area)
));

drop policy if exists guide_source_area_upload on storage.objects;
create policy guide_source_area_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'guide-source'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.can_manage_content_area((storage.foldername(name))[1])
);

drop policy if exists guide_source_area_read on storage.objects;
create policy guide_source_area_read on storage.objects
for select to authenticated using (
  bucket_id = 'guide-source' and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or private.can_manage_content_area((storage.foldername(name))[1])
  )
);

-- Asegurar notificaciones de foro consistentes hacia /foro?duda=<id>
create or replace function private.after_forum_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare question_row public.questions%rowtype;
begin
  select * into question_row from public.questions where id = new.question_id;
  if new.official then
    update public.questions set status = 'respondida', updated_at = now()
     where id = new.question_id and status <> 'cerrada';
  end if;
  if question_row.author_id <> new.author_id then
    perform private.notify_user(
      question_row.author_id,
      'foro',
      case when new.official then 'Respuesta oficial en tu pregunta' else 'Nueva respuesta en tu pregunta' end,
      'Hay una nueva respuesta en «' || question_row.title || '».',
      '/foro?duda=' || new.question_id::text || '#duda-' || new.question_id::text,
      case when new.official then 'alta' else 'normal' end
    );
  end if;
  return new;
end;
$$;

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
    select u.id
      from public.users u
     where u.is_active and not u.banned
       and u.id <> new.author_id
       and (
         u.role = 'admin'
         or (u.role = 'moderador' and (
           u.area = new.area
           or (new.area = 'clubes' and u.area in ('clubes_academicos', 'clubes_culturales'))
           or (new.request_kind = 'nuevo_club' and u.area in ('clubes_academicos', 'clubes_culturales'))
           or (new.area = 'infraestructura' and u.area = 'prefectura')
           or (new.request_kind = 'cambio_info' and u.area = 'prefectura')
           or (new.area = 'general' and u.area = 'comunicacion')
         ))
       )
  loop
    perform private.notify_user(
      mod_row.id,
      'foro',
      'Nueva publicación en ' || new.area,
      new.title,
      '/foro?duda=' || new.id::text || '#duda-' || new.id::text,
      'normal'
    );
  end loop;
  return new;
end;
$$;

create or replace function private.can_manage_forum_question(p_area text, p_request_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or private.can_manage_content_area(p_area)
      or (p_request_kind = 'nuevo_club' and (
        private.can_manage_area('clubes_academicos')
        or private.can_manage_area('clubes_culturales')
      ))
      or (p_request_kind = 'cambio_info' and private.can_manage_area('prefectura'));
$$;

create or replace function private.after_guide_suggestion_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  guide_row public.guides%rowtype;
  mod_row record;
begin
  select * into guide_row from public.guides where id = new.guide_id;
  if not found then return new; end if;

  for mod_row in
    select u.id
      from public.users u
     where u.is_active and not u.banned
       and u.id <> new.user_id
       and (
         u.role = 'admin'
         or (u.role = 'moderador' and (
           u.area = guide_row.area
           or (guide_row.area = 'clubes' and u.area in ('clubes_academicos', 'clubes_culturales'))
           or (guide_row.area = 'infraestructura' and u.area = 'prefectura')
           or (guide_row.area = 'general' and u.area = 'comunicacion')
         ))
       )
  loop
    perform private.notify_user(
      mod_row.id,
      'guias',
      'Nueva sugerencia en guía: ' || guide_row.title,
      'Un estudiante sugirió una mejora para el paso ' || new.step_index || '.',
      '/guias/' || new.guide_id::text || '?paso=' || new.step_index || '#ruta',
      'alta'
    );
  end loop;
  return new;
end;
$$;

-- Conteo público agregado de integrantes por club activo (sin exponer identidades en feed anónimo o general)
create or replace function public.get_public_club_member_counts()
returns table (
  club_id uuid,
  members_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id as club_id,
    count(distinct m.user_id) filter (where m.status = 'aceptada')::int as members_count
  from public.clubs c
  left join public.memberships m on m.club_id = c.id
  where c.active = true
  group by c.id;
$$;

revoke all on function public.get_public_club_member_counts() from public;
grant execute on function public.get_public_club_member_counts() to anon, authenticated;
