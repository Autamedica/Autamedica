-- Migration: 20260922210000_dispatch_patient_materialization.sql
-- Description: Materializa el paciente on-demand en public.patients y enlaza el dispatch (AR dni / BR cpf)
-- Resolves:
--   - El flujo pharmacy_dispatch_requests nunca creó fila en patients: SOAP rompía RLS
--     (medical_records_insert_doctor requiere EXISTS patients.id) y recetas/certificados
--     rompían FK (prescriptions.patient_id, medical_certificates.patient_id).
--   - cloudflare-calls/index.ts mapeaba patient_id = dispatch.requested_by_user_id (uid de
--     auth, inservible como patients.id la mayoria de las veces).
--   - Coexistencia AR/BR: patient_dni (Argentina, UNIQUE en patients) y patient_cpf
--     (Brasil, migracion brazil_digital_prescriptions). Ambos opcionales; se relaja la
--     NOT NULL de patient_dni para permitir flujos BR puros.

-- 1. Schema del dispatch: enlace a patients + cpf de Brasil + dni relajado
ALTER TABLE public.pharmacy_dispatch_requests
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS patient_cpf TEXT;

ALTER TABLE public.pharmacy_dispatch_requests
    ALTER COLUMN patient_dni DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_requests_patient
    ON public.pharmacy_dispatch_requests (patient_id)
    WHERE patient_id IS NOT NULL;

-- 2. Funcion de materializacion idempotente (SECURITY DEFINER: elude RLS al crear patients)
--    Prioridad de identidad: user_id -> dni (AR) -> cpf (BR). Devuelve patients.id o NULL.
CREATE OR REPLACE FUNCTION public.ensure_dispatch_patient(
    p_user_id uuid,
    p_dni text,
    p_cpf text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_patient_id uuid;
BEGIN
    -- 1) Identidad primaria: user_id (paciente autenticado)
    IF p_user_id IS NOT NULL THEN
        SELECT id INTO v_patient_id
        FROM public.patients
        WHERE user_id = p_user_id
        LIMIT 1;

        IF v_patient_id IS NULL THEN
            INSERT INTO public.patients (user_id, dni, cpf, active)
            VALUES (p_user_id, p_dni, p_cpf, true)
            ON CONFLICT (user_id) DO UPDATE
            SET dni = COALESCE(EXCLUDED.dni, public.patients.dni),
                cpf = COALESCE(EXCLUDED.cpf, public.patients.cpf),
                active = true,
                updated_at = now()
            RETURNING id INTO v_patient_id;
        ELSE
            UPDATE public.patients
            SET dni = COALESCE(p_dni, dni),
                cpf = COALESCE(p_cpf, cpf),
                active = true,
                updated_at = now()
            WHERE id = v_patient_id;
        END IF;

        RETURN v_patient_id;
    END IF;

    -- 2) Identidad secundaria: DNI (Argentina, UNIQUE patients_dni_key)
    IF p_dni IS NOT NULL THEN
        SELECT id INTO v_patient_id
        FROM public.patients
        WHERE dni = p_dni AND active = true
        LIMIT 1;

        IF v_patient_id IS NOT NULL THEN
            RETURN v_patient_id;
        END IF;

        INSERT INTO public.patients (dni, cpf, active)
        VALUES (p_dni, p_cpf, true)
        ON CONFLICT (dni) DO UPDATE
        SET cpf = COALESCE(EXCLUDED.cpf, public.patients.cpf),
            active = true,
            updated_at = now()
        RETURNING id INTO v_patient_id;

        RETURN v_patient_id;
    END IF;

    -- 3) Identidad terciaria: CPF (Brasil, indice no unico -> primer match activo)
    IF p_cpf IS NOT NULL THEN
        SELECT id INTO v_patient_id
        FROM public.patients
        WHERE cpf = p_cpf AND active = true
        LIMIT 1;

        IF v_patient_id IS NOT NULL THEN
            RETURN v_patient_id;
        END IF;

        INSERT INTO public.patients (cpf, active)
        VALUES (p_cpf, true)
        RETURNING id INTO v_patient_id;

        RETURN v_patient_id;
    END IF;

    -- 4) Sin identidad (kiosco 100% anonimo, limite no bloqueante): no se materializa
    RETURN NULL;
END;
$function$;

-- 3. Trigger BEFORE INSERT: asigna patient_id al insertar el dispatch
CREATE OR REPLACE FUNCTION public.assign_dispatch_patient_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    NEW.patient_id := public.ensure_dispatch_patient(
        NEW.requested_by_user_id,
        NEW.patient_dni,
        NEW.patient_cpf
    );
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_dispatch_assign_patient_id ON public.pharmacy_dispatch_requests;
CREATE TRIGGER tr_dispatch_assign_patient_id
    BEFORE INSERT ON public.pharmacy_dispatch_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.assign_dispatch_patient_id();