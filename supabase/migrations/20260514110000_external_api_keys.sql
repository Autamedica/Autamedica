-- External API keys for server-to-server integrations.
-- Keys are stored only as SHA-256 hashes; the raw key is shown once on creation.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  belongs_to text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists api_keys_key_hash_key
  on public.api_keys (key_hash);

create unique index if not exists api_keys_key_prefix_key
  on public.api_keys (key_prefix);

create index if not exists api_keys_active_lookup_idx
  on public.api_keys (key_hash)
  where revoked_at is null;

create index if not exists api_keys_created_at_idx
  on public.api_keys (created_at desc);

create index if not exists api_keys_scopes_gin_idx
  on public.api_keys using gin (scopes);

alter table public.api_keys enable row level security;

create policy "api_keys_admin_select"
  on public.api_keys
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'platform_admin', 'organization_admin')
    )
  );

create policy "api_keys_admin_insert"
  on public.api_keys
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'platform_admin', 'organization_admin')
    )
  );

create policy "api_keys_admin_update"
  on public.api_keys
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'platform_admin', 'organization_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'platform_admin', 'organization_admin')
    )
  );

grant select, insert, update on public.api_keys to authenticated;
grant all on public.api_keys to service_role;
