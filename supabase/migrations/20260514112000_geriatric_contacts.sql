create table if not exists public.geriatric_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  zone text default 'CABA',
  rating text,
  has_whatsapp boolean default false,
  status text default 'pending',
  sent_at timestamptz,
  replied_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  unique (name, phone)
);

alter table public.geriatric_contacts enable row level security;

create policy "geriatric_contacts_service_role_all"
  on public.geriatric_contacts
  for all
  to service_role
  using (true)
  with check (true);

grant all on public.geriatric_contacts to service_role;
