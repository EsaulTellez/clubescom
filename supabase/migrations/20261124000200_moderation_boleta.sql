create function private.moderation_user_boleta(p_user_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.boleta
    from private.user_private p
   where p.user_id = p_user_id
     and (
       private.is_admin_actor()
       or exists (
         select 1 from public.users actor
          where actor.id = (select auth.uid())
            and private.is_active_actor()
            and actor.role = 'moderador'
            and actor.area not in ('becas', 'catt', 'gestion_escolar', 'subdireccion_academica')
            and (
              exists (select 1 from public.moderation_strikes s
                        where s.user_id = p.user_id and s.area = actor.area)
              or exists (select 1 from public.moderation_suspensions s
                           where s.user_id = p.user_id and s.area = actor.area)
            )
       )
     );
$$;

revoke all on function private.moderation_user_boleta(uuid) from public, anon;
grant execute on function private.moderation_user_boleta(uuid) to authenticated;
