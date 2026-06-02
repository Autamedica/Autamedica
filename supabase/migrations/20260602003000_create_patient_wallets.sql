-- Patient wallet for AutaMedica credit.
-- Fintech core: balances are updated only through RPCs and every movement is ledgered.

create table if not exists public.patient_wallets (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  available_credit_cents bigint not null default 0 check (available_credit_cents >= 0),
  locked_credit_cents bigint not null default 0 check (locked_credit_cents >= 0),
  currency text not null default 'ARS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id),
  check (currency = 'ARS')
);

create table if not exists public.patient_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  kind text not null check (kind in (
    'credit_grant',
    'appointment_payment',
    'refund_credit',
    'credit_reversal',
    'manual_adjustment'
  )),
  amount_cents bigint not null check (amount_cents > 0),
  balance_after_cents bigint not null check (balance_after_cents >= 0),
  currency text not null default 'ARS' check (currency = 'ARS'),
  ref text not null,
  appointment_id uuid null references public.appointments(id) on delete set null,
  appointment_payment_id uuid null references public.appointment_payments(id) on delete set null,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (ref)
);

create index if not exists idx_patient_wallet_ledger_patient_created
  on public.patient_wallet_ledger(patient_id, created_at desc);

create index if not exists idx_patient_wallet_ledger_appointment
  on public.patient_wallet_ledger(appointment_id)
  where appointment_id is not null;

alter table public.patient_wallets enable row level security;
alter table public.patient_wallet_ledger enable row level security;

drop policy if exists patient_wallets_select_own on public.patient_wallets;
create policy patient_wallets_select_own on public.patient_wallets
  for select
  using (
    exists (
      select 1
      from public.patients p
      where p.id = patient_wallets.patient_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists patient_wallet_ledger_select_own on public.patient_wallet_ledger;
create policy patient_wallet_ledger_select_own on public.patient_wallet_ledger
  for select
  using (
    exists (
      select 1
      from public.patients p
      where p.id = patient_wallet_ledger.patient_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists service_role_manage_patient_wallets on public.patient_wallets;
create policy service_role_manage_patient_wallets on public.patient_wallets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists service_role_manage_patient_wallet_ledger on public.patient_wallet_ledger;
create policy service_role_manage_patient_wallet_ledger on public.patient_wallet_ledger
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.touch_patient_wallets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_patient_wallets_updated_at on public.patient_wallets;
create trigger trg_touch_patient_wallets_updated_at
  before update on public.patient_wallets
  for each row
  execute function public.touch_patient_wallets_updated_at();

create or replace function public.ensure_patient_wallet(p_patient_id uuid)
returns public.patient_wallets
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_wallet public.patient_wallets;
begin
  if p_patient_id is null then
    raise exception 'patient_id_required';
  end if;

  insert into public.patient_wallets (patient_id, currency)
  values (p_patient_id, 'ARS')
  on conflict (patient_id) do nothing;

  select *
  into v_wallet
  from public.patient_wallets
  where patient_id = p_patient_id;

  return v_wallet;
end;
$$;

create or replace function public.patient_wallet_get_balance(p_patient_id uuid default null)
returns table (
  patient_id uuid,
  available_credit_cents bigint,
  locked_credit_cents bigint,
  total_credit_cents bigint,
  currency text
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_patient_id uuid;
  v_wallet public.patient_wallets;
begin
  if p_patient_id is not null then
    v_patient_id := p_patient_id;
  else
    select p.id
    into v_patient_id
    from public.patients p
    where p.user_id = auth.uid()
    limit 1;
  end if;

  if v_patient_id is null then
    return;
  end if;

  v_wallet := public.ensure_patient_wallet(v_patient_id);

  patient_id := v_patient_id;
  available_credit_cents := coalesce(v_wallet.available_credit_cents, 0);
  locked_credit_cents := coalesce(v_wallet.locked_credit_cents, 0);
  total_credit_cents := coalesce(v_wallet.available_credit_cents, 0)
    + coalesce(v_wallet.locked_credit_cents, 0);
  currency := coalesce(v_wallet.currency, 'ARS');
  return next;
end;
$$;

create or replace function public.grant_patient_wallet_credit(
  p_patient_id uuid,
  p_amount_cents bigint,
  p_reason text,
  p_appointment_id uuid default null,
  p_created_by uuid default null,
  p_idempotency_key text default null,
  p_expires_at timestamptz default null
)
returns table (
  success boolean,
  ledger_id uuid,
  new_available_credit_cents bigint
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_ref text;
  v_wallet public.patient_wallets;
  v_ledger_id uuid;
begin
  if p_patient_id is null then
    raise exception 'patient_id_required';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  v_ref := coalesce(
    nullif(p_idempotency_key, ''),
    'patient_credit_grant:' || p_patient_id::text || ':' || gen_random_uuid()::text
  );

  select l.id
  into v_ledger_id
  from public.patient_wallet_ledger l
  where l.ref = v_ref
  limit 1;

  if v_ledger_id is not null then
    select w.*
    into v_wallet
    from public.patient_wallets w
    where w.patient_id = p_patient_id;

    success := true;
    ledger_id := v_ledger_id;
    new_available_credit_cents := coalesce(v_wallet.available_credit_cents, 0);
    return next;
    return;
  end if;

  perform public.ensure_patient_wallet(p_patient_id);

  select *
  into v_wallet
  from public.patient_wallets
  where patient_id = p_patient_id
  for update;

  update public.patient_wallets
  set available_credit_cents = available_credit_cents + p_amount_cents
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.patient_wallet_ledger (
    patient_id,
    kind,
    amount_cents,
    balance_after_cents,
    ref,
    appointment_id,
    reason,
    metadata,
    created_by,
    expires_at
  )
  values (
    p_patient_id,
    'credit_grant',
    p_amount_cents,
    v_wallet.available_credit_cents,
    v_ref,
    p_appointment_id,
    p_reason,
    jsonb_build_object('source', 'admin_credit', 'non_withdrawable', true),
    coalesce(p_created_by, auth.uid()),
    p_expires_at
  )
  returning id into v_ledger_id;

  success := true;
  ledger_id := v_ledger_id;
  new_available_credit_cents := v_wallet.available_credit_cents;
  return next;
end;
$$;

create or replace function public.pay_appointment_with_patient_wallet(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_idempotency_key text default null
)
returns table (
  success boolean,
  message text,
  appointment_payment_id uuid,
  ledger_id uuid,
  amount_cents bigint,
  new_available_credit_cents bigint
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_appointment public.appointments;
  v_doctor public.doctors;
  v_wallet public.patient_wallets;
  v_payment public.appointment_payments;
  v_ledger_id uuid;
  v_amount_cents bigint;
  v_ref text;
begin
  if p_appointment_id is null or p_patient_id is null then
    raise exception 'appointment_and_patient_required';
  end if;

  select *
  into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  if v_appointment.patient_id is distinct from p_patient_id then
    raise exception 'appointment_access_denied';
  end if;

  if v_appointment.doctor_id is null then
    raise exception 'appointment_doctor_missing';
  end if;

  select *
  into v_doctor
  from public.doctors
  where id = v_appointment.doctor_id;

  v_amount_cents := round(coalesce(v_doctor.consultation_fee, 0))::bigint;

  if v_amount_cents <= 0 then
    raise exception 'doctor_consultation_fee_missing';
  end if;

  select *
  into v_payment
  from public.appointment_payments
  where appointment_id = p_appointment_id
  for update;

  if v_payment.id is not null and v_payment.status = 'approved' then
    success := true;
    message := 'appointment_already_paid';
    appointment_payment_id := v_payment.id;
    ledger_id := null;
    amount_cents := v_payment.gross_amount;
    new_available_credit_cents := null;
    return next;
    return;
  end if;

  perform public.ensure_patient_wallet(p_patient_id);

  select *
  into v_wallet
  from public.patient_wallets
  where patient_id = p_patient_id
  for update;

  if v_wallet.available_credit_cents < v_amount_cents then
    success := false;
    message := 'insufficient_patient_credit';
    appointment_payment_id := null;
    ledger_id := null;
    amount_cents := v_amount_cents;
    new_available_credit_cents := v_wallet.available_credit_cents;
    return next;
    return;
  end if;

  v_ref := coalesce(
    nullif(p_idempotency_key, ''),
    'patient_wallet_payment:' || p_appointment_id::text
  );

  select l.id
  into v_ledger_id
  from public.patient_wallet_ledger l
  where l.ref = v_ref
  limit 1;

  if v_ledger_id is not null then
    select *
    into v_payment
    from public.appointment_payments
    where appointment_id = p_appointment_id;

    success := true;
    message := 'idempotent_replay';
    appointment_payment_id := v_payment.id;
    ledger_id := v_ledger_id;
    amount_cents := v_amount_cents;
    new_available_credit_cents := v_wallet.available_credit_cents;
    return next;
    return;
  end if;

  update public.patient_wallets
  set available_credit_cents = available_credit_cents - v_amount_cents
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.patient_wallet_ledger (
    patient_id,
    kind,
    amount_cents,
    balance_after_cents,
    ref,
    appointment_id,
    reason,
    metadata
  )
  values (
    p_patient_id,
    'appointment_payment',
    v_amount_cents,
    v_wallet.available_credit_cents,
    v_ref,
    p_appointment_id,
    'Pago de consulta con credito AutaMedica',
    jsonb_build_object('source', 'patient_wallet', 'non_withdrawable', true)
  )
  returning id into v_ledger_id;

  insert into public.appointment_payments (
    appointment_id,
    patient_id,
    doctor_id,
    gross_amount,
    currency,
    status,
    provider,
    provider_payment_id,
    paid_at,
    metadata
  )
  values (
    p_appointment_id,
    p_patient_id,
    v_appointment.doctor_id,
    v_amount_cents,
    'ARS',
    'approved',
    'autamedica_wallet',
    'wallet_' || v_ledger_id::text,
    now(),
    jsonb_build_object(
      'patient_wallet_ledger_id', v_ledger_id,
      'funding_source', 'patient_wallet',
      'care_model', 'episode_safe_closure',
      'ceeds_closure_included', true,
      'patient_billable_ceeds_review', false
    )
  )
  on conflict (appointment_id) do update set
    gross_amount = excluded.gross_amount,
    currency = excluded.currency,
    status = 'approved',
    provider = excluded.provider,
    provider_payment_id = excluded.provider_payment_id,
    paid_at = coalesce(public.appointment_payments.paid_at, now()),
    metadata = public.appointment_payments.metadata || excluded.metadata,
    updated_at = now()
  returning * into v_payment;

  update public.patient_wallet_ledger
  set appointment_payment_id = v_payment.id
  where id = v_ledger_id;

  update public.appointments
  set status = 'confirmed',
      updated_at = now()
  where id = p_appointment_id
    and status <> 'confirmed';

  success := true;
  message := 'paid_with_patient_wallet';
  appointment_payment_id := v_payment.id;
  ledger_id := v_ledger_id;
  amount_cents := v_amount_cents;
  new_available_credit_cents := v_wallet.available_credit_cents;
  return next;
end;
$$;

grant execute on function public.patient_wallet_get_balance(uuid) to authenticated, service_role;
grant execute on function public.grant_patient_wallet_credit(uuid, bigint, text, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.pay_appointment_with_patient_wallet(uuid, uuid, text) to service_role;
