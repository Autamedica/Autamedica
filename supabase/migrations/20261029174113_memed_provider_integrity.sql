-- Memed callbacks are verified server-side; browser clients must not forge them.
CREATE TABLE IF NOT EXISTS public.memed_doctor_identities (
  doctor_id uuid PRIMARY KEY REFERENCES public.doctors(id),
  cpf text NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
  verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.memed_doctor_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memed_doctor_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.memed_doctor_identities TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS prescriptions_memed_vendor_id_unique
  ON public.prescriptions (vendor_id)
  WHERE vendor_name = 'memed';

DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='prescriptions' AND policyname='memed_server_insert_only') THEN
    CREATE POLICY memed_server_insert_only ON public.prescriptions AS RESTRICTIVE
      FOR INSERT TO authenticated WITH CHECK (vendor_name IS DISTINCT FROM 'memed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='prescriptions' AND policyname='memed_server_update_only') THEN
    CREATE POLICY memed_server_update_only ON public.prescriptions AS RESTRICTIVE
      FOR UPDATE TO authenticated USING (vendor_name IS DISTINCT FROM 'memed')
      WITH CHECK (vendor_name IS DISTINCT FROM 'memed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='prescriptions' AND policyname='memed_server_delete_only') THEN
    CREATE POLICY memed_server_delete_only ON public.prescriptions AS RESTRICTIVE
      FOR DELETE TO authenticated USING (vendor_name IS DISTINCT FROM 'memed');
  END IF;
END
$policy$;
