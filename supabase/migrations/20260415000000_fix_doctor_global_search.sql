-- 🚀 ACTIVAR BÚSQUEDA GLOBAL PARA DOCTORES
-- Habilita que el médico encuentre a los 850+ pacientes para resolver inconsistencias.

DROP POLICY IF EXISTS "Doctors global patient search" ON public.profiles;

CREATE POLICY "Doctors global patient search"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'doctor')
    OR (auth.uid() = user_id)
  );

COMMENT ON POLICY "Doctors global patient search" ON public.profiles
IS 'Habilita la búsqueda global para médicos con el fin de resolver inconsistencias de datos de salud.';
