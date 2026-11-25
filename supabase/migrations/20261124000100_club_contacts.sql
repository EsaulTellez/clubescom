create function public.get_club_proposal_contacts(p_proposal_id uuid)
returns table (id uuid, name text, email text)
language sql stable security definer
set search_path = ''
as $$
  select u.id, u.name, contact.email
  from public.club_proposals p
  join public.users u on u.id in (p.proposer_id, p.advisor_id)
  join private.user_private contact on contact.user_id = u.id
  where p.id = p_proposal_id
    and private.is_active_actor()
    and private.can_view_proposal_dossier(p.id);
$$;

revoke all on function public.get_club_proposal_contacts(uuid) from public, anon;
grant execute on function public.get_club_proposal_contacts(uuid) to authenticated;

create function public.get_sseis_club_delegates()
returns table (user_id uuid, name text, role public.user_role, boleta text, email text, note text)
language sql stable security definer
set search_path = ''
as $$
  select u.id, u.name, u.role, contact.boleta, contact.email, d.note
  from public.club_area_delegates d
  join public.users u on u.id = d.user_id
  left join private.user_private contact on contact.user_id = d.user_id
  where d.active and d.area_group = 'cultural_deportivo'
    and (private.is_admin_actor() or private.can_manage_area('sseis'))
  order by u.name;
$$;

revoke all on function public.get_sseis_club_delegates() from public, anon;
grant execute on function public.get_sseis_club_delegates() to authenticated;
