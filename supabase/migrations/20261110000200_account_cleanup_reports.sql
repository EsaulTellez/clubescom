-- Files whose database records will disappear with the current account.
create or replace function public.my_account_storage_objects()
returns table (bucket_id text, object_name text)
language sql security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where (select auth.uid()) is not null and (
    (o.bucket_id = 'public-media' and split_part(o.name, '/', 1) = (select auth.uid())::text)
    or (o.bucket_id in ('club-documents', 'lost-evidence', 'guide-source') and split_part(o.name, '/', 2) = (select auth.uid())::text)
    or (o.bucket_id = 'club-documents' and exists (select 1 from public.club_proposals p where p.proposer_id = (select auth.uid()) and p.id::text = split_part(o.name, '/', 1)))
    or (o.bucket_id = 'lost-evidence' and exists (select 1 from public.lost_items i where i.reporter_id = (select auth.uid()) and i.id::text = split_part(o.name, '/', 1)))
  );
$$;
revoke all on function public.my_account_storage_objects() from public, anon;
grant execute on function public.my_account_storage_objects() to authenticated;

create or replace function public.admin_dashboard_metrics()
returns table (users_total bigint, notices_total bigint, clubs_total bigint, lost_total bigint,
  questions_total bigint, active_30_days bigint, questions_open bigint, questions_answered bigint, handoffs_pending bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin_actor() then raise exception 'Solo administración general'; end if;
  return query select
    (select count(*) from public.users where is_active),
    (select count(*) from public.avisos),
    (select count(*) from public.clubs where active),
    (select count(*) from public.lost_items where status = 'abierto'),
    (select count(*) from public.questions),
    (select count(distinct actor_id) from public.audit_logs where actor_id is not null and created_at >= now() - interval '30 days'),
    (select count(*) from public.questions where status = 'sin_responder'),
    (select count(*) from public.questions where status = 'respondida'),
    (select count(*) from public.lost_item_handoffs h join public.lost_item_claims c on c.id = h.claim_id join public.lost_items i on i.id = c.lost_item_id where h.status = 'pendiente' and h.expires_at > now() and i.status = 'abierto');
end;
$$;
revoke all on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;

create or replace function public.admin_guide_impact()
returns table (title text, area text, readers bigint, views bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin_actor() then raise exception 'Solo administración general'; end if;
  return query select g.title, g.area, count(distinct e.user_id), count(*)
    from public.guides g join public.guide_analytics_events e on e.guide_id = g.id
    where e.event_type = 'view' and e.user_id is not null
    group by g.id having count(distinct e.user_id) >= 5
    order by count(*) desc limit 10;
end;
$$;
revoke all on function public.admin_guide_impact() from public, anon;
grant execute on function public.admin_guide_impact() to authenticated;

-- A membership request may never enroll itself as accepted.
drop policy memberships_owner_insert on public.memberships;
create policy memberships_owner_insert on public.memberships for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pendiente' and private.is_active_actor()
  and exists (select 1 from public.clubs c where c.id = club_id and c.active));
create or replace function public.resubmit_club_membership(p_club_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_active_actor() then return false; end if;
  update public.memberships m set status = 'pendiente'
  where m.club_id = p_club_id and m.user_id = (select auth.uid()) and m.status = 'rechazada'
    and exists (select 1 from public.clubs c where c.id = p_club_id and c.active);
  return found;
end;
$$;
revoke all on function public.resubmit_club_membership(uuid) from public, anon;
grant execute on function public.resubmit_club_membership(uuid) to authenticated;

create or replace function public.admin_question_impact()
returns table (area text, questions bigint, unanswered bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin_actor() then raise exception 'Solo administración general'; end if;
  return query select q.area, count(*), count(*) filter (where q.status = 'sin_responder')
    from public.questions q group by q.area having count(distinct q.author_id) >= 5
    order by count(*) desc;
end;
$$;
revoke all on function public.admin_question_impact() from public, anon;
grant execute on function public.admin_question_impact() to authenticated;

-- Proposers may submit an appointment, but cannot set their own approval state.
drop policy club_proposals_owner_insert on public.club_proposals;
create policy club_proposals_owner_insert on public.club_proposals for insert to authenticated
with check (proposer_id = (select auth.uid()) and private.is_active_actor()
  and status = 'abierta' and advisor_id is null and advisor_confirmed_at is null and interested_count = 0);
drop policy club_proposals_owner_or_reviewer_update on public.club_proposals;
create policy club_proposals_reviewer_update on public.club_proposals for update to authenticated
using (private.can_manage_area('clubes_academicos') or private.can_manage_area('subdireccion_academica'))
with check (private.can_manage_area('clubes_academicos') or private.can_manage_area('subdireccion_academica'));
create or replace function private.mark_club_appointment_requested()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.club_proposals set status = 'cita_pendiente', updated_at = now()
  where id = new.proposal_id and proposer_id = new.requested_by and status = 'en_validacion';
  if not found then raise exception 'La propuesta no está lista para solicitar cita'; end if;
  return new;
end;
$$;
revoke all on function private.mark_club_appointment_requested() from public, anon, authenticated;
create trigger club_appointment_requested after insert on public.club_appointments
for each row execute function private.mark_club_appointment_requested();

-- Publish forum notifications and official state atomically without giving users
-- permission to forge arbitrary notifications for others.
create or replace function private.after_forum_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare question_row public.questions%rowtype;
begin
  select * into question_row from public.questions where id = new.question_id;
  if new.official then
    update public.questions set status = 'respondida', updated_at = now()
    where id = new.question_id and status <> 'cerrada';
  end if;
  if question_row.author_id <> new.author_id then
    insert into public.notifications (user_id, title, body, href)
    values (question_row.author_id, 'Nueva respuesta', 'Hay una nueva respuesta en «' || question_row.title || '».', '/foro/' || new.question_id::text);
  end if;
  return new;
end;
$$;
revoke all on function private.after_forum_answer() from public, anon, authenticated;
create trigger forum_answer_notification after insert on public.answers
for each row execute function private.after_forum_answer();
