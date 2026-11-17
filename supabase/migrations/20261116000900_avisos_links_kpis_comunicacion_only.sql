-- Comunicados: enlace externo, métricas de vistas/clics para KPIs de Comunicación y restricción de eventos para rol comunicación

alter table public.avisos
  add column if not exists external_url text,
  add column if not exists views_count integer not null default 0,
  add column if not exists link_clicks_count integer not null default 0;

alter table public.avisos drop constraint if exists avisos_external_url_valid;
alter table public.avisos add constraint avisos_external_url_valid check (
  external_url is null or external_url ~* '^https?://'
);

create table if not exists public.aviso_interactions (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references public.avisos(id) on delete cascade,
  kind text not null check (kind in ('view', 'click')),
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists aviso_interactions_aviso_kind_idx
  on public.aviso_interactions (aviso_id, kind, created_at desc);

alter table public.aviso_interactions enable row level security;

grant select on public.aviso_interactions to authenticated;

drop policy if exists aviso_interactions_comms_read on public.aviso_interactions;
create policy aviso_interactions_comms_read on public.aviso_interactions
for select to authenticated
using (
  private.is_admin_actor()
  or private.can_manage_area('comunicacion')
);

create or replace function public.record_aviso_interaction(
  p_aviso_id uuid,
  p_kind text
)
returns table (views_count integer, link_clicks_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  aviso_row public.avisos%rowtype;
begin
  if p_kind not in ('view', 'click') then
    raise exception 'Tipo de interacción inválido';
  end if;

  select * into aviso_row
    from public.avisos a
   where a.id = p_aviso_id
   for update;

  if not found then
    return;
  end if;

  if not (
    (aviso_row.publish_at <= now() and (aviso_row.is_public or actor_id is not null))
    or aviso_row.author_id = actor_id
    or private.is_admin_actor()
    or private.can_manage_area('comunicacion')
  ) then
    return;
  end if;

  if p_kind = 'click' and (aviso_row.external_url is null or length(trim(aviso_row.external_url)) = 0) then
    return query select aviso_row.views_count, aviso_row.link_clicks_count;
    return;
  end if;

  insert into public.aviso_interactions (aviso_id, kind, user_id)
  values (p_aviso_id, p_kind, actor_id);

  if p_kind = 'view' then
    update public.avisos
       set views_count = public.avisos.views_count + 1
     where id = p_aviso_id
     returning public.avisos.views_count, public.avisos.link_clicks_count
      into views_count, link_clicks_count;
  else
    update public.avisos
       set link_clicks_count = public.avisos.link_clicks_count + 1
     where id = p_aviso_id
     returning public.avisos.views_count, public.avisos.link_clicks_count
      into views_count, link_clicks_count;
  end if;

  return next;
end;
$$;

revoke all on function public.record_aviso_interaction(uuid, text) from public;
grant execute on function public.record_aviso_interaction(uuid, text) to anon, authenticated;

-- El área de comunicación solo gestiona comunicados/avisos, no eventos de espacios
drop policy if exists space_events_approved_read on public.space_events;
create policy space_events_approved_read on public.space_events
for select to anon, authenticated
using (
  (approval_status = 'aprobado' and is_public = true)
  or created_by = (select auth.uid())
  or private.is_admin_actor()
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
);

drop policy if exists space_events_staff_publish on public.space_events;
create policy space_events_staff_publish on public.space_events
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and approval_status = 'aprobado'
  and authorized_by = (select auth.uid())
  and (
    private.is_admin_actor()
    or private.can_manage_area('clubes_academicos')
    or private.can_manage_area('clubes_culturales')
    or private.can_manage_area('becas')
  )
);

drop policy if exists space_events_staff_review on public.space_events;
create policy space_events_staff_review on public.space_events
for update to authenticated
using (
  private.is_admin_actor()
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
)
with check (
  private.is_admin_actor()
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
);

drop policy if exists space_events_staff_delete on public.space_events;
create policy space_events_staff_delete on public.space_events
for delete to authenticated
using (
  private.is_admin_actor()
  or private.can_manage_area('clubes_academicos')
  or private.can_manage_area('clubes_culturales')
  or private.can_manage_area('becas')
);
