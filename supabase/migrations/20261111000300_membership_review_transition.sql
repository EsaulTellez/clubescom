-- Club managers may resolve pending requests, not rewrite existing memberships.
drop policy memberships_manager_review on public.memberships;
create policy memberships_manager_review on public.memberships for update to authenticated
using (status = 'pendiente' and private.can_publish_club(club_id))
with check (status in ('aceptada', 'rechazada') and private.can_publish_club(club_id));
