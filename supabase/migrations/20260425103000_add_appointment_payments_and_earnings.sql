alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  drop constraint if exists chk_appointments_status;

alter table public.appointments
  add constraint appointments_status_check
  check (
    status = any (
      array[
        'payment_pending'::text,
        'scheduled'::text,
        'confirmed'::text,
        'in_progress'::text,
        'completed'::text,
        'cancelled'::text,
        'no_show'::text
      ]
    )
  );

alter table public.appointments
  add constraint chk_appointments_status
  check (
    status = any (
      array[
        'payment_pending'::text,
        'scheduled'::text,
        'confirmed'::text,
        'in_progress'::text,
        'completed'::text,
        'cancelled'::text,
        'no_show'::text
      ]
    )
  );

create table if not exists public.appointment_payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  gross_amount integer not null check (gross_amount > 0),
  currency text not null default 'ARS',
  status text not null default 'pending' check (status = any (array['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'refunded'::text])),
  provider text not null default 'mercadopago',
  provider_payment_id text null,
  provider_preference_id text null,
  checkout_url text null,
  paid_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id),
  unique (provider_payment_id)
);

create index if not exists idx_appointment_payments_patient_id on public.appointment_payments(patient_id);
create index if not exists idx_appointment_payments_doctor_id on public.appointment_payments(doctor_id);
create index if not exists idx_appointment_payments_status on public.appointment_payments(status);

create table if not exists public.doctor_earnings (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  appointment_payment_id uuid not null references public.appointment_payments(id) on delete cascade,
  gross_amount integer not null check (gross_amount > 0),
  platform_fee_amount integer not null default 0 check (platform_fee_amount >= 0),
  processor_fee_amount integer not null default 0 check (processor_fee_amount >= 0),
  net_amount integer not null check (net_amount >= 0),
  currency text not null default 'ARS',
  status text not null default 'pending' check (status = any (array['pending'::text, 'paid'::text, 'cancelled'::text, 'refunded'::text])),
  payout_cbu_snapshot text null,
  payout_alias_snapshot text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz null,
  unique (appointment_id),
  unique (appointment_payment_id)
);

create index if not exists idx_doctor_earnings_doctor_id on public.doctor_earnings(doctor_id);
create index if not exists idx_doctor_earnings_status on public.doctor_earnings(status);

alter table public.appointment_payments enable row level security;
alter table public.doctor_earnings enable row level security;

drop policy if exists "Patients can read own appointment payments" on public.appointment_payments;
create policy "Patients can read own appointment payments"
  on public.appointment_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.patients
      where patients.id = appointment_payments.patient_id
        and patients.user_id = auth.uid()
    )
  );

drop policy if exists "Doctors can read own earnings" on public.doctor_earnings;
create policy "Doctors can read own earnings"
  on public.doctor_earnings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.doctors
      where doctors.id = doctor_earnings.doctor_id
        and doctors.user_id = auth.uid()
    )
  );
