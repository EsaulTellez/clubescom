create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type user_role as enum ('alumno', 'profesor', 'moderador', 'admin');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  name text not null,
  boleta text,
  role user_role not null,
  area text,
  banned boolean not null default false,
  email_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  purpose text not null default 'registro',
  expires_at timestamptz not null,
  consumed boolean not null default false
);

create table sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code text not null,
  label text not null,
  awarded_at timestamptz not null default now(),
  unique (user_id, code)
);

create table avisos (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users(id),
  title text not null,
  body text not null,
  category text not null check (category in ('academico', 'social', 'tramites')),
  featured boolean not null default false,
  is_public boolean not null default true,
  publish_at timestamptz not null default now(),
  social_copy text,
  created_at timestamptz not null default now()
);

create table guides (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users(id),
  area text not null,
  title text not null,
  summary text not null default '',
  steps jsonb not null default '[]',
  faqs jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table guide_suggestions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  user_id uuid not null references users(id),
  step_index int not null,
  body text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  created_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users(id),
  area text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null,
  official boolean not null default false,
  created_at timestamptz not null default now()
);

create table question_votes (
  question_id uuid not null references questions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (question_id, user_id)
);

create table club_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references users(id),
  name text not null,
  kind text not null check (kind in ('academico', 'cultural', 'deportivo')),
  description text not null,
  plan_url text,
  status text not null default 'abierta',
  advisor_id uuid references users(id),
  advisor_code text,
  created_at timestamptz not null default now()
);

create table club_interests (
  proposal_id uuid not null references club_proposals(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (proposal_id, user_id)
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid unique references club_proposals(id),
  name text not null,
  kind text not null,
  description text not null,
  schedule text,
  leader_id uuid references users(id),
  advisor_id uuid references users(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table memberships (
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  primary key (club_id, user_id)
);

create table club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  author_id uuid not null references users(id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index club_posts_feed on club_posts (club_id, created_at desc);

create table club_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  created_by uuid not null references users(id),
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  location text not null default 'Por confirmar',
  created_at timestamptz not null default now()
);
create index club_events_upcoming on club_events (club_id, starts_at);

create table lost_items (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(id),
  kind text not null check (kind in ('perdido', 'encontrado')),
  title text not null,
  description text not null,
  place text not null,
  photo_url text,
  status text not null default 'abierto' check (status in ('abierto', 'entregado', 'cerrado')),
  security_question text,
  security_answer_hash text,
  claim_code text unique,
  matched_id uuid references lost_items(id),
  created_at timestamptz not null default now()
);

create index lost_items_title_trgm on lost_items using gin (title gin_trgm_ops);
create index lost_items_desc_trgm on lost_items using gin (description gin_trgm_ops);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table notification_prefs (
  user_id uuid primary key references users(id) on delete cascade,
  email_clubs boolean not null default true,
  email_forum boolean not null default true,
  email_lost boolean not null default true
);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  building text,
  description text
);

create table cubicles (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid references users(id),
  label text not null,
  building text not null,
  floor text,
  x numeric not null default 20,
  y numeric not null default 20
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_public boolean not null default true,
  created_by uuid references users(id)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id text,
  detail text,
  created_at timestamptz not null default now()
);

alter table users enable row level security;
alter table avisos enable row level security;
alter table lost_items enable row level security;
alter table questions enable row level security;
alter table audit_logs enable row level security;

create policy users_read on users for select using (true);
create policy avisos_read on avisos for select using (is_public or publish_at <= now());
create policy lost_read on lost_items for select using (true);
create policy questions_read on questions for select using (true);
create policy audit_admin on audit_logs for select using (current_setting('app.role', true) in ('admin', 'moderador'));
