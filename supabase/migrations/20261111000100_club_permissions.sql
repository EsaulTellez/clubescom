-- Club managers publish only for their own club; membership grants reading, not posting.
create or replace function private.can_publish_club(p_club_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_actor() and exists (
    select 1 from public.clubs c where c.id = p_club_id and c.active
      and (c.leader_id = (select auth.uid()) or c.advisor_id = (select auth.uid()))
  );
$$;
grant execute on function private.can_publish_club(uuid) to authenticated;

drop policy club_posts_member_insert on public.club_posts;
create policy club_posts_managers_insert on public.club_posts for insert to authenticated
with check (author_id = (select auth.uid()) and private.can_publish_club(club_id));

-- Prevent changing the author or moving an existing post to another club.
revoke update on public.club_posts from authenticated;
grant update (title, body) on public.club_posts to authenticated;
drop policy club_posts_author_or_moderator_update on public.club_posts;
create policy club_posts_manager_update on public.club_posts for update to authenticated
using (author_id = (select auth.uid()) and private.can_publish_club(club_id))
with check (author_id = (select auth.uid()) and private.can_publish_club(club_id));

-- Academic clubs staff can register clubs; cultural staff manage their own kinds.
drop policy clubs_academic_area_insert on public.clubs;
create policy clubs_area_insert on public.clubs for insert to authenticated
with check (
  private.can_manage_area('clubes_academicos')
  or (kind in ('cultural', 'deportivo') and private.can_manage_area('clubes_culturales'))
);

-- A reviewer can decide status, but cannot move the request or replace its owner.
revoke update on public.memberships from authenticated;
grant update (status) on public.memberships to authenticated;
drop policy memberships_leader_review on public.memberships;
drop policy memberships_advisor_review on public.memberships;
create policy memberships_manager_review on public.memberships for update to authenticated
using (private.can_publish_club(club_id))
with check (private.can_publish_club(club_id));
