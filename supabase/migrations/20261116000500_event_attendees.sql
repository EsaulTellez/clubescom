-- Asistencia a eventos ("Asistiré") para clasificar eventos en tendencia

create table if not exists public.event_attendees (
  event_kind text not null check (event_kind in ('space', 'club')),
  event_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_kind, event_id, user_id)
);

create index if not exists event_attendees_lookup on public.event_attendees (event_kind, event_id);

alter table public.event_attendees enable row level security;

grant select on public.event_attendees to anon, authenticated;
grant insert, delete on public.event_attendees to authenticated;

drop policy if exists event_attendees_public_read on public.event_attendees;
create policy event_attendees_public_read on public.event_attendees
for select to anon, authenticated using (true);

drop policy if exists event_attendees_own_insert on public.event_attendees;
create policy event_attendees_own_insert on public.event_attendees
for insert to authenticated with check (
  user_id = (select auth.uid())
  and private.is_active_actor()
);

drop policy if exists event_attendees_own_delete on public.event_attendees;
create policy event_attendees_own_delete on public.event_attendees
for delete to authenticated using (
  user_id = (select auth.uid())
  and private.is_active_actor()
);
