-- Management checks require a signed-in actor. Guests can read the public board.
alter policy space_events_approved_read on public.space_events to authenticated;

create policy space_events_guest_read on public.space_events
for select to anon
using (approval_status = 'aprobado' and is_public);
