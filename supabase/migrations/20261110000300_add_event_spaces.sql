-- Espacios de la cartelera; no representa disponibilidad ni reservaciones.
insert into public.spaces (name, kind, description) values
  ('El domo', 'espacio', 'Actividades autorizadas en el domo.'),
  ('Canchas de fútbol', 'deportivo', 'Actividades autorizadas en las canchas de fútbol.'),
  ('Canchas de voleibol', 'deportivo', 'Actividades autorizadas en las canchas de voleibol.')
on conflict (name) do nothing;
