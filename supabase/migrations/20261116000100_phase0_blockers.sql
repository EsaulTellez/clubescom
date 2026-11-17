-- Fase 0: Bloqueantes y bugs de flujo / permisos

-- 0.1 Desbloqueo de documentos y cita en propuestas de clubes para el proponente
create or replace function private.is_proposal_participant(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_proposals p
     where p.id = p_proposal_id
       and p.status in ('en_documentacion', 'en_validacion', 'cita_pendiente')
       and (
         p.proposer_id = (select auth.uid())
         or exists (
           select 1 from public.club_interests i
            where i.proposal_id = p.id and i.user_id = (select auth.uid())
         )
       )
  );
$$;
grant execute on function private.is_proposal_participant(uuid) to authenticated;

drop policy if exists club_docs_interested_owner_insert on public.club_proposal_documents;
create policy club_docs_interested_owner_insert on public.club_proposal_documents
for insert to authenticated with check (
  user_id = (select auth.uid())
  and status = 'recibido'
  and private.is_active_actor()
  and private.is_proposal_participant(proposal_id)
);

drop policy if exists club_docs_owner_resubmit on public.club_proposal_documents;
create policy club_docs_owner_resubmit on public.club_proposal_documents
for update to authenticated using (
  user_id = (select auth.uid())
  and status = 'requiere_correccion'
  and private.is_active_actor()
  and private.is_proposal_participant(proposal_id)
) with check (
  user_id = (select auth.uid())
  and status = 'recibido'
  and storage_path like proposal_id::text || '/' || (select auth.uid())::text || '/%'
  and private.is_active_actor()
  and private.is_proposal_participant(proposal_id)
);

drop policy if exists club_documents_owner_upload on storage.objects;
create policy club_documents_owner_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'club-documents'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_active_actor()
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_proposal_participant(((storage.foldername(name))[1])::uuid)
);

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
           from (
             select i.user_id from public.club_interests i where i.proposal_id = p.id
             union
             select p.proposer_id
           ) participants(user_id)
           cross join (values ('credencial_ipn'), ('boleta'), ('firma'), ('vigencia_ims')) required(document_type)
           left join public.club_proposal_documents d
             on d.proposal_id = p.id
            and d.user_id = participants.user_id
            and d.document_type = required.document_type
            and d.status = 'recibido'
          where d.id is null
       )
  );
$$;

-- 0.2 Cubículos conectados con el Mapa 3D y cohabitación de cubículos
alter table public.cubicles drop constraint if exists cubicles_building_floor_label_key;
alter table public.cubicles add column if not exists room_code text references public.map_rooms(code) on delete set null;

create or replace function private.ensure_map_room_for_cubicle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.room_code is not null then
    insert into public.map_rooms (code, kind, name, description)
    values (new.room_code, 'cubiculo', new.label, '')
    on conflict (code) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_map_room_for_cubicle() from public, anon, authenticated;

drop trigger if exists cubicles_ensure_map_room on public.cubicles;
create trigger cubicles_ensure_map_room
before insert or update on public.cubicles
for each row execute function private.ensure_map_room_for_cubicle();

create or replace view public.map_room_people as
select a.room_code, u.id, u.name
  from public.map_room_professors a
  join public.users u on u.id = a.professor_id
 where u.is_active
union
select c.room_code, u.id, u.name
  from public.cubicles c
  join public.users u on u.id = c.professor_id
 where c.room_code is not null and u.is_active;

grant select on public.map_room_people to anon, authenticated;

-- 0.3 Datos de contacto y nota de encuentro en Objetos Perdidos
alter table public.lost_item_handoffs add column if not exists meeting_note text;

create or replace function public.get_lost_item_handoff_contact(p_item_id uuid)
returns table (
  handoff_id uuid,
  finder_id uuid,
  finder_name text,
  finder_email text,
  recipient_id uuid,
  recipient_name text,
  recipient_email text,
  meeting_note text,
  status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id,
         h.finder_id,
         uf.name,
         pf.email,
         h.recipient_id,
         ur.name,
         pr.email,
         h.meeting_note,
         h.status,
         h.expires_at
    from public.lost_item_handoffs h
    join public.lost_item_claims c on c.id = h.claim_id
    join public.users uf on uf.id = h.finder_id
    join private.user_private pf on pf.user_id = h.finder_id
    join public.users ur on ur.id = h.recipient_id
    join private.user_private pr on pr.user_id = h.recipient_id
   where c.lost_item_id = p_item_id
     and (h.finder_id = (select auth.uid()) or h.recipient_id = (select auth.uid()) or private.is_admin_actor())
   order by h.created_at desc
   limit 1;
$$;
revoke all on function public.get_lost_item_handoff_contact(uuid) from public, anon;
grant execute on function public.get_lost_item_handoff_contact(uuid) to authenticated;

create or replace function public.update_lost_item_meeting_note(p_handoff_id uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  handoff public.lost_item_handoffs%rowtype;
  item_id uuid;
  other_user uuid;
begin
  if not private.is_active_actor() then raise exception 'Se requiere una cuenta activa'; end if;
  select h.* into handoff from public.lost_item_handoffs h where h.id = p_handoff_id for update;
  if not found or (handoff.finder_id <> (select auth.uid()) and handoff.recipient_id <> (select auth.uid())) then
    return false;
  end if;
  update public.lost_item_handoffs
     set meeting_note = nullif(trim(left(coalesce(p_note, ''), 500)), '')
   where id = p_handoff_id;
  select c.lost_item_id into item_id from public.lost_item_claims c where c.id = handoff.claim_id;
  other_user := case when handoff.finder_id = (select auth.uid()) then handoff.recipient_id else handoff.finder_id end;
  insert into public.notifications (user_id, title, body, href)
  values (
    other_user,
    'Punto de entrega actualizado',
    coalesce(nullif(trim(left(coalesce(p_note, ''), 200)), ''), 'Se actualizó la nota de entrega del objeto.'),
    '/objetos/' || item_id::text
  );
  return true;
end;
$$;
revoke all on function public.update_lost_item_meeting_note(uuid, text) from public, anon;
grant execute on function public.update_lost_item_meeting_note(uuid, text) to authenticated;

-- 0.4 Catálogo estricto de áreas de moderador
update public.users
   set area = lower(trim(area))
 where area is not null;

update public.users
   set area = 'gestion_escolar'
 where role = 'moderador'
   and (area is null or area not in (
     'gestion_escolar', 'becas', 'catt', 'comunicacion',
     'clubes_academicos', 'clubes_culturales', 'prefectura', 'subdireccion_academica'
   ));

alter table public.users drop constraint if exists users_moderator_area_valid;
alter table public.users add constraint users_moderator_area_valid check (
  (role <> 'moderador' and area is null)
  or (role = 'moderador' and area in (
    'gestion_escolar', 'becas', 'catt', 'comunicacion',
    'clubes_academicos', 'clubes_culturales', 'prefectura', 'subdireccion_academica'
  ))
);

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
  if not private.is_admin_actor() then
    raise exception 'Solo administración puede asignar roles';
  end if;
  if p_role = 'moderador' and normalized_area not in (
    'gestion_escolar', 'becas', 'catt', 'comunicacion',
    'clubes_academicos', 'clubes_culturales', 'prefectura', 'subdireccion_academica'
  ) then
    raise exception 'Selecciona un área institucional válida para el moderador';
  end if;
  update public.users
     set role = p_role,
         area = normalized_area
   where id = p_user_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end;
$$;

-- 0.5 Avisos internos (is_public = false) visibles para la comunidad autenticada activa
drop policy if exists avisos_public_read on public.avisos;
drop policy if exists avisos_author_read on public.avisos;

create policy avisos_anon_read on public.avisos
for select to anon
using (is_public and publish_at <= now());

create policy avisos_authenticated_read on public.avisos
for select to authenticated
using (
  (publish_at <= now() and (is_public or private.is_active_actor()))
  or author_id = (select auth.uid())
  or private.can_manage_area('comunicacion')
);
