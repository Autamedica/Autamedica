-- Keep Memed's private prescriber identity in sync with the CFM-backed directory.
alter table public.memed_doctor_identities
  add column if not exists crm text,
  add column if not exists uf text;

-- Normalize only the already-verified Brazilian CRM value. Keep leading zeroes:
-- they are significant in the CFM registry and must not be guessed away.
update public.doctors d
set license_number = regexp_replace(d.license_number, '[^0-9]', '', 'g'),
    uf_brazil = upper(d.uf_brazil),
    updated_at = now()
where d.id = '080fb7ae-92b4-44d4-8941-a6db65004b9f'
  and d.license_type = 'CRM'
  and d.care_country = 'BR'
  and regexp_replace(d.license_number, '[^0-9]', '', 'g') = '006402'
  and upper(d.uf_brazil) = 'RS';

update public.doctor_licenses l
set license_number = regexp_replace(l.license_number, '[^0-9]', '', 'g'),
    uf_brazil = upper(l.uf_brazil),
    updated_at = now()
where l.doctor_id = '080fb7ae-92b4-44d4-8941-a6db65004b9f'
  and l.license_type = 'CRM'
  and l.status = 'active'
  and l.cfm_validation_status = 'valid'
  and regexp_replace(l.license_number, '[^0-9]', '', 'g') = '006402'
  and upper(l.uf_brazil) = 'RS';
