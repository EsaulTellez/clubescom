-- Fase 1: Identidad, ARCO, Seguridad, Insignias automáticas y Notificaciones base

-- 1.1 Notificaciones in-app filtradas por preferencias (categorías: clubes, foro, objetos, guias, avisos, sistema)
alter table public.notification_prefs
  add column if not exists inapp_guides boolean not null default true,
  add column if not exists inapp_notices boolean not null default true;

create or replace function private.notify_user(
  p_user_id uuid,
  p_category text,
  p_title text,
  p_body text,
  p_href text default null,
  p_priority text default 'normal'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefs public.notification_prefs%rowtype;
  allowed boolean := true;
begin
  if p_user_id is null then return; end if;
  select * into prefs from public.notification_prefs where user_id = p_user_id;
  if found then
    if p_category = 'clubes' then allowed := prefs.email_clubs;
    elsif p_category = 'foro' then allowed := prefs.email_forum;
    elsif p_category = 'objetos' then allowed := prefs.email_lost;
    elsif p_category = 'guias' then allowed := prefs.inapp_guides;
    elsif p_category = 'avisos' then allowed := prefs.inapp_notices;
    end if;
  end if;
  if not allowed and p_category <> 'sistema' then return; end if;

  insert into public.notifications (user_id, title, body, href, priority)
  values (p_user_id, p_title, p_body, p_href, coalesce(p_priority, 'normal'));
end;
$$;
revoke all on function private.notify_user(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_user_event(
  p_user_id uuid,
  p_category text,
  p_title text,
  p_body text,
  p_href text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_actor() then return; end if;
  perform private.notify_user(p_user_id, p_category, p_title, p_body, p_href, 'normal');
end;
$$;
revoke all on function public.notify_user_event(uuid, text, text, text, text) from public, anon;
grant execute on function public.notify_user_event(uuid, text, text, text, text) to authenticated;

create or replace function public.notify_area_moderators(
  p_area text,
  p_category text,
  p_title text,
  p_body text,
  p_href text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mod_row record;
begin
  if not private.is_active_actor() then return; end if;
  for mod_row in
    select u.id
      from public.users u
     where u.is_active and not u.banned
       and ((u.role = 'moderador' and u.area = p_area) or u.role = 'admin')
       and u.id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    perform private.notify_user(mod_row.id, p_category, p_title, p_body, p_href, 'normal');
  end loop;
end;
$$;
revoke all on function public.notify_area_moderators(text, text, text, text, text) from public, anon;
grant execute on function public.notify_area_moderators(text, text, text, text, text) to authenticated;

-- Interceptor en public.notifications para que cualquier inserción directa de triggers previos respete notification_prefs
create or replace function private.filter_notification_by_prefs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefs public.notification_prefs%rowtype;
  href_val text := coalesce(new.href, '');
begin
  select * into prefs from public.notification_prefs where user_id = new.user_id;
  if not found then return new; end if;

  if href_val like '/clubes%' and not prefs.email_clubs then return null; end if;
  if href_val like '/foro%' and not prefs.email_forum then return null; end if;
  if href_val like '/objetos%' and not prefs.email_lost then return null; end if;
  if href_val like '/guias%' and not prefs.inapp_guides then return null; end if;
  if href_val like '/avisos%' and not prefs.inapp_notices then return null; end if;
  return new;
end;
$$;
revoke all on function private.filter_notification_by_prefs() from public, anon, authenticated;

drop trigger if exists notifications_check_prefs on public.notifications;
create trigger notifications_check_prefs
before insert on public.notifications
for each row execute function private.filter_notification_by_prefs();

-- 1.2 Edición de perfil propio (nombre y boleta)
create or replace function public.update_my_profile(p_name text, p_boleta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  clean_boleta text := nullif(trim(coalesce(p_boleta, '')), '');
begin
  if not private.is_active_actor() then
    raise exception 'Se requiere una cuenta activa';
  end if;
  if length(clean_name) < 3 or length(clean_name) > 120 then
    raise exception 'El nombre debe tener entre 3 y 120 caracteres';
  end if;
  if clean_boleta is not null and (length(clean_boleta) < 4 or length(clean_boleta) > 32 or clean_boleta !~ '^[A-Za-z0-9-]+$') then
    raise exception 'La boleta o número de empleado debe tener de 4 a 32 caracteres alfanuméricos';
  end if;

  update public.users set name = clean_name where id = actor_id;
  insert into private.user_private (user_id, email, boleta, updated_at)
  select actor_id, coalesce((select email from private.user_private where user_id = actor_id), ''), clean_boleta, now()
  on conflict (user_id) do update
    set boleta = excluded.boleta,
        updated_at = now();
end;
$$;
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- 1.3 Derechos ARCO e incidentes de privacidad
create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('rectificacion', 'oposicion', 'cancelacion', 'incidente')),
  detail text not null check (length(trim(detail)) between 10 and 2000),
  status text not null default 'pendiente' check (status in ('pendiente', 'en_revision', 'resuelta', 'rechazada')),
  resolution_note text,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.privacy_requests enable row level security;
grant select, insert, update on public.privacy_requests to authenticated;

drop policy if exists privacy_requests_owner_or_admin_read on public.privacy_requests;
create policy privacy_requests_owner_or_admin_read on public.privacy_requests
for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin_actor());

drop policy if exists privacy_requests_owner_insert on public.privacy_requests;
create policy privacy_requests_owner_insert on public.privacy_requests
for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pendiente' and resolved_by is null);

drop policy if exists privacy_requests_admin_update on public.privacy_requests;
create policy privacy_requests_admin_update on public.privacy_requests
for update to authenticated
using (private.is_admin_actor())
with check (private.is_admin_actor());

-- 1.4 Otorgamiento automático de insignias (CU-04)
create or replace function private.award_badge(p_user_id uuid, p_code text, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  if p_user_id is null then return; end if;
  insert into public.badges (user_id, code, label)
  values (p_user_id, p_code, p_label)
  on conflict (user_id, code) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    perform private.notify_user(
      p_user_id,
      'sistema',
      'Nueva insignia obtenida: ' || p_label,
      'Se agregó la insignia «' || p_label || '» a tu perfil por tu participación en la comunidad ESCOM.',
      '/perfil',
      'normal'
    );
  end if;
end;
$$;
revoke all on function private.award_badge(uuid, text, text) from public, anon, authenticated;

-- Trigger 1: Primera pregunta en el foro
create or replace function private.badge_on_question_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.award_badge(new.author_id, 'primera_pregunta', 'Primera duda en el foro');
  return new;
end;
$$;
drop trigger if exists trg_badge_question on public.questions;
create trigger trg_badge_question
after insert on public.questions
for each row execute function private.badge_on_question_insert();

-- Trigger 2: Primera respuesta en el foro / 5 respuestas
create or replace function private.badge_on_answer_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  perform private.award_badge(new.author_id, 'colaborador_foro', 'Colaborador del foro');
  select count(*)::integer into total from public.answers where author_id = new.author_id;
  if total >= 5 then
    perform private.award_badge(new.author_id, 'mentor_comunidad', 'Mentor de la comunidad (5+ respuestas)');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_badge_answer on public.answers;
create trigger trg_badge_answer
after insert on public.answers
for each row execute function private.badge_on_answer_insert();

-- Trigger 3: Sugerencia de guía aceptada
create or replace function private.badge_on_guide_suggestion_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'aceptada' and old.status <> 'aceptada' then
    perform private.award_badge(new.user_id, 'colaborador_guia', 'Colaborador de guías');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_badge_guide_suggestion on public.guide_suggestions;
create trigger trg_badge_guide_suggestion
after update on public.guide_suggestions
for each row execute function private.badge_on_guide_suggestion_update();

-- Trigger 4: Objeto perdido devuelto
create or replace function private.badge_on_handoff_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completado' and old.status <> 'completado' then
    perform private.award_badge(new.finder_id, 'objeto_devuelto', 'Comunidad solidaria (objeto devuelto)');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_badge_handoff on public.lost_item_handoffs;
create trigger trg_badge_handoff
after update on public.lost_item_handoffs
for each row execute function private.badge_on_handoff_complete();

-- Trigger 5: Fundador o impulsor de club
create or replace function private.badge_on_club_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.leader_id is not null then
    perform private.award_badge(new.leader_id, 'fundador_club', 'Líder de club estudiantil');
  end if;
  if new.advisor_id is not null then
    perform private.award_badge(new.advisor_id, 'asesor_club', 'Profesor asesor de club');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_badge_club on public.clubs;
create trigger trg_badge_club
after insert on public.clubs
for each row execute function private.badge_on_club_insert();
