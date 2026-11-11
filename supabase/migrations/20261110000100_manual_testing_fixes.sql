-- Fix role-specific access and keep private records private.
create policy avisos_author_read on public.avisos for select to authenticated
using (author_id = (select auth.uid()) and private.can_manage_area('comunicacion'));
create or replace function private.is_club_member(p_club_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clubs c where c.id = p_club_id and (c.leader_id = (select auth.uid()) or c.advisor_id = (select auth.uid())))
    or exists (select 1 from public.memberships m where m.club_id = p_club_id and m.user_id = (select auth.uid()) and m.status = 'aceptada');
$$;
create policy memberships_advisor_read on public.memberships for select to authenticated
using (exists (select 1 from public.clubs c where c.id = club_id and c.advisor_id = (select auth.uid())));
create policy memberships_advisor_review on public.memberships for update to authenticated
using (exists (select 1 from public.clubs c where c.id = club_id and c.advisor_id = (select auth.uid())))
with check (exists (select 1 from public.clubs c where c.id = club_id and c.advisor_id = (select auth.uid())));
create policy space_events_staff_delete on public.space_events for delete to authenticated
using (private.can_manage_area('comunicacion') or private.can_manage_area('clubes_academicos'));
create policy guide_suggestions_area_delete on public.guide_suggestions for delete to authenticated
using (exists (select 1 from public.guides g where g.id = guide_id and private.can_manage_area(g.area)));

create table private.lost_claim_attempts (
  item_id uuid not null references public.lost_items(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  attempts integer not null default 0,
  primary key (item_id, user_id)
);
revoke all on private.lost_claim_attempts from public, anon, authenticated;
-- Mutations of claims and handoffs must go through the checked RPCs.
revoke insert, update, delete on public.lost_item_claims, public.lost_item_handoffs from authenticated;

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
  attempts integer;
begin
  if not private.is_active_actor() then raise exception 'Se requiere una cuenta activa'; end if;
  select li.reporter_id, li.status, s.security_answer_hash
    into item_owner, item_status, expected_hash
    from public.lost_items li
    left join private.lost_item_secrets s on s.lost_item_id = li.id
   where li.id = p_item_id and li.kind = 'encontrado' for update of li;
  if not found or item_status <> 'abierto' or item_owner = actor_id then
    raise exception 'No se puede reclamar este reporte';
  end if;
  if exists (select 1 from public.lost_item_claims c where c.lost_item_id = p_item_id and c.claimant_id = actor_id) then
    raise exception 'Ya enviaste un reclamo';
  end if;
  insert into private.lost_claim_attempts as a (item_id, user_id, attempts) values (p_item_id, actor_id, 1)
  on conflict (item_id, user_id) do update set attempts = a.attempts + 1
  returning a.attempts into attempts;
  if attempts > 3 then return query select null::uuid, 'limite'::text; return; end if;
  if expected_hash is null or expected_hash <> lower(coalesce(p_answer_hash, '')) then
    return query select null::uuid, 'incorrecta'::text; return;
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
  item_status text;
begin
  select c.* into claim_row from public.lost_item_claims c where c.id = p_claim_id for update;
  if not found then raise exception 'No encontramos el reclamo'; end if;
  select li.reporter_id, li.status into item_owner, item_status from public.lost_items li where li.id = claim_row.lost_item_id for update;
  if item_owner <> (select auth.uid()) or claim_row.status <> 'respuesta_correcta' then
    raise exception 'Solo quien publicó el hallazgo puede revisar este reclamo';
  end if;
  if item_status <> 'abierto' then raise exception 'El reporte ya no está abierto'; end if;
  if p_approve and exists (select 1 from public.lost_item_claims c where c.lost_item_id = claim_row.lost_item_id and c.status = 'aprobada') then
    raise exception 'Ya hay una entrega aprobada para este objeto';
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


create or replace function public.complete_lost_item_handoff(p_handoff_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  handoff public.lost_item_handoffs%rowtype;
  expected_hash text;
  item_status text;
begin
  select h.* into handoff from public.lost_item_handoffs h where h.id = p_handoff_id for update;
  if not found or handoff.finder_id <> (select auth.uid()) or handoff.status <> 'pendiente' or handoff.expires_at <= now() then
    return false;
  end if;
  select li.status into item_status from public.lost_items li
  join public.lost_item_claims c on c.lost_item_id = li.id
  where c.id = handoff.claim_id for update of li;
  if item_status <> 'abierto' then return false; end if;
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

