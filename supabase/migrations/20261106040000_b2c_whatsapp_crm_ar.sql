-- B2C WhatsApp CRM: no marketing send operations, no clinical message content.
-- All PII is accessible only to the trusted server (service_role); never to anon/authenticated.
create table if not exists public.b2c_whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (length(source_key) between 3 and 160),
  country_code text not null default 'AR' check (country_code = 'AR'),
  display_name text not null check (length(display_name) between 1 and 180),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+54[0-9]{10,11}$'),
  phone_status text not null default 'needs_review'
    check (phone_status in ('needs_review','valid_format','invalid','crossed_out','missing')),
  consent_status text not null default 'pending'
    check (consent_status in ('pending','verified','withdrawn')),
  consent_evidence text check (consent_evidence is null or length(consent_evidence) <= 250),
  consent_verified_at timestamptz,
  contact_status text not null default 'pending'
    check (contact_status in ('pending','contacted','replied','interested','not_interested','no_response','do_not_contact')),
  exclusion_reason text check (exclusion_reason is null or length(exclusion_reason) <= 250),
  patient_id uuid references public.patients(id) on delete set null,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint b2c_consent_proof_required check (
    consent_status <> 'verified' or (consent_evidence is not null and consent_verified_at is not null)
  ),
  constraint b2c_withdrawn_blocked check (
    consent_status <> 'withdrawn' or contact_status = 'do_not_contact'
  ),
  constraint b2c_excluded_blocked check (
    contact_status <> 'do_not_contact' or exclusion_reason is not null
  )
);
create index if not exists idx_b2c_wa_status on public.b2c_whatsapp_contacts
  (country_code, consent_status, contact_status);
create index if not exists idx_b2c_wa_phone on public.b2c_whatsapp_contacts(phone_e164)
  where phone_e164 is not null;
create index if not exists idx_b2c_wa_patient on public.b2c_whatsapp_contacts(patient_id)
  where patient_id is not null;

create table if not exists public.b2c_whatsapp_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.b2c_whatsapp_contacts(id) on delete cascade,
  event_type text not null check (event_type in
    ('manual_sent','manual_replied','manual_interested','manual_not_interested',
     'manual_no_response','manual_opt_out','consent_verified','inbound_message',
     'inbound_opt_out','app_echo','delivered','read','patient_linked')),
  origin text not null check (origin in ('admin','meta_webhook','import')),
  provider_message_id text check (provider_message_id is null or length(provider_message_id) <= 255),
  recorded_by uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists uq_b2c_wa_provider_event
  on public.b2c_whatsapp_events (provider_message_id,event_type)
  where provider_message_id is not null;
create index if not exists idx_b2c_wa_events_contact
  on public.b2c_whatsapp_events(contact_id,occurred_at desc);

comment on table public.b2c_whatsapp_contacts is
  'Non-clinical B2C Argentina CRM. No DNI/CUIL, diagnoses, payer names, or message text. Unverified permission never authorizes outreach.';
comment on table public.b2c_whatsapp_events is
  'WhatsApp CRM event metadata only; never store the message body.';

alter table public.b2c_whatsapp_contacts enable row level security;
alter table public.b2c_whatsapp_events enable row level security;
revoke all on public.b2c_whatsapp_contacts from public, anon, authenticated;
revoke all on public.b2c_whatsapp_events from public, anon, authenticated;
grant select, insert, update on public.b2c_whatsapp_contacts to service_role;
grant select, insert on public.b2c_whatsapp_events to service_role;
