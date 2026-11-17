-- Imágenes en publicaciones de clubes, preguntas del foro y eventos (espacios y clubes)

alter table public.club_posts
  add column if not exists image_url text;

alter table public.space_events
  add column if not exists image_url text;

alter table public.club_events
  add column if not exists image_url text;

alter table public.questions
  add column if not exists image_url text;

grant update (title, body, image_url) on public.club_posts to authenticated;
grant insert (author_id, area, title, body, image_url) on public.questions to authenticated;

drop policy if exists club_posts_member_read on public.club_posts;
create policy club_posts_member_read on public.club_posts
for select to anon, authenticated
using (
  exists (select 1 from public.clubs c where c.id = club_id and c.active)
  and ((select auth.uid()) is null or private.is_active_actor())
);

drop policy if exists club_events_member_submit on public.club_events;
create policy club_events_member_submit on public.club_events
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_active_actor()
  and (
    (approval_status = 'pendiente' and (private.is_club_member(club_id) or private.can_publish_club(club_id)))
    or (
      (private.is_admin_actor() or private.can_manage_area('clubes_academicos') or private.can_manage_area('clubes_culturales'))
      and (approval_status = 'pendiente' or (approval_status = 'aprobado' and approved_by = (select auth.uid())))
    )
  )
);

-- Asignar imágenes de demostración a las publicaciones, avisos y eventos semilla que no tenían imagen
update public.avisos
   set image_url = case title
     when 'Inicio de semestre 2026-B' then coalesce(image_url, '/demo/explanada-escom.webp')
     when 'Amistoso Burros Blancos vs ESCOM' then coalesce(image_url, '/demo/amistoso-futbol.webp')
     when 'Oportunidad | Capital One para estudiantes y recién egresados' then coalesce(image_url, '/demo/capital-one.webp')
     when 'Comunicado de condolencias | Cuauhtémoc Cárdenas Solórzano' then coalesce(image_url, '/demo/comunicado-ipn.webp')
     when 'Noche de combate · cartel de archivo' then coalesce(image_url, '/demo/noche-combate.webp')
     when 'Reinscripciones: fechas importantes' then coalesce(image_url, '/demo/aviso-reinscripciones.svg')
     when 'Becas institucionales: validación de expediente digital' then coalesce(image_url, '/demo/aviso-becas.svg')
     when 'Entrega de protocolos de Trabajo Terminal 2026-B' then coalesce(image_url, '/demo/aviso-catt-tt.svg')
     when 'Semana de bienvenida ESCOM' then coalesce(image_url, '/demo/explanada-escom.webp')
     else image_url
   end;

update public.club_posts
   set image_url = case title
     when 'Entrenamiento de grafos: BFS, DFS y Dijkstra' then coalesce(image_url, '/demo/post-grafos-icpc.svg')
     when 'Armado de chasis y pruebas de sensores ultrasónicos' then coalesce(image_url, '/demo/post-robotica-chasis.svg')
     when 'Resultados del contest interno de bienvenida' then coalesce(image_url, '/demo/post-contest-resultados.svg')
     when 'Convocatoria a visorías para el torneo interpolitécnico' then coalesce(image_url, '/demo/post-futbol-visorias.svg')
     when 'Ciclo de ciencia ficción: proyección y debate en Sala 14' then coalesce(image_url, '/demo/post-cine-scifi.svg')
     else image_url
   end;

update public.space_events
   set image_url = case title
     when 'Conferencia Magistral: Inteligencia Artificial y Ciberseguridad en el IPN' then coalesce(image_url, '/demo/evento-ia-ciberseguridad.svg')
     when 'Feria de Clubes Académicos, Culturales y Deportivos 2026-B' then coalesce(image_url, '/demo/evento-feria-clubes.svg')
     when 'Taller de Preparación para Entrevistas Técnicas y CV' then coalesce(image_url, '/demo/evento-taller-cv.svg')
     when 'Torneo Relámpago de Bienvenida ESCOM' then coalesce(image_url, '/demo/amistoso-futbol.webp')
     else image_url
   end;

update public.club_events
   set image_url = case title
     when 'Maratón relámpago de estructuras de datos' then coalesce(image_url, '/demo/evento-maraton-estructuras.svg')
     when 'Demostración de robots velocistas y sumo' then coalesce(image_url, '/demo/evento-robots-sumo.svg')
     when 'Partido de preparación ESCOM Interclubes' then coalesce(image_url, '/demo/post-futbol-visorias.svg')
     when 'Función comentada: Cine y tecnología' then coalesce(image_url, '/demo/post-cine-scifi.svg')
     else image_url
   end;
