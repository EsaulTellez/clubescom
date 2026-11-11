create table public.map_rooms (
  code text primary key check (code ~ '^[1-4][0-2](0[1-9]|1[0-3])$' and (left(code, 1) in ('1', '2') or right(code, 2)::int >= 4)),
  kind text not null default 'salon' check (kind in ('salon', 'laboratorio', 'cubiculo', 'otro')),
  name text not null default '' check (length(name) <= 120),
  description text not null default '' check (length(description) <= 2000)
);
create table public.map_room_professors (
  room_code text not null references public.map_rooms(code) on delete cascade,
  professor_id uuid not null references public.users(id) on delete cascade,
  primary key (room_code, professor_id)
);
alter table public.map_rooms enable row level security;
alter table public.map_room_professors enable row level security;
grant select on public.map_rooms, public.map_room_professors to anon, authenticated;
grant insert, update, delete on public.map_rooms, public.map_room_professors to authenticated;
create policy map_rooms_read on public.map_rooms for select to anon, authenticated using (true);
create policy map_rooms_admin on public.map_rooms for all to authenticated using (private.is_admin_actor()) with check (private.is_admin_actor());
create policy map_room_professors_read on public.map_room_professors for select to anon, authenticated using (true);
create policy map_room_professors_admin on public.map_room_professors for all to authenticated using (private.is_admin_actor()) with check (private.is_admin_actor());
