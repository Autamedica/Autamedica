-- Operational switch writes are available only to a verified admin profile
-- or a trusted server-issued app_metadata role.
drop policy if exists platform_operational_switches_admin_all on public.platform_operational_switches;
drop policy if exists platform_operational_switches_authenticated_read on public.platform_operational_switches;
create policy platform_operational_switches_admin_all on public.platform_operational_switches
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.active is true
      and p.role = 'admin'
  )
  or (
    coalesce(auth.jwt()->'app_metadata'->>'role','') = 'admin'
    and not exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.active is false
    )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.active is true
      and p.role = 'admin'
  )
  or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'admin'
);
