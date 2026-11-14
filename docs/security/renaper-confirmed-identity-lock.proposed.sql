-- REVIEW ONLY — NOT A MIGRATION. Generate a numbered file via
-- `supabase migration new renaper_confirmed_identity_lock` and validate
-- against a disposable staging database before deploying. DO NOT apply
-- to production directly.
--
-- This stores a patient's confirmation of official data, NOT proof of
-- biometric titularity. It applies only to AR patient records.
-- The official photo is NOT stored here; at most a SHA-256 hash may be
-- committed to prevent unnoticed changes. Address remains editable.

begin;

alter table public.patients
    add column if not exists renaper_confirmed_at timestamptz,
    add column if not exists renaper_confirmation_method text,
    add column if not exists renaper_photo_sha256 text;

-- Lock state is explicit and cannot be inferred from identity_lookup_count.
alter table public.patients
    drop constraint if exists patients_renaper_confirmation_state_ck;
alter table public.patients
    add constraint patients_renaper_confirmation_state_ck check (
      (renaper_confirmed_at is null
        and renaper_confirmation_method is null
        and renaper_photo_sha256 is null)
      or (renaper_confirmed_at is not null
        and renaper_confirmation_method = 'patient_attested_official_data'
        and care_country = 'AR'
        and (renaper_photo_sha256 is null
          or renaper_photo_sha256 ~ '^[a-f0-9]{64}$'))
    );

create or replace function app_private.guard_renaper_locked_patient()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.renaper_confirmed_at is not null
      and current_user <> 'service_role' then
      raise exception 'RENAPER_CONFIRMATION_REQUIRES_TRUSTED_SERVER'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.renaper_confirmed_at is not null then
    if new.renaper_confirmed_at is distinct from old.renaper_confirmed_at
      or new.renaper_confirmation_method is distinct from old.renaper_confirmation_method
      or new.renaper_photo_sha256 is distinct from old.renaper_photo_sha256
      or new.dni is distinct from old.dni
      or new.cuil is distinct from old.cuil
      or new.birth_date is distinct from old.birth_date
      or new.gender is distinct from old.gender
      or new.care_country is distinct from old.care_country then
      raise exception 'RENAPER_CONFIRMED_IDENTITY_IMMUTABLE'
        using errcode = '23514';
    end if;
  elsif new.renaper_confirmed_at is not null
    and current_user <> 'service_role' then
    raise exception 'RENAPER_CONFIRMATION_REQUIRES_TRUSTED_SERVER'
      using errcode = '42501';
  end if;

  -- NEW.address is intentionally not compared: the patient can update it.
  return new;
end;
$$;

drop trigger if exists trg_renaper_locked_patient on public.patients;
create trigger trg_renaper_locked_patient
before insert or update on public.patients
for each row execute function app_private.guard_renaper_locked_patient();

create or replace function app_private.guard_renaper_locked_profile()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.first_name is distinct from new.first_name
    or old.last_name is distinct from new.last_name then
    if exists (
      select 1 from public.patients p
      where p.user_id = old.user_id
        and p.care_country = 'AR'
        and p.renaper_confirmed_at is not null
    ) then
      raise exception 'RENAPER_CONFIRMED_NAME_IMMUTABLE'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_renaper_locked_profile on public.profiles;
create trigger trg_renaper_locked_profile
before update of first_name, last_name on public.profiles
for each row execute function app_private.guard_renaper_locked_profile();

-- Use only the service-role server after it has fetched official RENAPER
-- data, rechecked the authenticated patient's DNI and obtained the
-- patient's explicit consent. Atomic write: canonical fields + lock.
create or replace function public.confirm_renaper_patient_snapshot(
  p_patient_id uuid,
  p_dni text,
  p_gender text,
  p_cuil text,
  p_birth_date date,
  p_first_name text,
  p_last_name text,
  p_address text default null,
  p_photo_sha256 text default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  p_record public.patients%rowtype;
  confirmed_time timestamptz := transaction_timestamp();
begin
  if current_user <> 'service_role' then
    raise exception 'RENAPER_CONFIRMATION_REQUIRES_TRUSTED_SERVER'
      using errcode = '42501';
  end if;

  select * into p_record
    from public.patients p where p.id = p_patient_id
    for update;

  if not found or p_record.care_country <> 'AR'
    or p_record.renaper_confirmed_at is not null then
    raise exception 'RENAPER_NOT_ELIGIBLE_OR_ALREADY_CONFIRMED'
      using errcode = '23514';
  end if;

  if regexp_replace(coalesce(p_record.dni,''), '[^0-9]', '', 'g')
      <> regexp_replace(coalesce(p_dni,''), '[^0-9]', '', 'g')
    or length(regexp_replace(coalesce(p_dni,''), '[^0-9]', '', 'g')) not between 6 and 12
    or coalesce(p_first_name,'') = '' or coalesce(p_last_name,'') = ''
    or p_birth_date is null
    or p_gender not in ('male','female','other')
    or lower(coalesce(p_record.gender,'')) <> p_gender then
    raise exception 'RENAPER_OFFICIAL_IDENTITY_NOT_MATCHED'
      using errcode = '23514';
  end if;

  -- The photos are sensitive; only a digest can be frozen, not photo bytes.
  if p_photo_sha256 is not null
    and p_photo_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'RENAPER_BAD_PHOTO_HASH' using errcode = '22023';
  end if;

  update public.profiles
    set first_name = p_first_name, last_name = p_last_name
    where user_id = p_record.user_id;

  if not found then
    raise exception 'RENAPER_PROFILE_NOT_FOUND' using errcode = '23514';
  end if;

  update public.patients
    set dni = p_dni,
        gender = p_gender,
        cuil = nullif(p_cuil,''),
        birth_date = p_birth_date,
        address = coalesce(nullif(p_address,''),address),
        renaper_confirmed_at = confirmed_time,
        renaper_confirmation_method = 'patient_attested_official_data',
        renaper_photo_sha256 = p_photo_sha256
    where id = p_patient_id;
  return confirmed_time;
end;
$$;

revoke all on function public.confirm_renaper_patient_snapshot(
  uuid,text,text,text,date,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.confirm_renaper_patient_snapshot(
  uuid,text,text,text,date,text,text,text,text
) to service_role;

comment on column public.patients.renaper_confirmed_at is
  'Patient attested to the official record; NOT biometric identity verification. AR only.';
comment on column public.patients.renaper_photo_sha256 is
  'SHA-256 of official photo at patient attestation, if authorized; image bytes are not stored.';

commit;
