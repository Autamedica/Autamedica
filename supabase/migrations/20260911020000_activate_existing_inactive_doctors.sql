-- Activates existing doctors that were left inactive from testing/setup.
-- Only flips active=false -> true for these known user accounts; no new rows created.
-- Idempotent: re-running is a no-op once applied.

UPDATE public.doctors
SET active = true
WHERE active = false
  AND user_id IN (
    '9a78cfb6-52cc-4edb-b935-864151f3b23d',
    'e7c2a861-9e7e-43c7-956d-41decd7792c2',
    '00a76034-eed7-4af3-85fd-e374a71afd89',
    'a647f95f-c6d4-4764-a50f-cd57a49453c9',
    'cb0730cc-228c-4402-9c83-54a8ef15707b'
  );