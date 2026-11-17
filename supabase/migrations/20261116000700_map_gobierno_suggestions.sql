-- 1. Ampliar códigos y tipos permitidos en map_rooms para incluir Edificio de Gobierno (G000..G104)
alter table public.map_rooms drop constraint if exists map_rooms_code_check;
alter table public.map_rooms drop constraint if exists map_rooms_kind_check;

alter table public.map_rooms add constraint map_rooms_code_check check (
  (
    code ~ '^[1-4][0-2](0[1-9]|1[0-3])$'
    and (left(code, 1) in ('1', '2') or right(code, 2)::int >= 4)
  )
  or code ~ '^G[0-1][0-9]{2}$'
);

alter table public.map_rooms add constraint map_rooms_kind_check check (
  kind in ('salon', 'laboratorio', 'cubiculo', 'oficina', 'servicio', 'biblioteca', 'auditorio', 'otro')
);

-- 2. Sembrar espacios reales de la Planta Baja y Piso 1 del Edificio de Gobierno
insert into public.map_rooms (code, kind, name, description)
values
  (
    'G000',
    'servicio',
    'Escaleras Centrales y Cajero BBVA',
    'Coordenada (0, 0) en el centro de la planta baja del Edificio de Gobierno. Escaleras centrales en medio círculo (subes un tramo, das vuelta a la derecha y subes de nuevo para llegar al Piso 1) con el cajero automático BBVA justo a un costado.'
  ),
  (
    'G001',
    'biblioteca',
    'Biblioteca ESCOM',
    'Ocupa la mitad de la planta baja del Edificio de Gobierno. Cuenta con acervo bibliográfico, préstamo de libros, consulta de trabajos terminales y mesas de lectura.'
  ),
  (
    'G002',
    'oficina',
    'Gestión Escolar',
    'Planta baja del Edificio de Gobierno, tercio izquierdo. Ventanillas de atención para constancias, boletas, reinscripción, bajas y trámites escolares.'
  ),
  (
    'G003',
    'auditorio',
    'Pasillo Central · Puertas del Auditorio',
    'Planta baja del Edificio de Gobierno, tercio central. Paso despejado donde se encuentran las puertas de acceso directo al Auditorio.'
  ),
  (
    'G004',
    'servicio',
    'Mesas y Sillas · Entrada a Biblioteca y Auditorio',
    'Planta baja del Edificio de Gobierno, tercio derecho. Espacio con mesas y sillas que funciona como pasillo y vestíbulo de entrada tanto para la Biblioteca como para el Auditorio.'
  ),
  (
    'G005',
    'servicio',
    'Enfermería, Dentista y Psicólogo',
    'Coordenada (-1, 0) en la planta baja del Edificio de Gobierno, del lado izquierdo justo entre Gestión Escolar y la Biblioteca. Consultorios de atención médica, servicio dental y orientación psicológica.'
  ),
  (
    'G006',
    'auditorio',
    'Auditorio ESCOM',
    'Recinto principal al norte del Edificio de Gobierno para ceremonias, congresos, pláticas informativas y presentaciones de Trabajos Terminales.'
  ),
  (
    'G101',
    'oficina',
    'Subdirección Académica y Sala 14',
    'Piso 1 del Edificio de Gobierno (sector poniente). Departamentos académicos, seguimiento de clubes y Sala 14.'
  ),
  (
    'G102',
    'oficina',
    'Dirección y Consejo Técnico',
    'Piso 1 del Edificio de Gobierno (sector norte). Oficinas de la Dirección de la ESCOM y sala del H. Consejo Técnico Consultivo Escolar.'
  ),
  (
    'G103',
    'oficina',
    'Servicios Educativos, Becas y CATT',
    'Piso 1 del Edificio de Gobierno (sector oriente). Ventanillas de becas, servicio social, extensión y Comisión de Apoyo a Trabajos Terminales (CATT).'
  ),
  (
    'G104',
    'oficina',
    'Subdirección Administrativa',
    'Piso 1 del Edificio de Gobierno (sector sur). Recursos financieros, materiales y capital humano frente al desembarque de las escaleras centrales.'
  )
on conflict (code) do update
  set kind = excluded.kind,
      name = excluded.name,
      description = excluded.description;

-- 3. Asegurar que map_rooms exista automáticamente al asignar o sugerir un espacio
create or replace function private.ensure_map_room_by_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.room_code is not null then
    insert into public.map_rooms (code, kind, name, description)
    values (new.room_code, 'salon', '', '')
    on conflict (code) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_map_room_by_code() from public, anon, authenticated;

drop trigger if exists map_room_professors_ensure_room on public.map_room_professors;
create trigger map_room_professors_ensure_room
before insert or update on public.map_room_professors
for each row execute function private.ensure_map_room_by_code();

-- 4. Permitir a profesores auto-asignarse como verdad oficial en map_room_professors
drop policy if exists map_room_professors_self_insert on public.map_room_professors;
create policy map_room_professors_self_insert on public.map_room_professors
for insert to authenticated
with check (
  professor_id = (select auth.uid())
  and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'profesor')
);

drop policy if exists map_room_professors_self_delete on public.map_room_professors;
create policy map_room_professors_self_delete on public.map_room_professors
for delete to authenticated
using (
  professor_id = (select auth.uid())
  and private.is_active_actor()
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'profesor')
);

-- 5. Sugerencias comunitarias de ubicación de profesores (hechas por alumnos) y votos de verificación
create table if not exists public.map_room_suggestions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.map_rooms(code) on delete cascade,
  professor_id uuid not null references public.users(id) on delete cascade,
  suggested_by uuid not null references public.users(id) on delete cascade,
  note text not null default '' check (length(note) <= 240),
  created_at timestamptz not null default now(),
  unique (room_code, professor_id)
);

drop trigger if exists map_room_suggestions_ensure_room on public.map_room_suggestions;
create trigger map_room_suggestions_ensure_room
before insert or update on public.map_room_suggestions
for each row execute function private.ensure_map_room_by_code();

create table if not exists public.map_room_suggestion_votes (
  suggestion_id uuid not null references public.map_room_suggestions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

alter table public.map_room_suggestions enable row level security;
alter table public.map_room_suggestion_votes enable row level security;

grant select on public.map_room_suggestions, public.map_room_suggestion_votes to anon, authenticated;
grant insert, update, delete on public.map_room_suggestions, public.map_room_suggestion_votes to authenticated;

drop policy if exists map_room_suggestions_read on public.map_room_suggestions;
create policy map_room_suggestions_read on public.map_room_suggestions
for select to anon, authenticated using (true);

drop policy if exists map_room_suggestions_insert on public.map_room_suggestions;
create policy map_room_suggestions_insert on public.map_room_suggestions
for insert to authenticated
with check (
  suggested_by = (select auth.uid())
  and private.is_active_actor()
);

drop policy if exists map_room_suggestions_delete on public.map_room_suggestions;
create policy map_room_suggestions_delete on public.map_room_suggestions
for delete to authenticated
using (
  suggested_by = (select auth.uid())
  or professor_id = (select auth.uid())
  or private.is_admin_actor()
);

drop policy if exists map_room_suggestion_votes_read on public.map_room_suggestion_votes;
create policy map_room_suggestion_votes_read on public.map_room_suggestion_votes
for select to anon, authenticated using (true);

drop policy if exists map_room_suggestion_votes_write on public.map_room_suggestion_votes;
create policy map_room_suggestion_votes_write on public.map_room_suggestion_votes
for all to authenticated
using (
  user_id = (select auth.uid())
  and private.is_active_actor()
)
with check (
  user_id = (select auth.uid())
  and private.is_active_actor()
);
