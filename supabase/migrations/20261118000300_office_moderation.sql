-- Las oficinas asignadas a trámites, clubes o sedes no operan el panel de sanciones generales.
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
  if not private.is_active_actor() or not private.can_manage_area(p_area) or exists (
    select 1 from public.users u where u.id = actor_id and u.role = 'moderador'
      and u.area in ('becas', 'catt', 'gestion_escolar', 'subdireccion_academica')
  ) then
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
