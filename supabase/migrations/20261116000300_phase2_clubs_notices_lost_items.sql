-- Fase 2: Clubes, Avisos y Objetos Perdidos P2P

-- 2.1 Avisos: cartel real en Storage, salidas separadas Twitter/Facebook y scheduler para avisos programados
alter table public.avisos
  add column if not exists image_url text,
  add column if not exists social_twitter text,
  add column if not exists social_facebook text,
  add column if not exists published_triggered boolean not null default false;

update public.avisos
   set published_triggered = true
 where publish_at <= now();

create or replace function public.trigger_scheduled_avisos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  count_activated integer;
begin
  with activated as (
    update public.avisos
       set published_triggered = true
     where not published_triggered
       and publish_at <= now()
     returning id
  )
  select count(*)::integer into count_activated from activated;
  return coalesce(count_activated, 0);
end;
$$;
revoke all on function public.trigger_scheduled_avisos() from public;
grant execute on function public.trigger_scheduled_avisos() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema extensions;
      perform cron.schedule(
        'activate-scheduled-avisos',
        '* * * * *',
        'select public.trigger_scheduled_avisos()'
      );
    exception when others then
      -- pg_cron may not be active in every local profile; trigger_scheduled_avisos() is also invoked on feed load
      null;
    end;
  end if;
end;
$$;

-- 2.2 Clubes: propuestas completas, acceso a clubes_culturales, reclamo a 7 días y gestión de club
alter table public.club_proposals
  add column if not exists objectives text not null default '',
  add column if not exists schedule_plan text not null default '',
  add column if not exists community_impact text not null default '',
  add column if not exists plan_file_path text,
  add column if not exists review_observations text,
  add column if not exists last_proposer_activity_at timestamptz not null default now();

alter table public.clubs
  add column if not exists logo_url text,
  add column if not exists external_links text,
  add column if not exists join_requirements text;

alter table public.memberships
  add column if not exists application_note text;

grant insert (club_id, user_id, status, application_note) on public.memberships to authenticated;

create or replace function private.can_review_club_proposal(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or private.can_manage_area('subdireccion_academica')
      or exists (
        select 1 from public.club_proposals p
         where p.id = p_proposal_id
           and (
             p.proposer_id = (select auth.uid())
             or (p.kind = 'academico' and private.can_manage_area('clubes_academicos'))
             or (p.kind in ('cultural', 'deportivo') and (private.can_manage_area('clubes_culturales') or private.can_manage_area('clubes_academicos')))
           )
      );
$$;

drop policy if exists club_proposals_owner_or_reviewer_update on public.club_proposals;
drop policy if exists club_proposals_reviewer_update on public.club_proposals;
create policy club_proposals_owner_or_reviewer_update on public.club_proposals
for update to authenticated using (
  proposer_id = (select auth.uid())
  or private.can_review_club_proposal(id)
) with check (
  proposer_id = (select auth.uid())
  or private.can_review_club_proposal(id)
);

drop policy if exists club_interests_own_or_club_moderator_read on public.club_interests;
create policy club_interests_own_or_club_moderator_read on public.club_interests
for select to authenticated using (
  user_id = (select auth.uid())
  or private.can_review_club_proposal(proposal_id)
);

drop policy if exists club_appointments_owner_or_reviewer_read on public.club_appointments;
create policy club_appointments_owner_or_reviewer_read on public.club_appointments
for select to authenticated using (
  requested_by = (select auth.uid())
  or private.can_review_club_proposal(proposal_id)
);

drop policy if exists clubs_academic_area_update on public.clubs;
create policy clubs_area_or_manager_update on public.clubs
for update to authenticated using (
  private.is_admin_actor()
  or private.can_manage_area('clubes_academicos')
  or (kind in ('cultural', 'deportivo') and private.can_manage_area('clubes_culturales'))
  or private.can_publish_club(id)
) with check (
  private.is_admin_actor()
  or private.can_manage_area('clubes_academicos')
  or (kind in ('cultural', 'deportivo') and private.can_manage_area('clubes_culturales'))
  or private.can_publish_club(id)
);

drop policy if exists club_events_public_read on public.club_events;
create policy club_events_public_or_manager_read on public.club_events
for select to anon, authenticated using (
  approval_status = 'aprobado'
  or created_by = (select auth.uid())
  or private.can_publish_club(club_id)
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.is_admin_actor()
);

drop policy if exists club_events_staff_approve on public.club_events;
create policy club_events_staff_approve on public.club_events
for update to authenticated using (
  private.is_admin_actor()
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_publish_club(club_id)
) with check (
  (
    (private.is_admin_actor() or private.can_manage_area('clubes_academicos') or private.can_manage_area('clubes_culturales'))
    and (approval_status <> 'aprobado' or approved_by = (select auth.uid()))
  )
  or (private.can_publish_club(club_id) and approval_status = 'pendiente')
);

-- Permitir subir archivo del plan de trabajo cuando el usuario es el proponente
drop policy if exists club_documents_owner_upload on storage.objects;
create policy club_documents_owner_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'club-documents'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_active_actor()
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (
    private.is_proposal_participant(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1 from public.club_proposals p
       where p.id = (((storage.foldername(name))[1])::uuid)
         and p.proposer_id = (select auth.uid())
    )
  )
);

-- Reclamo de propuesta tras 7 días de inactividad del proponente (CU-17)
create or replace function public.claim_inactive_club_proposal(p_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prop public.club_proposals%rowtype;
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  select * into prop from public.club_proposals where id = p_proposal_id for update;
  if not found or prop.status in ('registrado', 'rechazada') or prop.proposer_id = actor_id then
    return false;
  end if;
  if prop.last_proposer_activity_at > now() - interval '7 days' then
    raise exception 'El proponente aún está dentro del plazo activo de 7 días';
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
    'Otra persona interesada retomó el seguimiento de «' || prop.name || '» tras 7 días sin actividad.',
    '/clubes/propuestas/' || p_proposal_id::text,
    'alta'
  );
  return true;
end;
$$;
revoke all on function public.claim_inactive_club_proposal(uuid) from public, anon;
grant execute on function public.claim_inactive_club_proposal(uuid) to authenticated;

-- Reenvío de membresía rechazada con nota de requisitos
create or replace function public.resubmit_club_membership(p_club_id uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_actor() then return false; end if;
  update public.memberships
     set status = 'pendiente',
         application_note = nullif(trim(coalesce(p_note, '')), ''),
         updated_at = now()
   where club_id = p_club_id
     and user_id = (select auth.uid())
     and status = 'rechazada';
  return found;
end;
$$;
grant execute on function public.resubmit_club_membership(uuid, text) to authenticated;

-- 2.3 Objetos Perdidos P2P: segunda foto, foto de comprobante en reclamo y lectura para el hallador
alter table public.lost_items
  add column if not exists photo_url_2 text;

create or replace function public.create_lost_item(
  p_kind text, p_title text, p_description text, p_place text,
  p_photo_url text, p_security_question text, p_answer_hash text,
  p_photo_url_2 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_id uuid;
begin
  if not private.is_active_actor() then raise exception 'Se requiere una cuenta activa'; end if;
  if p_kind not in ('perdido', 'encontrado') then raise exception 'Tipo de reporte inválido'; end if;
  if length(trim(coalesce(p_title, ''))) not between 3 and 120
     or length(trim(coalesce(p_description, ''))) not between 10 and 2000
     or length(trim(coalesce(p_place, ''))) not between 2 and 160 then
    raise exception 'Completa título, descripción y lugar';
  end if;
  if p_kind = 'encontrado' and (length(trim(coalesce(p_security_question, ''))) < 5 or length(coalesce(p_answer_hash, '')) <> 64) then
    raise exception 'Los objetos encontrados necesitan pregunta y respuesta de seguridad';
  end if;

  insert into public.lost_items (reporter_id, kind, title, description, place, photo_url, photo_url_2, security_question)
  values (actor_id, p_kind, trim(p_title), trim(p_description), trim(p_place), p_photo_url, p_photo_url_2,
          case when p_kind = 'encontrado' then trim(p_security_question) else null end)
  returning id into item_id;

  if p_kind = 'encontrado' then
    insert into private.lost_item_secrets (lost_item_id, security_answer_hash)
    values (item_id, lower(p_answer_hash));
  end if;
  return item_id;
end;
$$;
revoke all on function public.create_lost_item(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_lost_item(text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.submit_lost_item_claim(
  p_item_id uuid, p_answer_hash text, p_note text default null, p_evidence_path text default null
)
returns table (claim_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expected_hash text;
  item_owner uuid;
  item_status text;
  new_claim_id uuid;
  attempts integer;
begin
  if not private.is_active_actor() then raise exception 'Se requiere una cuenta activa'; end if;
  select li.reporter_id, li.status, s.security_answer_hash
    into item_owner, item_status, expected_hash
    from public.lost_items li
    left join private.lost_item_secrets s on s.lost_item_id = li.id
   where li.id = p_item_id and li.kind = 'encontrado' for update of li;
  if not found or item_status <> 'abierto' or item_owner = actor_id then
    raise exception 'No se puede reclamar este reporte';
  end if;
  if exists (select 1 from public.lost_item_claims c where c.lost_item_id = p_item_id and c.claimant_id = actor_id) then
    raise exception 'Ya enviaste un reclamo';
  end if;
  insert into private.lost_claim_attempts as a (item_id, user_id, attempts) values (p_item_id, actor_id, 1)
  on conflict (item_id, user_id) do update set attempts = a.attempts + 1
  returning a.attempts into attempts;
  if attempts > 3 then return query select null::uuid, 'limite'::text; return; end if;
  if expected_hash is null or expected_hash <> lower(coalesce(p_answer_hash, '')) then
    return query select null::uuid, 'incorrecta'::text; return;
  end if;
  insert into public.lost_item_claims (lost_item_id, claimant_id, status, claimant_note, evidence_path)
  values (p_item_id, actor_id, 'respuesta_correcta', nullif(trim(p_note), ''), nullif(trim(p_evidence_path), ''))
  returning id into new_claim_id;
  insert into private.lost_item_claim_answers (claim_id, answer_hash)
  values (new_claim_id, lower(p_answer_hash));

  perform private.notify_user(
    item_owner,
    'objetos',
    'Nuevo reclamo con respuesta correcta',
    'Alguien respondió correctamente la pregunta de seguridad de tu hallazgo. Revisa el reclamo y su evidencia.',
    '/objetos/' || p_item_id::text,
    'alta'
  );
  return query select new_claim_id, 'respuesta_correcta'::text;
end;
$$;
revoke all on function public.submit_lost_item_claim(uuid, text, text, text) from public, anon;
grant execute on function public.submit_lost_item_claim(uuid, text, text, text) to authenticated;

-- Permitir que quien encontró el objeto (reporter) también lea la evidencia en lost-evidence y que el reclamante pueda subirla durante el reclamo
create or replace function private.can_access_lost_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[];
  item_uuid uuid;
begin
  parts := storage.foldername(p_path);
  if coalesce(array_length(parts, 1), 0) < 2 or parts[1] !~* '^[0-9a-f-]{36}$' then
    return false;
  end if;
  item_uuid := parts[1]::uuid;
  return private.is_admin_actor()
      or parts[2] = (select auth.uid())::text
      or exists (select 1 from public.lost_items li where li.id = item_uuid and li.reporter_id = (select auth.uid()));
end;
$$;

drop policy if exists lost_evidence_participant_upload on storage.objects;
create policy lost_evidence_participant_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'lost-evidence'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_active_actor()
  and exists (
    select 1 from public.lost_items li
     where li.id::text = (storage.foldername(name))[1]
       and li.status = 'abierto'
  )
);

-- Permitir a dueño, reclamante o admin consultar también objetos entregados o cerrados en los que participaron
drop policy if exists lost_items_public_open_read on public.lost_items;
create policy lost_items_public_open_read on public.lost_items
for select to anon, authenticated using (
  status = 'abierto'
  or reporter_id = (select auth.uid())
  or private.is_lost_item_participant(id)
  or private.is_admin_actor()
);
