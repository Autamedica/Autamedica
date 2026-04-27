alter table public.profiles
  add column if not exists sss_validation_status text not null default 'pending'
    check (sss_validation_status = any (array['pending'::text, 'valid'::text, 'invalid'::text])),
  add column if not exists sss_last_checked_at timestamptz null,
  add column if not exists especialidad_registrada text null,
  add column if not exists matricula_nacional text null;

comment on column public.profiles.sss_validation_status is 'Estado de validacion contra registros nacionales SSS/REFEPS.';
comment on column public.profiles.sss_last_checked_at is 'Fecha de ultima verificacion de matricula nacional.';
comment on column public.profiles.especialidad_registrada is 'Especialidad devuelta por el registro nacional al validar matricula.';
comment on column public.profiles.matricula_nacional is 'Numero de matricula nacional validado contra SSS/REFEPS.';
