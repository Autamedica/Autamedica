-- 20260423000000_lower_free_credits.sql
-- Reduce initial free credits from 30 to 5 to encourage conversion to Pro/Premium plans.

-- 1. Update the default value for new doctors
alter table public.doctors
  alter column free_videoconsultas_remaining set default 5;

-- 2. Cap existing doctors to a maximum of 5 free credits if they are currently on the free tier
-- We consider they are on the free tier if they don't have an 'active' subscription in doctor_subscriptions.
update public.doctors d
set free_videoconsultas_remaining = least(free_videoconsultas_remaining, 5)
where not exists (
  select 1 
  from public.doctor_subscriptions s 
  where s.doctor_id = d.id 
    and s.status = 'active'
);

comment on column public.doctors.free_videoconsultas_remaining 
  is 'Free videoconsulta credits. Reduced to 5 to encourage monetization.';
