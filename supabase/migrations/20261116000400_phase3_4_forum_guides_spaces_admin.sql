-- Fase 3 y Fase 4: Foro, Guías Interactivas, Espacios y Panel Admin

-- 3.1 Foro: notificar a moderadores del área cuando se publica una pregunta nueva (CU-13)
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
       and ((u.role = 'moderador' and u.area = new.area) or u.role = 'admin')
       and u.id <> new.author_id
  loop
    perform private.notify_user(
      mod_row.id,
      'foro',
      'Nueva pregunta en ' || new.area,
      new.title,
      '/foro/' || new.id::text,
      'normal'
    );
  end loop;
  return new;
end;
$$;
revoke all on function private.after_forum_question_insert() from public, anon, authenticated;

drop trigger if exists forum_question_notify_moderators on public.questions;
create trigger forum_question_notify_moderators
after insert on public.questions
for each row execute function private.after_forum_question_insert();

-- Trigger para oficializar una respuesta comunitaria existente en el foro (CU-14)
create or replace function private.after_forum_answer_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  question_row public.questions%rowtype;
begin
  if new.official and not old.official then
    select * into question_row from public.questions where id = new.question_id;
    update public.questions set status = 'respondida', updated_at = now()
     where id = new.question_id and status <> 'cerrada';
    if question_row.author_id <> new.author_id then
      perform private.notify_user(
        question_row.author_id,
        'foro',
        'Respuesta validada como oficial',
        'Una respuesta en «' || question_row.title || '» fue validada oficialmente por el área.',
        '/foro/' || new.question_id::text,
        'alta'
      );
    end if;
    perform private.award_badge(new.author_id, 'respuesta_oficial_validada', 'Respuesta avalada por el área');
  end if;
  return new;
end;
$$;
revoke all on function private.after_forum_answer_update() from public, anon, authenticated;

drop trigger if exists forum_answer_official_update on public.answers;
create trigger forum_answer_official_update
after update on public.answers
for each row execute function private.after_forum_answer_update();

-- 3.2 Guías: adjuntos descargables (RF-12), progreso persistente de pasos y notificaciones de sugerencias/dudas
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'public-media';

alter table public.guides
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

create table if not exists public.guide_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  guide_id uuid not null references public.guides(id) on delete cascade,
  completed_steps jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, guide_id)
);
alter table public.guide_progress enable row level security;
grant select, insert, update, delete on public.guide_progress to authenticated;

drop policy if exists guide_progress_owner_all on public.guide_progress;
create policy guide_progress_owner_all on public.guide_progress
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Notificar al moderador del área cuando entra una sugerencia o pregunta en un paso de guía
create or replace function private.after_guide_suggestion_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guides%rowtype;
  mod_row record;
begin
  select * into g from public.guides where id = new.guide_id;
  if not found then return new; end if;
  for mod_row in
    select u.id from public.users u
     where u.is_active and not u.banned
       and ((u.role = 'moderador' and u.area = g.area) or u.role = 'admin')
       and u.id <> new.user_id
  loop
    perform private.notify_user(
      mod_row.id,
      'guias',
      'Nueva sugerencia en guía: ' || g.title,
      'Paso ' || (new.step_index + 1)::text || ': ' || left(new.body, 140),
      '/guias/' || g.id::text,
      'normal'
    );
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_guide_suggestion_notify on public.guide_suggestions;
create trigger trg_guide_suggestion_notify
after insert on public.guide_suggestions
for each row execute function private.after_guide_suggestion_insert();

create or replace function private.after_guide_step_question_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guides%rowtype;
  mod_row record;
begin
  select * into g from public.guides where id = new.guide_id;
  if not found then return new; end if;
  for mod_row in
    select u.id from public.users u
     where u.is_active and not u.banned
       and ((u.role = 'moderador' and u.area = g.area) or u.role = 'admin')
       and u.id <> new.author_id
  loop
    perform private.notify_user(
      mod_row.id,
      'guias',
      'Nueva duda en paso de guía: ' || g.title,
      'Paso ' || (new.step_index + 1)::text || ': ' || new.title,
      '/guias/' || g.id::text || '#pregunta-' || new.id::text,
      'normal'
    );
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_guide_step_question_notify on public.guide_step_questions;
create trigger trg_guide_step_question_notify
after insert on public.guide_step_questions
for each row execute function private.after_guide_step_question_insert();

-- 4.1 Espacios y eventos: ampliar permisos a becas y clubes_culturales
drop policy if exists space_events_approved_read on public.space_events;
create policy space_events_approved_read on public.space_events
for select to anon, authenticated using (
  approval_status = 'aprobado'
  or created_by = (select auth.uid())
  or private.is_admin_actor()
  or private.can_manage_area('comunicacion')
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
);

drop policy if exists space_events_staff_publish on public.space_events;
create policy space_events_staff_publish on public.space_events
for insert to authenticated with check (
  created_by = (select auth.uid())
  and approval_status = 'aprobado'
  and authorized_by = (select auth.uid())
  and (
    private.is_admin_actor()
    or private.can_manage_area('comunicacion')
    or private.can_manage_area('clubes_academicos')
    or private.can_manage_area('clubes_culturales')
    or private.can_manage_area('becas')
  )
);

drop policy if exists space_events_staff_review on public.space_events;
create policy space_events_staff_review on public.space_events
for update to authenticated using (
  private.is_admin_actor()
  or private.can_manage_area('comunicacion')
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
) with check (
  private.is_admin_actor()
  or private.can_manage_area('comunicacion')
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
);

drop policy if exists space_events_staff_delete on public.space_events;
create policy space_events_staff_delete on public.space_events
for delete to authenticated using (
  private.is_admin_actor()
  or private.can_manage_area('comunicacion')
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
);

-- 4.2 Auditoría enriquecida (old_value, new_value, ip_address) y parámetros configurables del sistema
alter table public.audit_logs
  add column if not exists old_value text,
  add column if not exists new_value text,
  add column if not exists ip_address text;

create table if not exists public.system_settings (
  key text primary key,
  value_int integer not null,
  label text not null,
  updated_at timestamptz not null default now()
);
alter table public.system_settings enable row level security;
grant select on public.system_settings to anon, authenticated;
grant insert, update on public.system_settings to authenticated;

drop policy if exists system_settings_read on public.system_settings;
create policy system_settings_read on public.system_settings
for select to anon, authenticated using (true);

drop policy if exists system_settings_admin_write on public.system_settings;
create policy system_settings_admin_write on public.system_settings
for all to authenticated
using (private.is_admin_actor())
with check (private.is_admin_actor());

insert into public.system_settings (key, value_int, label)
values
  ('club_interest_threshold', 20, 'Umbral de interesados para promover una propuesta de club'),
  ('forum_cooldown_minutes', 20, 'Minutos de enfriamiento entre preguntas del foro por usuario')
on conflict (key) do nothing;

-- Actualizar trigger de umbral de club para leer system_settings('club_interest_threshold')
create or replace function private.promote_club_proposal_at_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal_key uuid;
  current_status text;
  proposal_name text;
  proposer uuid;
  interested integer;
  threshold integer := 20;
begin
  select coalesce((select value_int from public.system_settings where key = 'club_interest_threshold'), 20)
    into threshold;
  proposal_key := case when tg_op = 'DELETE' then old.proposal_id else new.proposal_id end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(proposal_key::text, 1));

  select p.status, p.name, p.proposer_id
    into current_status, proposal_name, proposer
    from public.club_proposals p
   where p.id = proposal_key
   for update;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select count(*)::integer into interested
    from public.club_interests i
   where i.proposal_id = proposal_key;

  update public.club_proposals
     set interested_count = interested,
         status = case when current_status = 'abierta' and interested >= threshold then 'en_documentacion' else current_status end,
         updated_at = now()
   where id = proposal_key;

  if current_status = 'abierta' and interested >= threshold then
    insert into public.notifications (user_id, title, body, href, priority)
    values (
      proposer,
      'La propuesta llegó a la meta de interesados',
      '«' || proposal_name || '» puede comenzar la etapa de documentación y confirmación de asesoría.',
      '/clubes/propuestas/' || proposal_key::text,
      'alta'
    );

    insert into public.notifications (user_id, title, body, href, priority)
    select i.user_id,
           'La propuesta llegó a la meta de interesados',
           '«' || proposal_name || '» pasó a la etapa de documentación.',
           '/clubes/propuestas/' || proposal_key::text,
           'normal'
      from public.club_interests i
     where i.proposal_id = proposal_key and i.user_id <> proposer;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Métricas ampliadas para /admin (CU-32: activos hoy y preguntas sin respuesta > 24 h)
drop function if exists public.admin_dashboard_metrics();
create or replace function public.admin_dashboard_metrics()
returns table (
  users_total bigint,
  notices_total bigint,
  clubs_total bigint,
  lost_total bigint,
  questions_total bigint,
  active_30_days bigint,
  active_today bigint,
  questions_open bigint,
  questions_unanswered_24h bigint,
  questions_answered bigint,
  handoffs_pending bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin_actor() then raise exception 'Solo administración general'; end if;
  return query select
    (select count(*) from public.users where is_active),
    (select count(*) from public.avisos),
    (select count(*) from public.clubs where active),
    (select count(*) from public.lost_items where status = 'abierto'),
    (select count(*) from public.questions),
    (select count(distinct actor_id) from public.audit_logs where actor_id is not null and created_at >= now() - interval '30 days'),
    (select count(distinct actor_id) from public.audit_logs where actor_id is not null and created_at >= date_trunc('day', now())),
    (select count(*) from public.questions where status = 'sin_responder'),
    (select count(*) from public.questions where status = 'sin_responder' and created_at <= now() - interval '24 hours'),
    (select count(*) from public.questions where status = 'respondida'),
    (select count(*) from public.lost_item_handoffs h join public.lost_item_claims c on c.id = h.claim_id join public.lost_items i on i.id = c.lost_item_id where h.status = 'pendiente' and h.expires_at > now() and i.status = 'abierto');
end;
$$;
revoke all on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;
