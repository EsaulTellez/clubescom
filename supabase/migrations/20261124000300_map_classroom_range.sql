alter table public.map_rooms drop constraint map_rooms_code_check;
alter table public.map_rooms add constraint map_rooms_code_check check (
  code ~ '^([12][0-2](0[1-9]|1[0-3])|[34][0-2](0[2-9]|1[0-3])|G[01][0-9]{2})$'
);
