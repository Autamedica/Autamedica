-- 1. Sincronizar Emails y Teléfonos a Profiles para búsqueda rápida
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone text;

-- 2. Permitir búsqueda global por Doctor para resolver inconsistencias (LEGAL)
DROP POLICY IF EXISTS "Doctors global patient search" ON public.profiles;

CREATE POLICY "Doctors global patient search" 
ON public.profiles FOR SELECT 
TO authenticated
USING (
  (auth.jwt() ->> 'role' = 'doctor') -- Si es doctor, tiene permiso de búsqueda
  OR (auth.uid() = user_id)          -- El paciente siempre ve su propio perfil
);

-- 3. Crear el índice de búsqueda para rendimiento
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm ON public.profiles USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles (phone);

-- 4. Audit Log
COMMENT ON POLICY "Doctors global patient search" ON public.profiles IS 'Habilita búsqueda global para médicos para resolución de inconsistencias de datos de salud.';