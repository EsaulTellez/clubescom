-- Initial Supabase schema for the local ESCOM demo.
-- Auth owns credentials and email addresses. Public profiles contain no email,
-- boleta, password hash, security answer, or verification token.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create type public.user_role as enum ('alumno', 'profesor', 'moderador', 'admin');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role public.user_role not null,
  area text,
  is_active boolean not null default false,
  banned boolean not null default false,
  admin_banned boolean not null default false,
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  check ((role = 'moderador' and area is not null) or (role <> 'moderador' and area is null))
);

create table private.user_private (
  user_id uuid primary key references public.users(id) on delete cascade,
  email text unique not null,
  boleta text unique,
  updated_at timestamptz not null default now()
);
alter table private.user_private enable row level security;
revoke all on private.user_private from public, anon, authenticated;

create or replace function private.role_from_institutional_email(p_email text)
returns public.user_role
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_email, '')) ~ '^[^@]+@alumno[.]ipn[.]mx$' then 'alumno'::public.user_role
    when lower(coalesce(p_email, '')) ~ '^[^@]+@ipn[.]mx$' then 'profesor'::public.user_role
    else null
  end;
$$;
revoke all on function private.role_from_institutional_email(text) from public, anon, authenticated;

create or replace function private.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role public.user_role;
begin
  assigned_role := private.role_from_institutional_email(new.email);
  if assigned_role is null then
    raise exception 'Solo se permiten correos institucionales @alumno.ipn.mx o @ipn.mx';
  end if;

  insert into public.users (id, name, role, is_active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    assigned_role,
    new.email_confirmed_at is not null
  );

  insert into private.user_private (user_id, email, boleta)
  values (new.id, lower(new.email), nullif(trim(new.raw_user_meta_data ->> 'boleta'), ''));

  return new;
end;
$$;
revoke all on function private.handle_auth_user_created() from public, anon, authenticated;

create or replace function private.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.role_from_institutional_email(new.email) is null then
    raise exception 'El correo debe conservar un dominio institucional permitido';
  end if;
  update public.users
     set is_active = new.email_confirmed_at is not null
   where id = new.id;
  update private.user_private
     set email = lower(new.email), updated_at = now()
   where user_id = new.id;
  return new;
end;
$$;
revoke all on function private.handle_auth_user_updated() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_auth_user_created();

create trigger on_auth_user_updated
after update of email, email_confirmed_at on auth.users
for each row execute function private.handle_auth_user_updated();

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code text not null,
  label text not null,
  awarded_at timestamptz not null default now(),
  unique (user_id, code)
);

create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null check (category in ('academico', 'social', 'tramites')),
  featured boolean not null default false,
  is_public boolean not null default true,
  publish_at timestamptz not null default now(),
  social_copy text,
  created_at timestamptz not null default now()
);
create index avisos_feed on public.avisos (publish_at desc, created_at desc);

create table public.guides (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  area text not null,
  title text not null,
  summary text not null default '',
  steps jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  source_path text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guides_area_created on public.guides (area, created_at desc);

create table public.guide_versions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  version integer not null check (version > 0),
  edited_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  summary text not null default '',
  steps jsonb not null,
  faqs jsonb not null default '[]'::jsonb,
  change_note text,
  created_at timestamptz not null default now(),
  unique (guide_id, version)
);

create table public.guide_suggestions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  body text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  review_note text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index guide_suggestions_guide_status on public.guide_suggestions (guide_id, status, created_at desc);

create table public.guide_step_questions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  author_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'respondida', 'cerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guide_step_questions_feed on public.guide_step_questions (guide_id, step_index, created_at desc);

create table public.guide_step_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.guide_step_questions(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  official boolean not null default false,
  created_at timestamptz not null default now()
);
create index guide_step_answers_question on public.guide_step_answers (question_id, official desc, created_at);

create table public.guide_step_answer_votes (
  answer_id uuid not null references public.guide_step_answers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  helpful boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (answer_id, user_id)
);

create table public.guide_analytics_events (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  anonymous_session uuid,
  event_type text not null check (event_type in ('view', 'step_view', 'step_complete', 'faq_open', 'question_open', 'leave')),
  step_index integer check (step_index is null or step_index >= 0),
  occurred_at timestamptz not null default now(),
  check (user_id is null or anonymous_session is null)
);
create index guide_analytics_guide_time on public.guide_analytics_events (guide_id, occurred_at desc);
create index guide_analytics_guide_step on public.guide_analytics_events (guide_id, step_index, event_type);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  area text not null,
  title text not null,
  body text not null,
  status text not null default 'sin_responder' check (status in ('sin_responder', 'respondida', 'cerrada')),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_area_feed on public.questions (area, status, created_at desc);
create index questions_title_trgm on public.questions using gin (title extensions.gin_trgm_ops);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  official boolean not null default false,
  created_at timestamptz not null default now()
);
create index answers_question_order on public.answers (question_id, official desc, created_at);

create table public.question_votes (
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create table public.club_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('academico', 'cultural', 'deportivo')),
  description text not null,
  plan_url text,
  status text not null default 'abierta' check (status in ('abierta', 'en_documentacion', 'en_validacion', 'cita_pendiente', 'cita_confirmada', 'registrado', 'incompleta', 'rechazada')),
  advisor_id uuid references public.users(id) on delete set null,
  advisor_confirmed_at timestamptz,
  interested_count integer not null default 0 check (interested_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_proposals_status_date on public.club_proposals (status, created_at desc);

create table public.club_interests (
  proposal_id uuid not null references public.club_proposals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create table private.club_advisor_codes (
  proposal_id uuid primary key references public.club_proposals(id) on delete cascade,
  advisor_id uuid not null references public.users(id) on delete cascade,
  code_hash bytea not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.club_advisor_codes enable row level security;
revoke all on private.club_advisor_codes from public, anon, authenticated;

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid unique references public.club_proposals(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('academico', 'cultural', 'deportivo')),
  description text not null,
  schedule text,
  leader_id uuid references public.users(id) on delete set null,
  advisor_id uuid references public.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.memberships (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index club_posts_feed on public.club_posts (club_id, created_at desc);

create table public.club_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  location text not null default 'Por confirmar',
  approval_status text not null default 'pendiente' check (approval_status in ('pendiente', 'aprobado', 'rechazado')),
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((approval_status = 'aprobado' and approved_by is not null) or approval_status <> 'aprobado')
);
create index club_events_upcoming on public.club_events (club_id, starts_at);

create table public.club_proposal_documents (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.club_proposals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  document_type text not null check (document_type in ('credencial_ipn', 'boleta', 'firma', 'vigencia_ims')),
  storage_path text not null unique,
  status text not null default 'recibido' check (status in ('faltante', 'recibido', 'requiere_correccion', 'validacion_presencial_pendiente')),
  review_note text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id, user_id, document_type)
);
create index club_proposal_documents_status on public.club_proposal_documents (proposal_id, status, user_id);

create table public.club_appointments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.club_proposals(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete cascade,
  requested_slots jsonb not null default '[]'::jsonb,
  scheduled_at timestamptz,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmada', 'rechazada', 'completada', 'cancelada')),
  subdireccion_notes text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'confirmada' and scheduled_at is not null and reviewed_by is not null) or status <> 'confirmada')
);
create index club_appointments_schedule on public.club_appointments (scheduled_at, status);
create unique index club_appointments_one_open_per_proposal on public.club_appointments (proposal_id)
where status in ('pendiente', 'confirmada');

create table public.lost_items (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('perdido', 'encontrado')),
  title text not null,
  description text not null,
  place text not null,
  photo_url text,
  status text not null default 'abierto' check (status in ('abierto', 'entregado', 'cerrado')),
  security_question text,
  matched_id uuid references public.lost_items(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'encontrado' or security_question is not null)
);
create index lost_items_title_trgm on public.lost_items using gin (title extensions.gin_trgm_ops);
create index lost_items_desc_trgm on public.lost_items using gin (description extensions.gin_trgm_ops);

create table private.lost_item_secrets (
  lost_item_id uuid primary key references public.lost_items(id) on delete cascade,
  security_answer_hash text not null,
  updated_at timestamptz not null default now()
);
alter table private.lost_item_secrets enable row level security;
revoke all on private.lost_item_secrets from public, anon, authenticated;

create table public.lost_item_matches (
  item_a_id uuid not null references public.lost_items(id) on delete cascade,
  item_b_id uuid not null references public.lost_items(id) on delete cascade,
  similarity_score numeric(5,4) not null check (similarity_score >= 0.8 and similarity_score <= 1),
  created_at timestamptz not null default now(),
  primary key (item_a_id, item_b_id),
  check (item_a_id < item_b_id)
);

create table public.lost_item_claims (
  id uuid primary key default gen_random_uuid(),
  lost_item_id uuid not null references public.lost_items(id) on delete cascade,
  claimant_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'respuesta_correcta', 'aprobada', 'rechazada', 'entregada', 'cancelada')),
  claimant_note text,
  evidence_path text,
  reviewed_by uuid references public.users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lost_item_id, claimant_id)
);
create index lost_item_claims_item_status on public.lost_item_claims (lost_item_id, status, created_at desc);

create table private.lost_item_claim_answers (
  claim_id uuid primary key references public.lost_item_claims(id) on delete cascade,
  answer_hash text not null,
  created_at timestamptz not null default now()
);
alter table private.lost_item_claim_answers enable row level security;
revoke all on private.lost_item_claim_answers from public, anon, authenticated;

create table public.lost_item_handoffs (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.lost_item_claims(id) on delete cascade,
  finder_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'verificado', 'completado', 'expirado', 'cancelado')),
  expires_at timestamptz not null default now() + interval '24 hours',
  verified_by uuid references public.users(id) on delete set null,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (finder_id <> recipient_id)
);

create table private.lost_item_handoff_secrets (
  handoff_id uuid primary key references public.lost_item_handoffs(id) on delete cascade,
  token_hash text not null,
  token text not null,
  created_at timestamptz not null default now()
);
alter table private.lost_item_handoff_secrets enable row level security;
revoke all on private.lost_item_handoff_secrets from public, anon, authenticated;

-- Mutations keep answer hashes and handoff credentials out of public tables.
create or replace function public.create_lost_item(
  p_kind text, p_title text, p_description text, p_place text,
  p_photo_url text, p_security_question text, p_answer_hash text
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

  insert into public.lost_items (reporter_id, kind, title, description, place, photo_url, security_question)
  values (actor_id, p_kind, trim(p_title), trim(p_description), trim(p_place), p_photo_url,
          case when p_kind = 'encontrado' then trim(p_security_question) else null end)
  returning id into item_id;

  if p_kind = 'encontrado' then
    insert into private.lost_item_secrets (lost_item_id, security_answer_hash)
    values (item_id, lower(p_answer_hash));
  end if;
  return item_id;
end;
$$;

create or replace function public.submit_lost_item_claim(p_item_id uuid, p_answer_hash text, p_note text default null)
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
begin
  if not private.is_active_actor() then raise exception 'Se requiere una cuenta activa'; end if;
  select li.reporter_id, li.status, s.security_answer_hash
    into item_owner, item_status, expected_hash
    from public.lost_items li
    left join private.lost_item_secrets s on s.lost_item_id = li.id
   where li.id = p_item_id and li.kind = 'encontrado';
  if not found or item_status <> 'abierto' or item_owner = actor_id then
    raise exception 'No se puede reclamar este reporte';
  end if;
  if expected_hash is null or expected_hash <> lower(coalesce(p_answer_hash, '')) then
    return;
  end if;
  insert into public.lost_item_claims (lost_item_id, claimant_id, status, claimant_note)
  values (p_item_id, actor_id, 'respuesta_correcta', nullif(trim(p_note), ''))
  returning id into new_claim_id;
  insert into private.lost_item_claim_answers (claim_id, answer_hash)
  values (new_claim_id, lower(p_answer_hash));
  return query select new_claim_id, 'respuesta_correcta'::text;
end;
$$;

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
  handoff_id uuid;
begin
  select c.* into claim_row from public.lost_item_claims c where c.id = p_claim_id for update;
  if not found then raise exception 'No encontramos el reclamo'; end if;
  select li.reporter_id into item_owner from public.lost_items li where li.id = claim_row.lost_item_id;
  if item_owner <> (select auth.uid()) or claim_row.status <> 'respuesta_correcta' then
    raise exception 'Solo quien publicó el hallazgo puede revisar este reclamo';
  end if;
  if p_approve then
    if length(coalesce(p_token, '')) < 6 or length(coalesce(p_token_hash, '')) <> 64 then
      raise exception 'No se generó el código de entrega';
    end if;
    update public.lost_item_claims
       set status = 'aprobada', review_note = nullif(trim(p_review_note), ''), reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
     where id = p_claim_id;
    insert into public.lost_item_handoffs (claim_id, finder_id, recipient_id)
    values (p_claim_id, item_owner, claim_row.claimant_id)
    returning id into handoff_id;
    insert into private.lost_item_handoff_secrets (handoff_id, token_hash, token)
    values (handoff_id, lower(p_token_hash), upper(p_token));
    insert into public.notifications (user_id, title, body, href)
    values (claim_row.claimant_id, 'Tu reclamo fue aprobado', 'Presenta tu código de entrega al momento de recibir el objeto.', '/objetos/' || claim_row.lost_item_id::text);
  else
    update public.lost_item_claims
       set status = 'rechazada', review_note = nullif(trim(p_review_note), ''), reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
     where id = p_claim_id;
    insert into public.notifications (user_id, title, body, href)
    values (claim_row.claimant_id, 'Actualización de tu reclamo', coalesce(nullif(trim(p_review_note), ''), 'Quien publicó el hallazgo no pudo confirmar el reclamo.'), '/objetos/' || claim_row.lost_item_id::text);
  end if;
  return handoff_id;
end;
$$;

create or replace function public.get_my_lost_item_handoff(p_item_id uuid)
returns table (handoff_id uuid, token text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, s.token, h.expires_at
    from public.lost_item_handoffs h
    join public.lost_item_claims c on c.id = h.claim_id
    join private.lost_item_handoff_secrets s on s.handoff_id = h.id
   where c.lost_item_id = p_item_id and h.recipient_id = (select auth.uid())
     and h.status = 'pendiente' and h.expires_at > now();
$$;

create or replace function public.complete_lost_item_handoff(p_handoff_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  handoff public.lost_item_handoffs%rowtype;
  expected_hash text;
begin
  select h.* into handoff from public.lost_item_handoffs h where h.id = p_handoff_id for update;
  if not found or handoff.finder_id <> (select auth.uid()) or handoff.status <> 'pendiente' or handoff.expires_at <= now() then
    return false;
  end if;
  select s.token_hash into expected_hash from private.lost_item_handoff_secrets s where s.handoff_id = p_handoff_id;
  if expected_hash is null or expected_hash <> lower(coalesce(p_token_hash, '')) then return false; end if;
  update public.lost_item_handoffs set status = 'completado', verified_by = handoff.recipient_id, verified_at = now(), completed_at = now() where id = p_handoff_id;
  update public.lost_item_claims set status = 'entregada', updated_at = now() where id = handoff.claim_id;
  update public.lost_items set status = 'entregado' where id = (select c.lost_item_id from public.lost_item_claims c where c.id = handoff.claim_id);
  insert into public.notifications (user_id, title, body, href)
  values (handoff.recipient_id, 'Entrega confirmada', 'El objeto se marcó como entregado.', '/objetos/' || (select c.lost_item_id::text from public.lost_item_claims c where c.id = handoff.claim_id));
  return true;
end;
$$;

revoke all on function public.create_lost_item(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.submit_lost_item_claim(uuid, text, text) from public, anon;
revoke all on function public.review_lost_item_claim(uuid, boolean, text, text, text) from public, anon;
revoke all on function public.get_my_lost_item_handoff(uuid) from public, anon;
revoke all on function public.complete_lost_item_handoff(uuid, text) from public, anon;
grant execute on function public.create_lost_item(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_lost_item_claim(uuid, text, text) to authenticated;
grant execute on function public.review_lost_item_claim(uuid, boolean, text, text, text) to authenticated;
grant execute on function public.get_my_lost_item_handoff(uuid) to authenticated;
grant execute on function public.complete_lost_item_handoff(uuid, text) to authenticated;

create or replace function private.match_lost_item_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  score numeric(5,4);
begin
  for candidate in
    select li.id,
           extensions.similarity(
             lower(concat_ws(' ', li.title, li.description)),
             lower(concat_ws(' ', new.title, new.description))
           ) as score
      from public.lost_items li
     where li.id <> new.id
       and li.kind <> new.kind
       and li.status = 'abierto'
  loop
    score := candidate.score;
    if score >= 0.8 then
      insert into public.lost_item_matches (item_a_id, item_b_id, similarity_score)
      values (least(candidate.id, new.id), greatest(candidate.id, new.id), score)
      on conflict (item_a_id, item_b_id) do update
        set similarity_score = greatest(public.lost_item_matches.similarity_score, excluded.similarity_score);
      update public.lost_items
         set matched_id = new.id
       where id = candidate.id and matched_id is null;
      if new.matched_id is null then
        update public.lost_items set matched_id = candidate.id where id = new.id;
      end if;
      insert into public.notifications (user_id, title, body, href)
      select li.reporter_id, 'Posible coincidencia', 'Hay un reporte del tipo contrario que comparte detalles con el tuyo.', '/objetos/' || li.id::text
        from public.lost_items li
       where li.id in (candidate.id, new.id)
      on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.match_lost_item_after_insert() from public, anon, authenticated;

create trigger lost_item_auto_match
after insert on public.lost_items
for each row execute function private.match_lost_item_after_insert();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  href text,
  priority text not null default 'normal' check (priority in ('normal', 'alta')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_feed on public.notifications (user_id, read, created_at desc);

create table public.notification_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  email_clubs boolean not null default true,
  email_forum boolean not null default true,
  email_lost boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on column public.notification_prefs.email_clubs is 'Legacy-compatible preference flag; product email delivery is disabled.';
comment on column public.notification_prefs.email_forum is 'Legacy-compatible preference flag; product email delivery is disabled.';
comment on column public.notification_prefs.email_lost is 'Legacy-compatible preference flag; product email delivery is disabled.';

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
begin
  proposal_key := case when tg_op = 'DELETE' then old.proposal_id else new.proposal_id end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(proposal_key::text, 1));

  select p.status, p.name, p.proposer_id
    into current_status, proposal_name, proposer
    from public.club_proposals p
   where p.id = proposal_key
   for update;
  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select count(*)::integer into interested
    from public.club_interests i
   where i.proposal_id = proposal_key;

  update public.club_proposals
     set interested_count = interested,
         status = case when current_status = 'abierta' and interested >= 20 then 'en_documentacion' else current_status end,
         updated_at = now()
   where id = proposal_key;

  if current_status = 'abierta' and interested >= 20 then
    insert into public.notifications (user_id, title, body, href, priority)
    values (
      proposer,
      'La propuesta llegó a 20 interesados',
      '«' || proposal_name || '» puede comenzar la etapa de documentación y confirmación de asesoría.',
      '/clubes/propuestas/' || proposal_key::text,
      'alta'
    );

    insert into public.notifications (user_id, title, body, href, priority)
    select i.user_id,
           'La propuesta llegó a 20 interesados',
           '«' || proposal_name || '» pasó a la etapa de documentación.',
           '/clubes/propuestas/' || proposal_key::text,
           'normal'
      from public.club_interests i
     where i.proposal_id = proposal_key and i.user_id <> proposer;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.promote_club_proposal_at_threshold() from public, anon, authenticated;

create trigger club_proposal_interests_threshold
after insert or delete on public.club_interests
for each row execute function private.promote_club_proposal_at_threshold();

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null,
  building text,
  description text
);

create table public.cubicles (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid references public.users(id) on delete cascade,
  label text not null,
  building text not null,
  floor text,
  x numeric not null default 20 check (x between 0 and 100),
  y numeric not null default 20 check (y between 0 and 100),
  unique (professor_id),
  unique (building, floor, label)
);

-- This replaces room reservations: student-submitted events stay pending until
-- authorized by school staff; staff-created event listings are already approved.
create table public.space_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid not null references public.users(id) on delete cascade,
  approval_status text not null default 'pendiente' check (approval_status in ('pendiente', 'aprobado', 'rechazado')),
  authorized_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check ((approval_status = 'aprobado' and authorized_by is not null) or approval_status <> 'aprobado')
);
create index space_events_public_feed on public.space_events (starts_at) where approval_status = 'aprobado';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  area text,
  action text not null,
  entity text not null,
  entity_id text,
  detail text,
  created_at timestamptz not null default now()
);
create index audit_logs_area_date on public.audit_logs (area, created_at desc);

create table public.moderation_strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  moderator_id uuid references public.users(id) on delete set null,
  area text not null,
  reason text not null,
  source_type text not null,
  source_id uuid,
  created_at timestamptz not null default now()
);
create index moderation_strikes_user_date on public.moderation_strikes (user_id, created_at desc);
create index moderation_strikes_area_date on public.moderation_strikes (area, created_at desc);

create table public.moderation_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  area text not null,
  strike_count integer not null check (strike_count >= 3),
  duration interval,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_permanent boolean not null default false,
  created_at timestamptz not null default now(),
  check ((is_permanent and ends_at is null) or (not is_permanent and ends_at is not null))
);
create index moderation_suspensions_user_date on public.moderation_suspensions (user_id, starts_at desc);

create table public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  suspension_id uuid not null references public.moderation_suspensions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  reviewed_by uuid references public.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index moderation_appeals_one_pending on public.moderation_appeals (suspension_id) where status = 'pendiente';

create or replace function private.is_active_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
     where u.id = (select auth.uid())
       and u.is_active
       and not u.banned
       and (u.suspended_until is null or u.suspended_until <= now())
  );
$$;

create or replace function private.is_admin_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
     where u.id = (select auth.uid())
       and u.role = 'admin'
       and u.is_active
       and not u.banned
       and (u.suspended_until is null or u.suspended_until <= now())
  );
$$;

create or replace function private.can_manage_area(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
     where u.id = (select auth.uid())
       and u.is_active
       and not u.banned
       and (u.suspended_until is null or u.suspended_until <= now())
       and (u.role = 'admin' or (u.role = 'moderador' and u.area = p_area))
  );
$$;

create or replace function private.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clubs c
     where c.id = p_club_id and c.leader_id = (select auth.uid())
  ) or exists (
    select 1 from public.memberships m
     where m.club_id = p_club_id and m.user_id = (select auth.uid()) and m.status = 'aceptada'
  );
$$;

create or replace function private.can_review_club_proposal(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_actor()
      or private.can_manage_area('clubes_academicos')
      or private.can_manage_area('subdireccion_academica')
      or exists (
        select 1 from public.club_proposals p
         where p.id = p_proposal_id and p.proposer_id = (select auth.uid())
      );
$$;

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
       and (select count(*) from public.club_interests i where i.proposal_id = p.id) >= 20
       and not exists (
         select 1
           from public.club_interests i
           cross join (values ('credencial_ipn'), ('boleta'), ('firma'), ('vigencia_ims')) required(document_type)
           left join public.club_proposal_documents d
             on d.proposal_id = i.proposal_id
            and d.user_id = i.user_id
            and d.document_type = required.document_type
            and d.status = 'recibido'
          where i.proposal_id = p.id
            and d.id is null
       )
  );
$$;

create or replace function private.is_lost_item_participant(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lost_items li
     where li.id = p_item_id and li.reporter_id = (select auth.uid())
  ) or exists (
    select 1 from public.lost_item_claims c
     where c.lost_item_id = p_item_id and c.claimant_id = (select auth.uid())
  );
$$;

create or replace function private.can_access_lost_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[];
begin
  parts := storage.foldername(p_path);
  if coalesce(array_length(parts, 1), 0) < 2 or parts[1] !~* '^[0-9a-f-]{36}$' then
    return false;
  end if;
  return private.is_lost_item_participant(parts[1]::uuid)
      and (parts[2] = (select auth.uid())::text or private.is_admin_actor());
end;
$$;

create or replace function private.apply_moderation_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_strikes integer;
  duration_value interval;
  permanent_value boolean := false;
  end_value timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  select count(*)::integer into total_strikes
    from public.moderation_strikes ms
   where ms.user_id = new.user_id;

  if total_strikes < 3 or total_strikes % 3 <> 0 then
    return new;
  end if;

  if total_strikes = 3 then
    duration_value := interval '1 month';
  elsif total_strikes = 6 then
    duration_value := interval '3 months';
  elsif total_strikes = 9 then
    duration_value := interval '6 months';
  else
    permanent_value := true;
    duration_value := null;
  end if;

  if not permanent_value then
    end_value := now() + duration_value;
  end if;

  insert into public.moderation_suspensions
    (user_id, area, strike_count, duration, starts_at, ends_at, is_permanent)
  values
    (new.user_id, new.area, total_strikes, duration_value, now(), end_value, permanent_value);

  update public.users as u
     set banned = u.admin_banned or permanent_value,
         suspended_until = case when permanent_value then null else end_value end
   where u.id = new.user_id;

  return new;
end;
$$;
revoke all on function private.apply_moderation_suspension() from public, anon, authenticated;

create trigger moderation_suspension_after_third_strike
after insert on public.moderation_strikes
for each row execute function private.apply_moderation_suspension();

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
  inserted_id uuid;
  total integer;
  created_suspension uuid;
  person_name text;
begin
  if not private.is_active_actor() or not private.can_manage_area(p_area) then
    raise exception 'No tienes permiso para moderar esta área';
  end if;
  if p_user_id = actor_id or length(trim(coalesce(p_reason, ''))) < 8
     or length(p_reason) > 1000 or coalesce(p_source_type, '') not in ('foro', 'guia', 'aviso', 'club', 'objeto', 'otro') then
    raise exception 'Los datos de la infracción no son válidos';
  end if;
  if not exists (
    select 1 from public.users u
     where u.id = p_user_id and u.is_active and u.role <> 'admin'
  ) then
    raise exception 'No encontramos a la persona o no se puede sancionar esa cuenta';
  end if;

  insert into public.moderation_strikes (user_id, moderator_id, area, reason, source_type)
  values (p_user_id, actor_id, p_area, trim(p_reason), p_source_type)
  returning id into inserted_id;

  select count(*)::integer into total
    from public.moderation_strikes ms where ms.user_id = p_user_id;
  select u.name into person_name from public.users u where u.id = p_user_id;
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

create or replace function public.review_moderation_appeal(
  p_appeal_id uuid, p_accepted boolean, p_review_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  appeal_row public.moderation_appeals%rowtype;
  suspension_row public.moderation_suspensions%rowtype;
  decision text := case when p_accepted then 'aceptada' else 'rechazada' end;
begin
  if not private.is_admin_actor() then
    raise exception 'Solo el administrador general puede resolver apelaciones';
  end if;
  if length(trim(coalesce(p_review_note, ''))) < 5 or length(p_review_note) > 1000 then
    raise exception 'Escribe el motivo de la decisión (5 a 1000 caracteres)';
  end if;

  select a.* into appeal_row
    from public.moderation_appeals a
   where a.id = p_appeal_id and a.status = 'pendiente'
   for update;
  if not found then raise exception 'La apelación ya fue resuelta o no existe'; end if;
  select s.* into suspension_row
    from public.moderation_suspensions s
   where s.id = appeal_row.suspension_id
   for update;

  update public.moderation_appeals
     set status = decision,
         reviewed_by = (select auth.uid()),
         review_note = trim(p_review_note),
         reviewed_at = now()
   where id = p_appeal_id;

  if p_accepted then
    update public.moderation_suspensions
       set is_permanent = false,
           duration = interval '0 seconds',
           ends_at = now()
     where id = suspension_row.id;

    update public.users u
       set banned = u.admin_banned or exists (
             select 1 from public.moderation_suspensions other
              where other.user_id = u.id and other.id <> suspension_row.id
                and other.is_permanent
           ),
           suspended_until = (
             select max(other.ends_at) from public.moderation_suspensions other
              where other.user_id = u.id and other.id <> suspension_row.id
                and not other.is_permanent and other.ends_at > now()
           )
     where u.id = appeal_row.user_id;
  end if;

  insert into public.notifications (user_id, title, body, href)
  values (
    appeal_row.user_id,
    case when p_accepted then 'Apelación aceptada' else 'Apelación rechazada' end,
    trim(p_review_note),
    '/apelaciones'
  );
  return decision;
end;
$$;

-- Safe account-facing RPCs. The private schema itself is not exposed by PostgREST.
create or replace function public.get_my_private_data()
returns table (email text, boleta text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email, p.boleta
    from private.user_private p
   where p.user_id = (select auth.uid());
$$;

create or replace function public.admin_get_user_private_data(p_user_id uuid)
returns table (email text, boleta text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin_actor() then
    raise exception 'Solo administración puede consultar datos privados';
  end if;
  return query
    select p.email, p.boleta
      from private.user_private p
     where p.user_id = p_user_id;
end;
$$;

create or replace function public.admin_list_user_profiles()
returns table (id uuid, name text, email text, role public.user_role, area text, banned boolean)
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
    select u.id, u.name, p.email, u.role, u.area, u.banned
      from public.users u
      join private.user_private p on p.user_id = u.id
     order by u.name;
end;
$$;

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
begin
  if not private.is_admin_actor() then
    raise exception 'Solo administración puede asignar roles';
  end if;
  if (p_role = 'moderador' and (p_area is null or length(trim(p_area)) < 2))
     or (p_role <> 'moderador' and p_area is not null) then
    raise exception 'Área de moderación inválida';
  end if;
  update public.users
     set role = p_role,
         area = p_area
   where id = p_user_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end;
$$;

create or replace function public.admin_set_user_banned(p_user_id uuid, p_banned boolean)
returns table (name text, banned boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin_actor() then
    raise exception 'Solo administración puede cambiar el veto';
  end if;
  update public.users u
     set admin_banned = p_banned,
         banned = p_banned or exists (
           select 1 from public.moderation_suspensions s
            where s.user_id = u.id and s.is_permanent
         )
   where u.id = p_user_id
   returning u.name, u.banned into name, banned;
  if not found then
    return;
  end if;
  return next;
end;
$$;

create or replace function public.issue_club_advisor_code(p_proposal_id uuid, p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expiry timestamptz := now() + interval '15 minutes';
begin
  if not private.is_active_actor() or not exists (
    select 1 from public.users u where u.id = actor_id and u.role = 'profesor'
  ) then
    raise exception 'Solo un profesor activo puede confirmar asesoría';
  end if;
  if p_code is null or length(trim(p_code)) < 6 or length(trim(p_code)) > 64 then
    raise exception 'El código debe tener entre 6 y 64 caracteres';
  end if;
  if not exists (
    select 1 from public.club_proposals p
     where p.id = p_proposal_id and p.status = 'en_documentacion'
       and (select count(*) from public.club_interests i where i.proposal_id = p.id) >= 20
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
         advisor_confirmed_at = now(),
         status = 'en_validacion',
         updated_at = now()
   where id = p_proposal_id and proposer_id = actor_id;
  return found;
end;
$$;

revoke all on function public.get_my_private_data() from public, anon;
revoke all on function public.admin_get_user_private_data(uuid) from public, anon;
revoke all on function public.admin_list_user_profiles() from public, anon;
revoke all on function public.admin_set_user_role(uuid, public.user_role, text) from public, anon;
revoke all on function public.admin_set_user_banned(uuid, boolean) from public, anon;
revoke all on function public.register_moderation_strike(uuid, text, text, text) from public, anon;
revoke all on function public.review_moderation_appeal(uuid, boolean, text) from public, anon;
revoke all on function public.issue_club_advisor_code(uuid, text) from public, anon;
revoke all on function public.verify_club_advisor_code(uuid, text) from public, anon;
grant execute on function public.get_my_private_data() to authenticated;
grant execute on function public.admin_get_user_private_data(uuid) to authenticated;
grant execute on function public.admin_list_user_profiles() to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role, text) to authenticated;
grant execute on function public.admin_set_user_banned(uuid, boolean) to authenticated;
grant execute on function public.register_moderation_strike(uuid, text, text, text) to authenticated;
grant execute on function public.review_moderation_appeal(uuid, boolean, text) to authenticated;
grant execute on function public.issue_club_advisor_code(uuid, text) to authenticated;
grant execute on function public.verify_club_advisor_code(uuid, text) to authenticated;

-- Apply RLS to every app-owned public table. A missing policy means deny.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users', 'badges', 'avisos', 'guides', 'guide_versions', 'guide_suggestions',
    'guide_step_questions', 'guide_step_answers', 'guide_step_answer_votes',
    'guide_analytics_events', 'questions', 'answers', 'question_votes',
    'club_proposals', 'club_interests', 'clubs', 'memberships', 'club_posts',
    'club_events', 'club_proposal_documents', 'club_appointments', 'lost_items',
    'lost_item_matches', 'lost_item_claims', 'lost_item_handoffs', 'notifications',
    'notification_prefs', 'spaces', 'cubicles', 'space_events', 'audit_logs',
    'moderation_strikes', 'moderation_suspensions', 'moderation_appeals'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

alter table private.user_private enable row level security;
alter table private.club_advisor_codes enable row level security;
alter table private.lost_item_secrets enable row level security;
alter table private.lost_item_claim_answers enable row level security;
alter table private.lost_item_handoff_secrets enable row level security;

-- All API-facing app tables have explicit table grants; RLS below determines the
-- rows and operations each role may actually use. Private-schema tables are not
-- granted to API roles at all.
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;

-- Public profile fields only. Email, boleta, ban state and private moderation data
-- are intentionally absent from this grant.
revoke all on public.users from anon, authenticated;
grant select (id, name, role, area, created_at) on public.users to anon, authenticated;
grant select (is_active) on public.users to authenticated;
grant update (name) on public.users to authenticated;
revoke insert, update, delete on public.users from authenticated;
grant update (name) on public.users to authenticated;

-- Profiles and badges are safe public read models.
create policy users_public_profile_read on public.users
for select to anon, authenticated using (is_active or id = (select auth.uid()));
create policy users_update_own_name on public.users
for update to authenticated using (id = (select auth.uid()) and private.is_active_actor())
with check (id = (select auth.uid()) and private.is_active_actor());
create policy users_admin_role_update on public.users
for update to authenticated using (private.is_admin_actor())
with check (private.is_admin_actor());

create policy badges_public_read on public.badges
for select to anon, authenticated using (true);
create policy badges_admin_manage on public.badges
for all to authenticated using (private.is_admin_actor())
with check (private.is_admin_actor());

-- Institutional notices are public only after their release time.
create policy avisos_public_read on public.avisos
for select to anon, authenticated using (is_public and publish_at <= now());
create policy avisos_comms_insert on public.avisos
for insert to authenticated with check (author_id = (select auth.uid()) and private.can_manage_area('comunicacion'));
create policy avisos_comms_update on public.avisos
for update to authenticated using (private.can_manage_area('comunicacion'))
with check (private.can_manage_area('comunicacion'));
create policy avisos_comms_delete on public.avisos
for delete to authenticated using (private.can_manage_area('comunicacion'));

-- Guides are public to read; all writes are limited to the matching area.
create policy guides_public_read on public.guides
for select to anon, authenticated using (true);
create policy guides_area_insert on public.guides
for insert to authenticated with check (author_id = (select auth.uid()) and private.can_manage_area(area));
create policy guides_area_update on public.guides
for update to authenticated using (private.can_manage_area(area))
with check (private.can_manage_area(area));
create policy guides_area_delete on public.guides
for delete to authenticated using (private.can_manage_area(area));

create policy guide_versions_public_read on public.guide_versions
for select to anon, authenticated using (exists (select 1 from public.guides g where g.id = guide_id));
create policy guide_versions_area_insert on public.guide_versions
for insert to authenticated with check (
  edited_by = (select auth.uid()) and exists (
    select 1 from public.guides g where g.id = guide_id and private.can_manage_area(g.area)
  )
);

create policy guide_suggestions_public_read on public.guide_suggestions
for select to anon, authenticated using (true);
create policy guide_suggestions_owner_insert on public.guide_suggestions
for insert to authenticated with check (user_id = (select auth.uid()) and private.is_active_actor());
create policy guide_suggestions_area_review on public.guide_suggestions
for update to authenticated using (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_area(g.area)
)) with check (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_area(g.area)
));

create policy guide_step_questions_public_read on public.guide_step_questions
for select to anon, authenticated using (true);
create policy guide_step_questions_owner_insert on public.guide_step_questions
for insert to authenticated with check (author_id = (select auth.uid()) and private.is_active_actor());
create policy guide_step_questions_area_update on public.guide_step_questions
for update to authenticated using (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_area(g.area)
)) with check (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_area(g.area)
));

create policy guide_step_answers_public_read on public.guide_step_answers
for select to anon, authenticated using (true);
create policy guide_step_answers_owner_insert on public.guide_step_answers
for insert to authenticated with check (
  author_id = (select auth.uid()) and private.is_active_actor()
  and (not official or exists (
    select 1 from public.guide_step_questions q join public.guides g on g.id = q.guide_id
    where q.id = question_id and private.can_manage_area(g.area)
  ))
);
create policy guide_step_answers_area_update on public.guide_step_answers
for update to authenticated using (exists (
  select 1 from public.guide_step_questions q join public.guides g on g.id = q.guide_id
  where q.id = question_id and private.can_manage_area(g.area)
)) with check (exists (
  select 1 from public.guide_step_questions q join public.guides g on g.id = q.guide_id
  where q.id = question_id and private.can_manage_area(g.area)
));

create policy guide_step_votes_read_own on public.guide_step_answer_votes
for select to authenticated using (user_id = (select auth.uid()));
create policy guide_step_votes_insert_own on public.guide_step_answer_votes
for insert to authenticated with check (user_id = (select auth.uid()) and private.is_active_actor());
create policy guide_step_votes_delete_own on public.guide_step_answer_votes
for delete to authenticated using (user_id = (select auth.uid()));

create policy guide_analytics_insert on public.guide_analytics_events
for insert to anon, authenticated with check (
  exists (select 1 from public.guides g where g.id = guide_id)
  and (
    (auth.uid() is null and user_id is null and anonymous_session is not null)
    or (auth.uid() is not null and user_id = (select auth.uid()) and anonymous_session is null)
  )
);
create policy guide_analytics_area_read on public.guide_analytics_events
for select to authenticated using (exists (
  select 1 from public.guides g where g.id = guide_id and private.can_manage_area(g.area)
));

-- Forum content is public, but official answers, pinning and moderation belong
-- to a moderator assigned to that question's area (or the general admin).
create policy questions_public_read on public.questions
for select to anon, authenticated using (true);
create policy questions_active_user_insert on public.questions
for insert to authenticated with check (author_id = (select auth.uid()) and private.is_active_actor());
create policy questions_area_update on public.questions
for update to authenticated using (private.can_manage_area(area))
with check (private.can_manage_area(area));
create policy questions_area_delete on public.questions
for delete to authenticated using (private.can_manage_area(area));

create policy answers_public_read on public.answers
for select to anon, authenticated using (true);
create policy answers_active_user_insert on public.answers
for insert to authenticated with check (
  author_id = (select auth.uid()) and private.is_active_actor()
  and (not official or exists (
    select 1 from public.questions q where q.id = question_id and private.can_manage_area(q.area)
  ))
);
create policy answers_area_update on public.answers
for update to authenticated using (exists (
  select 1 from public.questions q where q.id = question_id and private.can_manage_area(q.area)
)) with check (exists (
  select 1 from public.questions q where q.id = question_id and private.can_manage_area(q.area)
));

create policy question_votes_read_own on public.question_votes
for select to authenticated using (user_id = (select auth.uid()));
create policy question_votes_insert_own on public.question_votes
for insert to authenticated with check (user_id = (select auth.uid()) and private.is_active_actor());
create policy question_votes_delete_own on public.question_votes
for delete to authenticated using (user_id = (select auth.uid()));

-- Club directory is public; proposals and club content keep the authorization
-- boundary between community members and academic/subdirection reviewers.
create policy club_proposals_public_read on public.club_proposals
for select to anon, authenticated using (true);
create policy club_proposals_owner_insert on public.club_proposals
for insert to authenticated with check (proposer_id = (select auth.uid()) and private.is_active_actor());
create policy club_proposals_owner_or_reviewer_update on public.club_proposals
for update to authenticated using (
  proposer_id = (select auth.uid()) or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('subdireccion_academica')
) with check (
  proposer_id = (select auth.uid()) or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('subdireccion_academica')
);
create policy club_proposals_admin_delete on public.club_proposals
for delete to authenticated using (private.is_admin_actor());

create policy club_interests_own_or_club_moderator_read on public.club_interests
for select to authenticated using (
  user_id = (select auth.uid()) or private.can_manage_area('clubes_academicos')
  or exists (select 1 from public.club_proposals p where p.id = proposal_id and p.proposer_id = (select auth.uid()))
);
create policy club_interests_owner_insert on public.club_interests
for insert to authenticated with check (
  user_id = (select auth.uid()) and private.is_active_actor() and exists (
    select 1 from public.club_proposals p where p.id = proposal_id
      and p.proposer_id <> (select auth.uid()) and p.status = 'abierta'
  )
);
create policy club_interests_owner_delete on public.club_interests
for delete to authenticated using (user_id = (select auth.uid()));

create policy clubs_active_public_read on public.clubs
for select to anon, authenticated using (active);
create policy clubs_academic_area_insert on public.clubs
for insert to authenticated with check (private.can_manage_area('clubes_academicos'));
create policy clubs_academic_area_update on public.clubs
for update to authenticated using (private.can_manage_area('clubes_academicos'))
with check (private.can_manage_area('clubes_academicos'));
create policy clubs_admin_delete on public.clubs
for delete to authenticated using (private.is_admin_actor());

create policy memberships_own_or_reviewer_read on public.memberships
for select to authenticated using (
  user_id = (select auth.uid()) or private.is_admin_actor()
  or private.can_manage_area('clubes_academicos')
  or exists (select 1 from public.clubs c where c.id = club_id and c.leader_id = (select auth.uid()))
);
create policy memberships_owner_insert on public.memberships
for insert to authenticated with check (user_id = (select auth.uid()) and private.is_active_actor());
create policy memberships_leader_review on public.memberships
for update to authenticated using (
  private.can_manage_area('clubes_academicos') or exists (
    select 1 from public.clubs c where c.id = club_id and c.leader_id = (select auth.uid())
  )
) with check (
  private.can_manage_area('clubes_academicos') or exists (
    select 1 from public.clubs c where c.id = club_id and c.leader_id = (select auth.uid())
  )
);
create policy memberships_owner_delete on public.memberships
for delete to authenticated using (user_id = (select auth.uid()));

create policy club_posts_member_read on public.club_posts
for select to authenticated using (private.is_club_member(club_id));
create policy club_posts_member_insert on public.club_posts
for insert to authenticated with check (
  author_id = (select auth.uid()) and private.is_active_actor() and private.is_club_member(club_id)
);
create policy club_posts_author_or_moderator_update on public.club_posts
for update to authenticated using (
  author_id = (select auth.uid()) or private.can_manage_area('clubes_academicos')
) with check (
  author_id = (select auth.uid()) or private.can_manage_area('clubes_academicos')
);
create policy club_posts_author_or_moderator_delete on public.club_posts
for delete to authenticated using (
  author_id = (select auth.uid()) or private.can_manage_area('clubes_academicos')
);

create policy club_events_public_read on public.club_events
for select to anon, authenticated using (approval_status = 'aprobado');
create policy club_events_member_submit on public.club_events
for insert to authenticated with check (
  created_by = (select auth.uid()) and approval_status = 'pendiente'
  and private.is_active_actor() and private.is_club_member(club_id)
);
create policy club_events_staff_approve on public.club_events
for update to authenticated using (
  private.can_manage_area('clubes_academicos') or exists (
    select 1 from public.clubs c where c.id = club_id and c.leader_id = (select auth.uid())
  )
) with check (
  (private.can_manage_area('clubes_academicos') and (approval_status <> 'aprobado' or approved_by = (select auth.uid())))
  or (exists (select 1 from public.clubs c where c.id = club_id and c.leader_id = (select auth.uid())) and approval_status = 'pendiente')
);

create policy club_docs_owner_or_reviewer_read on public.club_proposal_documents
for select to authenticated using (
  user_id = (select auth.uid()) or private.can_review_club_proposal(proposal_id)
);
create policy club_docs_interested_owner_insert on public.club_proposal_documents
for insert to authenticated with check (
  user_id = (select auth.uid()) and status = 'recibido' and exists (
    select 1 from public.club_interests i join public.club_proposals p on p.id = i.proposal_id
     where i.proposal_id = public.club_proposal_documents.proposal_id and i.user_id = (select auth.uid())
       and p.status in ('en_documentacion', 'en_validacion', 'cita_pendiente')
  )
);
create policy club_docs_owner_resubmit on public.club_proposal_documents
for update to authenticated using (
  user_id = (select auth.uid()) and status = 'requiere_correccion' and exists (
    select 1 from public.club_interests i join public.club_proposals p on p.id = i.proposal_id
     where i.proposal_id = public.club_proposal_documents.proposal_id and i.user_id = (select auth.uid())
       and p.status in ('en_documentacion', 'en_validacion', 'cita_pendiente')
  )
) with check (
  user_id = (select auth.uid()) and status = 'recibido'
  and storage_path like proposal_id::text || '/' || (select auth.uid())::text || '/%'
  and exists (
    select 1 from public.club_interests i join public.club_proposals p on p.id = i.proposal_id
     where i.proposal_id = public.club_proposal_documents.proposal_id and i.user_id = (select auth.uid())
       and p.status in ('en_documentacion', 'en_validacion', 'cita_pendiente')
  )
);
create policy club_docs_subdirection_review on public.club_proposal_documents
for update to authenticated using (private.is_admin_actor() or private.can_manage_area('subdireccion_academica'))
with check (private.is_admin_actor() or private.can_manage_area('subdireccion_academica'));

create policy club_appointments_owner_or_reviewer_read on public.club_appointments
for select to authenticated using (
  requested_by = (select auth.uid()) or private.is_admin_actor()
  or private.can_manage_area('subdireccion_academica')
  or private.can_manage_area('clubes_academicos')
);
create policy club_appointments_proposer_request on public.club_appointments
for insert to authenticated with check (
  requested_by = (select auth.uid()) and status = 'pendiente'
  and exists (select 1 from public.club_proposals p where p.id = proposal_id and p.proposer_id = (select auth.uid()))
  and private.club_proposal_ready_for_appointment(proposal_id)
);
create policy club_appointments_subdirection_confirm on public.club_appointments
for update to authenticated using (private.is_admin_actor() or private.can_manage_area('subdireccion_academica'))
with check (private.is_admin_actor() or private.can_manage_area('subdireccion_academica'));

-- Lost item cards expose only the public question and photo URL. Answers, claims,
-- handoff tokens and supporting evidence remain private or participant-scoped.
create policy lost_items_public_open_read on public.lost_items
for select to anon, authenticated using (status = 'abierto' or reporter_id = (select auth.uid()));
create policy lost_items_active_user_insert on public.lost_items
for insert to authenticated with check (reporter_id = (select auth.uid()) and private.is_active_actor());
create policy lost_items_owner_or_admin_update on public.lost_items
for update to authenticated using (reporter_id = (select auth.uid()) or private.is_admin_actor())
with check (reporter_id = (select auth.uid()) or private.is_admin_actor());
create policy lost_items_owner_or_admin_delete on public.lost_items
for delete to authenticated using (reporter_id = (select auth.uid()) or private.is_admin_actor());

create policy lost_matches_participant_read on public.lost_item_matches
for select to authenticated using (
  private.is_lost_item_participant(item_a_id) or private.is_lost_item_participant(item_b_id)
);

create policy lost_claims_participant_read on public.lost_item_claims
for select to authenticated using (
  claimant_id = (select auth.uid()) or exists (
    select 1 from public.lost_items li where li.id = lost_item_id and li.reporter_id = (select auth.uid())
  ) or private.is_admin_actor()
);
create policy lost_claims_claimant_insert on public.lost_item_claims
for insert to authenticated with check (claimant_id = (select auth.uid()) and private.is_active_actor());
create policy lost_claims_finder_or_admin_review on public.lost_item_claims
for update to authenticated using (
  exists (select 1 from public.lost_items li where li.id = lost_item_id and li.reporter_id = (select auth.uid()))
  or private.is_admin_actor()
) with check (
  exists (select 1 from public.lost_items li where li.id = lost_item_id and li.reporter_id = (select auth.uid()))
  or private.is_admin_actor()
);

create policy lost_handoffs_participant_read on public.lost_item_handoffs
for select to authenticated using (
  finder_id = (select auth.uid()) or recipient_id = (select auth.uid()) or private.is_admin_actor()
);
create policy lost_handoffs_finder_insert on public.lost_item_handoffs
for insert to authenticated with check (
  finder_id = (select auth.uid()) and exists (
    select 1 from public.lost_item_claims c
     where c.id = claim_id and c.status = 'aprobada'
       and exists (select 1 from public.lost_items li where li.id = c.lost_item_id and li.reporter_id = (select auth.uid()))
  )
);
create policy lost_handoffs_participant_update on public.lost_item_handoffs
for update to authenticated using (
  finder_id = (select auth.uid()) or recipient_id = (select auth.uid()) or private.is_admin_actor()
) with check (
  finder_id = (select auth.uid()) or recipient_id = (select auth.uid()) or private.is_admin_actor()
);

create policy notifications_owner_read on public.notifications
for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_owner_update on public.notifications
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy notification_prefs_owner_read on public.notification_prefs
for select to authenticated using (user_id = (select auth.uid()));
create policy notification_prefs_owner_insert on public.notification_prefs
for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_prefs_owner_update on public.notification_prefs
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy spaces_public_read on public.spaces
for select to anon, authenticated using (true);
create policy spaces_admin_manage on public.spaces
for all to authenticated using (private.is_admin_actor()) with check (private.is_admin_actor());

create policy cubicles_public_read on public.cubicles
for select to anon, authenticated using (true);
create policy cubicles_professor_insert on public.cubicles
for insert to authenticated with check (professor_id = (select auth.uid()) and private.is_active_actor());
create policy cubicles_professor_update on public.cubicles
for update to authenticated using (professor_id = (select auth.uid()) or private.is_admin_actor())
with check (professor_id = (select auth.uid()) or private.is_admin_actor());
create policy cubicles_professor_delete on public.cubicles
for delete to authenticated using (professor_id = (select auth.uid()) or private.is_admin_actor());

create policy space_events_approved_read on public.space_events
for select to anon, authenticated using (
  approval_status = 'aprobado' or created_by = (select auth.uid())
  or private.can_manage_area('comunicacion') or private.can_manage_area('clubes_academicos')
);
create policy space_events_student_submit on public.space_events
for insert to authenticated with check (
  created_by = (select auth.uid()) and approval_status = 'pendiente'
  and authorized_by is null and private.is_active_actor()
);
create policy space_events_staff_publish on public.space_events
for insert to authenticated with check (
  created_by = (select auth.uid()) and approval_status = 'aprobado'
  and authorized_by = (select auth.uid())
  and (private.can_manage_area('comunicacion') or private.can_manage_area('clubes_academicos'))
);
create policy space_events_staff_review on public.space_events
for update to authenticated using (
  private.is_admin_actor() or private.can_manage_area('comunicacion') or private.can_manage_area('clubes_academicos')
) with check (
  private.is_admin_actor() or private.can_manage_area('comunicacion') or private.can_manage_area('clubes_academicos')
);

create policy audit_logs_admin_or_area_read on public.audit_logs
for select to authenticated using (
  private.is_admin_actor() or (area is not null and private.can_manage_area(area))
);
create policy audit_logs_actor_insert on public.audit_logs
for insert to authenticated with check (actor_id = (select auth.uid()) and private.is_active_actor());

create policy moderation_strikes_own_or_area_read on public.moderation_strikes
for select to authenticated using (
  user_id = (select auth.uid()) or private.is_admin_actor() or private.can_manage_area(area)
);
create policy moderation_strikes_area_insert on public.moderation_strikes
for insert to authenticated with check (
  moderator_id = (select auth.uid()) and private.can_manage_area(area)
);

create policy moderation_suspensions_own_or_area_read on public.moderation_suspensions
for select to authenticated using (
  user_id = (select auth.uid()) or private.is_admin_actor() or private.can_manage_area(area)
);

create policy moderation_appeals_own_or_area_read on public.moderation_appeals
for select to authenticated using (
  user_id = (select auth.uid()) or private.is_admin_actor() or exists (
    select 1 from public.moderation_suspensions s where s.id = suspension_id and private.can_manage_area(s.area)
  )
);
create policy moderation_appeals_owner_insert on public.moderation_appeals
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.moderation_suspensions s where s.id = suspension_id and s.user_id = (select auth.uid())
  )
);
create policy moderation_appeals_admin_review on public.moderation_appeals
for update to authenticated using (private.is_admin_actor())
with check (private.is_admin_actor());

-- Private data RPCs and RLS helpers can execute, but raw private tables remain
-- inaccessible through the Data API because the private schema is not exposed.
grant execute on function private.is_active_actor() to anon, authenticated;
grant execute on function private.is_admin_actor() to anon, authenticated;
grant execute on function private.can_manage_area(text) to anon, authenticated;
grant execute on function private.is_club_member(uuid) to authenticated;
grant execute on function private.can_review_club_proposal(uuid) to authenticated;
grant execute on function private.club_proposal_ready_for_appointment(uuid) to authenticated;
grant execute on function private.is_lost_item_participant(uuid) to authenticated;
grant execute on function private.can_access_lost_path(text) to authenticated;

-- Supabase Storage buckets: public notice/item imagery; restricted supporting
-- documents, source files, and claim evidence.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('club-documents', 'club-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']),
  ('guide-source', 'guide-source', false, 52428800, null),
  ('lost-evidence', 'lost-evidence', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy public_media_public_read on storage.objects
for select to anon, authenticated using (bucket_id = 'public-media');
create policy public_media_owner_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'public-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_active_actor()
);
create policy public_media_owner_update on storage.objects
for update to authenticated using (
  bucket_id = 'public-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin_actor())
) with check (
  bucket_id = 'public-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin_actor())
);
create policy public_media_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'public-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin_actor())
);

create policy club_documents_owner_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'club-documents'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_active_actor()
  and exists (
    select 1 from public.club_interests i join public.club_proposals p on p.id = i.proposal_id
     where p.id::text = (storage.foldername(name))[1]
       and i.user_id = (select auth.uid())
       and p.status in ('en_documentacion', 'en_validacion', 'cita_pendiente')
  )
);
create policy club_documents_owner_or_reviewer_read on storage.objects
for select to authenticated using (
  bucket_id = 'club-documents'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or private.can_review_club_proposal(case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then (storage.foldername(name))[1]::uuid else null end)
  )
);
create policy club_documents_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'club-documents' and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy guide_source_area_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'guide-source'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.can_manage_area((storage.foldername(name))[1])
);
create policy guide_source_area_read on storage.objects
for select to authenticated using (
  bucket_id = 'guide-source' and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or private.can_manage_area((storage.foldername(name))[1])
  )
);
create policy guide_source_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'guide-source' and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy lost_evidence_participant_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'lost-evidence'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_active_actor()
  and exists (
    select 1 from public.lost_items li
     where li.id::text = (storage.foldername(name))[1]
       and (li.reporter_id = (select auth.uid()) or exists (
         select 1 from public.lost_item_claims c where c.lost_item_id = li.id and c.claimant_id = (select auth.uid())
       ))
  )
);
create policy lost_evidence_participant_read on storage.objects
for select to authenticated using (
  bucket_id = 'lost-evidence' and private.can_access_lost_path(name)
);
create policy lost_evidence_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'lost-evidence' and (storage.foldername(name))[2] = (select auth.uid())::text
);

-- Realtime updates are limited to public app rows; each subscription still obeys RLS.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'avisos', 'questions', 'answers', 'question_votes', 'clubs',
      'club_proposals', 'club_interests', 'club_events', 'lost_items',
      'lost_item_matches', 'lost_item_claims', 'lost_item_handoffs',
      'notifications', 'space_events'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

-- Add demo-facing seed users through Supabase Auth. Credentials and keys do not
-- belong in this migration; supabase/seed.sql or the application seed owns them.
