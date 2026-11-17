-- Lectura pública de votos de preguntas y votación comunitaria (+1/-1) en respuestas del foro

grant select on public.question_votes to anon, authenticated;

drop policy if exists question_votes_public_read on public.question_votes;
create policy question_votes_public_read on public.question_votes
for select to anon, authenticated using (true);

create table if not exists public.answer_votes (
  answer_id uuid not null references public.answers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote smallint not null default 1 check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (answer_id, user_id)
);

create index if not exists answer_votes_lookup on public.answer_votes (answer_id);

alter table public.answer_votes enable row level security;

grant select on public.answer_votes to anon, authenticated;
grant insert, update, delete on public.answer_votes to authenticated;

drop policy if exists answer_votes_public_read on public.answer_votes;
create policy answer_votes_public_read on public.answer_votes
for select to anon, authenticated using (true);

drop policy if exists answer_votes_own_write on public.answer_votes;
create policy answer_votes_own_write on public.answer_votes
for all to authenticated
using (user_id = (select auth.uid()) and private.is_active_actor())
with check (user_id = (select auth.uid()) and private.is_active_actor());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'answer_votes'
     ) then
    alter publication supabase_realtime add table public.answer_votes;
  end if;
end;
$$;
