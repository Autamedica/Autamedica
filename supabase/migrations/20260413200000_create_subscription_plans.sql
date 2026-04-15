-- Monetization tables: subscription plans, doctor subscriptions, payment transactions
-- Model: "Shopify for Doctors" SaaS — 3 tiers, monthly billing via MercadoPago

-- ── Subscription Plans ──

create table if not exists public.subscription_plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  price_cents   integer not null,
  currency      text not null default 'ARS',
  interval      text not null default 'monthly' check (interval in ('monthly', 'yearly')),
  features      jsonb not null default '[]'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.subscription_plans is 'Planes de suscripción disponibles para médicos';

-- ── Doctor Subscriptions ──

create type public.subscription_status as enum (
  'active',
  'cancelled',
  'past_due',
  'trialing'
);

create table if not exists public.doctor_subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  doctor_id                   uuid not null references public.doctors(id) on delete cascade,
  plan_id                     uuid not null references public.subscription_plans(id),
  status                      public.subscription_status not null default 'trialing',
  mercadopago_subscription_id text,
  mercadopago_payer_id        text,
  current_period_start        timestamptz,
  current_period_end          timestamptz,
  cancelled_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_doctor_subscriptions_doctor on public.doctor_subscriptions(doctor_id);
create index idx_doctor_subscriptions_status on public.doctor_subscriptions(status);

comment on table public.doctor_subscriptions is 'Suscripciones activas/históricas por médico';

-- ── Payment Transactions ──

create type public.payment_status as enum (
  'pending',
  'approved',
  'rejected',
  'refunded'
);

create table if not exists public.payment_transactions (
  id                      uuid primary key default gen_random_uuid(),
  doctor_id               uuid not null references public.doctors(id) on delete cascade,
  subscription_id         uuid references public.doctor_subscriptions(id) on delete set null,
  amount_cents            integer not null,
  currency                text not null default 'ARS',
  status                  public.payment_status not null default 'pending',
  mercadopago_payment_id  text,
  payment_method          text,
  metadata                jsonb default '{}'::jsonb,
  created_at              timestamptz not null default now()
);

create index idx_payment_transactions_doctor on public.payment_transactions(doctor_id);
create index idx_payment_transactions_subscription on public.payment_transactions(subscription_id);
create index idx_payment_transactions_mp_id on public.payment_transactions(mercadopago_payment_id);

comment on table public.payment_transactions is 'Transacciones de pago registradas desde MercadoPago';

-- ── RLS Policies ──

alter table public.subscription_plans enable row level security;
alter table public.doctor_subscriptions enable row level security;
alter table public.payment_transactions enable row level security;

-- Plans: públicos para lectura (pricing page)
create policy "plans_read_all"
  on public.subscription_plans for select
  using (true);

-- Subscriptions: doctor solo lee las propias
create policy "subscriptions_doctor_read_own"
  on public.doctor_subscriptions for select
  using (
    doctor_id in (
      select id from public.doctors where user_id = auth.uid()
    )
  );

-- Subscriptions: service role full access (insert/update via backend)
create policy "subscriptions_service_all"
  on public.doctor_subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Transactions: doctor solo lee las propias
create policy "transactions_doctor_read_own"
  on public.payment_transactions for select
  using (
    doctor_id in (
      select id from public.doctors where user_id = auth.uid()
    )
  );

-- Transactions: service role full access
create policy "transactions_service_all"
  on public.payment_transactions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── Seed: Los 3 planes iniciales ──

insert into public.subscription_plans (name, slug, price_cents, currency, interval, features) values
(
  'Plan Básico',
  'basico',
  4000000,
  'ARS',
  'monthly',
  '["Agenda inteligente (Presencial + Online)", "Recordatorios automáticos", "Perfil profesional público", "Telemedicina (30 créditos de inicio)"]'::jsonb
),
(
  'Plan Pro',
  'pro',
  7000000,
  'ARS',
  'monthly',
  '["Todo en Básico", "Receta electrónica", "Videoconsulta HD Ilimitada", "Pacientes ilimitados", "Historial clínico digital"]'::jsonb
),
(
  'Plan Premium',
  'premium',
  10000000,
  'ARS',
  'monthly',
  '["Todo en Pro", "IA anamnesis automática", "Contabilidad fiscal integrada", "Soporte prioritario", "Analytics avanzados"]'::jsonb
)
on conflict (slug) do nothing;
