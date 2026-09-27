-- CADSUS profile cache for the 6 mandatory fields per Piloto UBS Armour
-- + the DATASUS/RNDS registry that resolved it (source: cadsus|manual|sead).
-- Only pre-authorised authed users with pii scope may read (CADSUS is PII-heavy).
-- RLS true: back office service can write on signup/pii scope; patients can see on their own profile.
create table if not exists public.patients_cadsus_profile (
  patient_id uuid primary key references public.profiles (user_id) on delete cascade,
  cns text,
  cpf text,
  nome text,
  nome_mae text,
  sexo text check (sexo in ('M', 'F')),
  nascimento date,
  municipio_nascimento text,
  -- provenance
  rnds_source text not null default 'cadsus' check (rnds_source in ('cadsus', 'manual', 'sead')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patients_cadsus_profile_cns_idx
  on public.patients_cadsus_profile (cns);
create index if not exists patients_cadsus_profile_cpf_idx
  on public.patients_cadsus_profile (cpf);

alter table public.patients_cadsus_profile enable row level security;

drop policy if exists "patients_read_own_cadsus" on public.patients_cadsus_profile;
create policy "patients_read_own_cadsus"
  on public.patients_cadsus_profile
  for select
  using (auth.uid() = patient_id);

drop policy if exists "service_role_write_cadsus_profile" on public.patients_cadsus_profile;
create policy "service_role_write_cadsus_profile"
  on public.patients_cadsus_profile
  to service_role
  for all
  using (true)
  with check (true);