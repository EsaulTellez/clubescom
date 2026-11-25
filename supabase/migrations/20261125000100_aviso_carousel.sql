alter table public.avisos
  add column valid_until date
  check (valid_until >= (publish_at at time zone 'America/Mexico_City')::date);

create view public.aviso_carousel with (security_invoker = true) as
select id, row_number() over (order by deadline, publish_at desc, id) as position
from (
  select id, publish_at,
         coalesce(valid_until, (publish_at at time zone 'America/Mexico_City')::date) as deadline
  from public.avisos
  where publish_at <= now() and nullif(btrim(image_url), '') is not null
) posted
where deadline >= (now() at time zone 'America/Mexico_City')::date;

grant select on public.aviso_carousel to anon, authenticated;
