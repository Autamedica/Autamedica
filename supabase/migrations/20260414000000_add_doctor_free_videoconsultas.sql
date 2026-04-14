-- Add free videoconsulta credits to doctors (30 per doctor, feature gating hook)
-- Doctors without a Pro/Premium subscription consume these credits on each completed call.

alter table public.doctors
  add column if not exists free_videoconsultas_remaining integer not null default 30;

comment on column public.doctors.free_videoconsultas_remaining
  is 'Free videoconsulta credits. Decremented on completed calls when doctor has no Pro/Premium plan.';

-- Backfill existing doctors: 30 minus completed calls
update public.doctors d
set free_videoconsultas_remaining = greatest(0, 30 - (
  select count(*)
  from public.calls c
  where c.doctor_id = d.id
    and c.status = 'ended'
));
