create table if not exists growth_os.email_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('welcome', 'anamnesis_reminder', 'appointment_reminder', 'newsletter')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  recipient_email text not null,
  recipient_name text,
  user_id uuid,
  patient_id uuid,
  appointment_id uuid,
  dedupe_key text not null unique,
  template_data jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_growth_email_jobs_due
  on growth_os.email_jobs (status, scheduled_for)
  where status in ('pending', 'failed');

create index if not exists idx_growth_email_jobs_recipient
  on growth_os.email_jobs (recipient_email, created_at desc);

alter table growth_os.email_jobs enable row level security;

drop policy if exists service_role_all on growth_os.email_jobs;
create policy service_role_all on growth_os.email_jobs
  for all to service_role using (true) with check (true);

grant all on table growth_os.email_jobs to service_role;

create or replace function growth_os.touch_email_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_email_jobs_updated_at on growth_os.email_jobs;
create trigger trg_touch_email_jobs_updated_at
  before update on growth_os.email_jobs
  for each row
  execute function growth_os.touch_email_jobs_updated_at();

create or replace function growth_os.enqueue_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_name text;
  v_user_key text;
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  if coalesce(new.newsletter_subscribed, true) is false then
    return new;
  end if;

  if new.role is not null and new.role <> 'patient' then
    return new;
  end if;

  v_name := nullif(btrim(coalesce(new.first_name, '')), '');
  v_user_key := coalesce(new.user_id::text, lower(new.email));

  insert into growth_os.email_jobs (
    job_type,
    recipient_email,
    recipient_name,
    user_id,
    dedupe_key,
    template_data
  )
  values (
    'welcome',
    lower(new.email),
    v_name,
    new.user_id,
    'welcome:' || v_user_key,
    jsonb_build_object(
      'action_url', 'https://www.autamedica.com/patients/anamnesis?utm_source=email&utm_medium=welcome&utm_campaign=welcome',
      'unsubscribe_url', 'https://www.autamedica.com/unsubscribe?user=' || v_user_key
    )
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_welcome_email on public.profiles;
create trigger trg_enqueue_welcome_email
  after insert on public.profiles
  for each row
  execute function growth_os.enqueue_welcome_email();

create or replace function growth_os.enqueue_anamnesis_reminders(
  batch_limit integer default 50,
  min_profile_age interval default '2 hours'
)
returns integer
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_count integer := 0;
begin
  with candidates as (
    select
      pr.user_id,
      lower(pr.email) as email,
      nullif(btrim(coalesce(pr.first_name, '')), '') as first_name,
      (
        select p.id
        from public.patients p
        where p.user_id = pr.user_id
        order by p.created_at desc nulls last
        limit 1
      ) as patient_id
    from public.profiles pr
    where pr.email is not null
      and btrim(pr.email) <> ''
      and coalesce(pr.newsletter_subscribed, true) is true
      and (pr.role is null or pr.role = 'patient')
      and coalesce(pr.created_at, now()) <= now() - min_profile_age
      and not exists (
        select 1
        from public.patients p2
        join public.anamnesis a on a.patient_id = p2.id
        where p2.user_id = pr.user_id
          and a.deleted_at is null
          and (
            a.completed_at is not null
            or a.status = 'completed'
            or coalesce(a.completion_percentage, 0) >= 100
          )
      )
      and not exists (
        select 1
        from growth_os.email_jobs ej
        where ej.dedupe_key = 'anamnesis_reminder:' || coalesce(pr.user_id::text, lower(pr.email)) || ':initial'
      )
    order by pr.created_at asc nulls last
    limit greatest(batch_limit, 0)
  )
  insert into growth_os.email_jobs (
    job_type,
    recipient_email,
    recipient_name,
    user_id,
    patient_id,
    dedupe_key,
    template_data
  )
  select
    'anamnesis_reminder',
    c.email,
    c.first_name,
    c.user_id,
    c.patient_id,
    'anamnesis_reminder:' || coalesce(c.user_id::text, c.email) || ':initial',
    jsonb_build_object(
      'action_url', 'https://www.autamedica.com/patients/anamnesis?utm_source=email&utm_medium=reminder&utm_campaign=anamnesis_activation',
      'unsubscribe_url', 'https://www.autamedica.com/unsubscribe?user=' || coalesce(c.user_id::text, c.email)
    )
  from candidates c
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function growth_os.enqueue_appointment_email_reminders()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_profile record;
  v_start text;
begin
  if new.patient_id is null or new.start_time is null then
    return new;
  end if;

  select
    pr.user_id,
    lower(pr.email) as email,
    nullif(btrim(coalesce(pr.first_name, '')), '') as first_name,
    coalesce(pr.newsletter_subscribed, true) as subscribed
  into v_profile
  from public.patients p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = new.patient_id
  limit 1;

  if v_profile.email is null or v_profile.email = '' or v_profile.subscribed is false then
    return new;
  end if;

  v_start := to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');

  if new.start_time - interval '24 hours' > now() then
    insert into growth_os.email_jobs (
      job_type,
      recipient_email,
      recipient_name,
      user_id,
      patient_id,
      appointment_id,
      dedupe_key,
      scheduled_for,
      template_data
    )
    values (
      'appointment_reminder',
      v_profile.email,
      v_profile.first_name,
      v_profile.user_id,
      new.patient_id,
      new.id,
      'appointment_reminder:' || new.id::text || ':24h',
      new.start_time - interval '24 hours',
      jsonb_build_object(
        'appointment_time', v_start,
        'action_url', 'https://www.autamedica.com/patients/appointments?utm_source=email&utm_medium=reminder&utm_campaign=appointment_24h',
        'unsubscribe_url', 'https://www.autamedica.com/unsubscribe?user=' || coalesce(v_profile.user_id::text, v_profile.email)
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;

  if new.start_time - interval '2 hours' > now() then
    insert into growth_os.email_jobs (
      job_type,
      recipient_email,
      recipient_name,
      user_id,
      patient_id,
      appointment_id,
      dedupe_key,
      scheduled_for,
      template_data
    )
    values (
      'appointment_reminder',
      v_profile.email,
      v_profile.first_name,
      v_profile.user_id,
      new.patient_id,
      new.id,
      'appointment_reminder:' || new.id::text || ':2h',
      new.start_time - interval '2 hours',
      jsonb_build_object(
        'appointment_time', v_start,
        'action_url', 'https://www.autamedica.com/patients/appointments?utm_source=email&utm_medium=reminder&utm_campaign=appointment_2h',
        'unsubscribe_url', 'https://www.autamedica.com/unsubscribe?user=' || coalesce(v_profile.user_id::text, v_profile.email)
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_appointment_email_reminders on public.appointments;
create trigger trg_enqueue_appointment_email_reminders
  after insert on public.appointments
  for each row
  when (new.status in ('scheduled', 'confirmed'))
  execute function growth_os.enqueue_appointment_email_reminders();

comment on table growth_os.email_jobs is
  'Cola operativa de emails AutaMedica. Los disparadores DB encolan; /api/cron/process-email-jobs renderiza el template oficial y envia por Resend.';
