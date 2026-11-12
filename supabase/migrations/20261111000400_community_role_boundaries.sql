-- Community members may submit content, not choose its review or official state.
drop policy questions_active_user_insert on public.questions;
create policy questions_active_user_insert on public.questions for insert to authenticated
with check (author_id = (select auth.uid()) and private.is_active_actor()
  and status = 'sin_responder' and not is_pinned);
revoke insert on public.questions from authenticated;
grant insert (author_id, area, title, body) on public.questions to authenticated;

drop policy guide_suggestions_owner_insert on public.guide_suggestions;
create policy guide_suggestions_owner_insert on public.guide_suggestions for insert to authenticated
with check (user_id = (select auth.uid()) and private.is_active_actor()
  and status = 'pendiente' and reviewed_by is null and reviewed_at is null and review_note is null);
revoke insert on public.guide_suggestions from authenticated;
grant insert (guide_id, user_id, step_index, body, status) on public.guide_suggestions to authenticated;

drop policy guide_step_questions_owner_insert on public.guide_step_questions;
create policy guide_step_questions_owner_insert on public.guide_step_questions for insert to authenticated
with check (author_id = (select auth.uid()) and private.is_active_actor() and status = 'pendiente');
revoke insert on public.guide_step_questions from authenticated;
grant insert (guide_id, step_index, author_id, title, body) on public.guide_step_questions to authenticated;

-- A suspended club member cannot keep reading the private club feed with an old token.
create or replace function private.is_club_member(p_club_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_actor() and (
    exists (select 1 from public.clubs c where c.id = p_club_id and (c.leader_id = (select auth.uid()) or c.advisor_id = (select auth.uid())))
    or exists (select 1 from public.memberships m where m.club_id = p_club_id and m.user_id = (select auth.uid()) and m.status = 'aceptada')
  );
$$;
