alter table public.questions add column target_step_index integer check (target_step_index >= 0);
grant insert (target_step_index) on public.questions to authenticated;
create index questions_guide_step on public.questions(target_guide_id, target_step_index)
  where target_step_index is not null;

-- Validate the step in the same transaction as a forum post, including direct API writes.
create function private.check_forum_guide_step() returns trigger
language plpgsql set search_path = '' as $$
declare
  g public.guides%rowtype;
begin
  if new.target_step_index is null then return new; end if;
  select * into g from public.guides where id = new.target_guide_id;
  if not found or g.area <> new.area or new.request_kind <> 'pregunta' or not exists (
    select 1 from jsonb_array_elements(g.steps) with ordinality as s(step, ord)
    where coalesce((step->>'id')::integer, ord - 1) = new.target_step_index
  ) then raise exception 'Paso de guía no válido'; end if;
  return new;
end;
$$;
create trigger check_forum_guide_step before insert on public.questions
for each row execute function private.check_forum_guide_step();

create or replace function private.after_guide_suggestion_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guides%rowtype;
  mod_row record;
  step_title text;
begin
  select * into g from public.guides where id = new.guide_id;
  if not found then return new; end if;
  select step->>'title' into step_title
    from jsonb_array_elements(g.steps) with ordinality as s(step, ord)
   where coalesce((step->>'id')::integer, ord - 1) = new.step_index;
  if step_title is null then raise exception 'Paso de guía no válido'; end if;
  for mod_row in
    select u.id from public.users u
     where u.is_active and not u.banned
       and ((u.role = 'moderador' and u.area = g.area) or u.role = 'admin')
       and u.id <> new.user_id
  loop
    perform private.notify_user(
      mod_row.id,
      'guias',
      'Nueva sugerencia en guía: ' || g.title,
      step_title || ': ' || left(new.body, 140),
      '/guias/' || g.id::text || '?paso=' || new.step_index::text || '#ruta',
      'normal'
    );
  end loop;
  return new;
end;
$$;
