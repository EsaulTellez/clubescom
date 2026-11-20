-- Comunicados: área o subdirección emisora (basada en el formulario oficial de Comunicación Social ESCOM) y formato para Instagram

alter table public.avisos
  add column if not exists source_area text,
  add column if not exists social_instagram text;

alter table public.avisos drop constraint if exists avisos_source_area_check;
alter table public.avisos add constraint avisos_source_area_check check (
  source_area is null or source_area in (
    'general',
    'direccion',
    'subdireccion_academica',
    'sseis',
    'subdireccion_administrativa',
    'sepi',
    'celex',
    'ctce'
  )
);

update public.avisos
   set source_area = case
     when source_area is not null then source_area
     when title ilike '%beca%' or title ilike '%burros blancos%' or title ilike '%combate%' or title ilike '%bienvenida%' or body ilike '%sibec%' then 'sseis'
     when title ilike '%reinscrip%' or title ilike '%trabajo terminal%' or title ilike '%semestre%' or body ilike '%catt%' or body ilike '%saes%' then 'subdireccion_academica'
     when title ilike '%celex%' or body ilike '%inglés%' or body ilike '%idioma%' then 'celex'
     when title ilike '%cosie%' or title ilike '%ctce%' or body ilike '%dictamen%' then 'ctce'
     when title ilike '%posgrado%' or title ilike '%sepi%' then 'sepi'
     when title ilike '%condolencias%' or title ilike '%capital one%' then 'direccion'
     else 'general'
   end
 where source_area is null;
