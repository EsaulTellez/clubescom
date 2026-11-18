-- Superadministración conserva los permisos de contenido del rol admin.
alter table public.users add column is_superadmin boolean not null default false,
  add column can_switch_profile boolean not null default false,
  add constraint switchable_profile check (not can_switch_profile or (not is_superadmin and role in ('alumno', 'profesor', 'admin'))),
  add constraint superadmin_requires_admin check (not is_superadmin or role = 'admin');
grant select (is_superadmin, can_switch_profile) on public.users to authenticated;

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
declare
  normalized_area text := case when p_role = 'moderador' then lower(trim(coalesce(p_area, ''))) else null end;
begin
  if not (private.is_admin_actor() and exists (
    select 1 from public.users where id = (select auth.uid()) and is_superadmin
  )) then
    raise exception 'Solo superadministración puede asignar roles';
  end if;
  if p_role = 'moderador' and normalized_area not in (
    'gestion_escolar', 'becas', 'catt', 'comunicacion',
    'clubes_academicos', 'clubes_culturales', 'prefectura', 'subdireccion_academica'
  ) then
    raise exception 'Selecciona un área institucional válida para el moderador';
  end if;
  update public.users
     set role = p_role,
         can_switch_profile = false,
         area = normalized_area
   where id = p_user_id and not is_superadmin;
  if not found then
    raise exception 'Cuenta inexistente o protegida';
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
   where u.id = p_user_id and not u.is_superadmin
   returning u.name, u.banned into name, banned;
  if not found then
    return;
  end if;
  return next;
end;
$$;

drop function public.admin_list_user_profiles();
create or replace function public.admin_list_user_profiles()
returns table (id uuid, name text, email text, role public.user_role, area text, banned boolean, is_superadmin boolean)
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
    select u.id, u.name, p.email, u.role, u.area, u.banned, u.is_superadmin
      from public.users u
      join private.user_private p on p.user_id = u.id
     order by u.name;
end;
$$;
revoke all on function public.admin_list_user_profiles() from public, anon;
grant execute on function public.admin_list_user_profiles() to authenticated;

create or replace function private.can_manage_space_event(p_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin_actor() or exists (
    select 1 from public.spaces s where s.id = p_space_id and
      case lower(trim(s.name))
        when 'auditorio' then private.can_manage_area('becas')
        when 'sala 14' then private.can_manage_area('subdireccion_academica')
        else private.can_manage_area('clubes_academicos') or private.can_manage_area('clubes_culturales')
      end
  );
$$;

alter policy space_events_student_submit on public.space_events with check (
  created_by = (select auth.uid()) and approval_status = 'pendiente' and authorized_by is null
  and private.is_active_actor() and exists (
    select 1 from public.users where id = (select auth.uid()) and role in ('alumno', 'profesor')
  )
);

-- Las oficinas de trámites trabajan con expedientes de su propia área.
create function private.procedure_office()
returns text language sql stable security definer set search_path = '' as $$
  select area from public.users where id = (select auth.uid())
    and role = 'moderador' and area in ('becas', 'gestion_escolar', 'catt');
$$;
revoke all on function private.procedure_office() from public;
grant execute on function private.procedure_office() to authenticated;

create policy questions_office_scope on public.questions as restrictive for all to authenticated
using ((select private.procedure_office()) is null or area = (select private.procedure_office()))
with check ((select private.procedure_office()) is null or area = (select private.procedure_office()));
create policy guides_office_scope on public.guides as restrictive for all to authenticated
using ((select private.procedure_office()) is null or area = (select private.procedure_office()))
with check ((select private.procedure_office()) is null or area = (select private.procedure_office()));
create policy answers_office_scope on public.answers as restrictive for all to authenticated
using ((select private.procedure_office()) is null or exists (
  select 1 from public.questions q where q.id = question_id and q.area = (select private.procedure_office())
));

-- Cuenta de operación aprovisionada por UUID desde el backend de confianza.
create function public.switch_operating_profile(p_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('admin','profesor','alumno') or not private.is_active_actor() then
    raise exception 'Perfil no disponible';
  end if;
  update public.users set role = p_role
   where id = (select auth.uid()) and can_switch_profile;
  if not found then raise exception 'Cuenta sin acceso a perfiles de operación'; end if;
end;
$$;
revoke all on function public.switch_operating_profile(public.user_role) from public, anon;
grant execute on function public.switch_operating_profile(public.user_role) to authenticated;

create or replace function private.can_manage_forum_question(p_area text, p_request_kind text)
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
      or (p_request_kind = 'nuevo_club' and (
        private.can_manage_area('clubes_academicos')
        or private.can_manage_area('clubes_culturales')
      ))
      or (p_area = 'infraestructura' and (
        private.can_manage_area('prefectura')
      ))
      or (p_request_kind = 'cambio_info' and (
        private.can_manage_area('prefectura')
      ));
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
    select distinct u.id
      from public.users u
     where u.is_active and not u.banned
       and u.id <> new.author_id
       and (
         u.role = 'admin'
         or (u.role = 'moderador' and u.area = new.area)
         or (new.area = 'clubes' and u.role = 'moderador' and u.area in ('clubes_academicos', 'clubes_culturales'))
         or (new.request_kind = 'nuevo_club' and u.role = 'moderador' and u.area in ('clubes_academicos', 'clubes_culturales'))
         or (new.area = 'infraestructura' and u.role = 'moderador' and u.area = 'prefectura')
         or (new.request_kind = 'cambio_info' and u.role = 'moderador' and u.area = 'prefectura')
       )
  loop
    perform private.notify_user(
      mod_row.id,
      'foro',
      case new.request_kind
        when 'actualizar_guia' then 'Solicitud para actualizar guía (' || new.area || ')'
        when 'nuevo_club' then 'Solicitud de nuevo club en el foro'
        when 'cambio_info' then 'Solicitud de cambio de información / cubículo'
        else 'Nueva pregunta en ' || new.area
      end,
      new.title,
      '/foro?duda=' || new.id::text || '#duda-' || new.id::text,
      'normal'
    );
  end loop;
  return new;
end;
$$;
