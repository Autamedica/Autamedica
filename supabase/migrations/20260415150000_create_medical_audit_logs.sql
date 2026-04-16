-- 🛡️ SISTEMA DE AUDITORÍA MÉDICA: BLINDAJE LEGAL (AUTAMEDICA)
-- Registra cada acceso proactivo a datos de pacientes para cumplimiento LOPDP/GDPR.

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    performed_by uuid REFERENCES auth.users(id) NOT NULL, -- El Doctor
    patient_id uuid REFERENCES public.patients(id),      -- El Paciente (opcional si es búsqueda general)
    action text NOT NULL,                                -- 'search', 'call_initiated', 'profile_view'
    context jsonb DEFAULT '{}'::jsonb,                  -- Metadatos (ej: query de búsqueda, IP, motivo)
    created_at timestamp with time zone DEFAULT now()
);

-- Seguridad: Nadie puede modificar ni borrar logs (Inmutable)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view logs" 
ON public.audit_logs FOR SELECT 
TO authenticated 
USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Anyone authenticated can insert logs" 
ON public.audit_logs FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Comentario para auditores legales
COMMENT ON TABLE public.audit_logs IS 'Registro inmutable de accesos a datos sensibles para cumplimiento normativo de salud.';
