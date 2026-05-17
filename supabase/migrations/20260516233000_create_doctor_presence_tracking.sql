-- 🩺 SISTEMA DE MONITOREO DE PRESENCIA MÉDICA (HEARTBEAT)
-- Permite rastrear el tiempo exacto que cada médico pasa con el Dashboard abierto.

CREATE TABLE IF NOT EXISTS public.doctor_heartbeats (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    doctor_id uuid REFERENCES public.doctors(id) ON DELETE CASCADE NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb, -- Para capturar IP o Device si es necesario
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices para optimizar consultas de reportes
CREATE INDEX IF NOT EXISTS idx_doctor_heartbeats_doctor_date ON public.doctor_heartbeats (doctor_id, created_at DESC);

-- Seguridad RLS
ALTER TABLE public.doctor_heartbeats ENABLE ROW LEVEL SECURITY;

-- Los médicos solo pueden insertar sus propios latidos
CREATE POLICY "Doctors can insert own heartbeats"
ON public.doctor_heartbeats FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = doctor_id
        AND d.user_id = auth.uid()
    )
);

-- Solo administradores pueden ver los registros de latidos
CREATE POLICY "Only admins can view heartbeats"
ON public.doctor_heartbeats FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' = 'admin');

-- Función auxiliar para calcular uptime (en minutos)
-- Aproximación basada en intervalos de 5 minutos
CREATE OR REPLACE FUNCTION public.get_doctor_online_minutes(
    p_doctor_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz
) RETURNS integer AS $$
DECLARE
    heartbeat_count integer;
BEGIN
    SELECT count(*)::integer INTO heartbeat_count
    FROM public.doctor_heartbeats
    WHERE doctor_id = p_doctor_id
      AND created_at BETWEEN p_start_date AND p_end_date;
      
    -- Asumimos latidos cada 5 minutos
    RETURN heartbeat_count * 5;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON TABLE public.doctor_heartbeats IS 'Registro de "latidos" enviados por el dashboard del médico para medir uptime.';
