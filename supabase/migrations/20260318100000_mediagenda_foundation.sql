-- MediAgenda Foundation: Motor de Agenda Inteligente
-- Tablas de disponibilidad, waitlist, recordatorios, historial + triggers

-- ============================================================
-- 1. doctor_availability (reemplaza doctors.schedule JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.doctor_availability (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  slot_duration integer NOT NULL DEFAULT 30,
  is_active     boolean NOT NULL DEFAULT true,
  location      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_doctor_day_start UNIQUE (doctor_id, day_of_week, start_time),
  CONSTRAINT ck_end_after_start CHECK (end_time > start_time),
  CONSTRAINT ck_slot_duration_positive CHECK (slot_duration > 0 AND slot_duration <= 120)
);

COMMENT ON TABLE public.doctor_availability IS 'Horarios semanales recurrentes del doctor';
COMMENT ON COLUMN public.doctor_availability.day_of_week IS '0=domingo, 1=lunes, ..., 6=sábado';

-- ============================================================
-- 2. doctor_availability_overrides (excepciones puntuales)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.doctor_availability_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  override_date date NOT NULL,
  is_available  boolean NOT NULL DEFAULT false,
  start_time    time,
  end_time      time,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_doctor_override_date UNIQUE (doctor_id, override_date),
  CONSTRAINT ck_override_times CHECK (
    (is_available = false) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

COMMENT ON TABLE public.doctor_availability_overrides IS 'Excepciones a la disponibilidad semanal: vacaciones, feriados, guardias extra';

-- ============================================================
-- 3. appointment_waitlist
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_waitlist (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id            uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  preferred_date_start date,
  preferred_date_end   date,
  preferred_time_start time,
  preferred_time_end   time,
  appointment_type     text NOT NULL DEFAULT 'consultation',
  priority             smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
  status               text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'booked', 'expired', 'cancelled')),
  offered_at           timestamptz,
  expires_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_waitlist IS 'Lista de espera para turnos con médicos';
COMMENT ON COLUMN public.appointment_waitlist.priority IS '0=normal, 1=preferente, 2=urgente';

-- ============================================================
-- 4. appointment_reminders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms', 'push')),
  scheduled_for   timestamptz NOT NULL,
  sent_at         timestamptz,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  response        text CHECK (response IS NULL OR response IN ('confirmed', 'cancelled', 'rescheduled')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_reminders IS 'Recordatorios programados de citas';

-- ============================================================
-- 5. appointment_history (log de cambios para predicción)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL,
  doctor_id       uuid NOT NULL,
  action          text NOT NULL CHECK (action IN (
    'created', 'confirmed', 'cancelled', 'no_show', 'completed', 'rescheduled', 'updated'
  )),
  old_status      text,
  new_status      text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_history IS 'Log inmutable de cambios en citas para analytics y predicción de no-show';

-- ============================================================
-- 6. Trigger: verificar conflictos de cita
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_appointment_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo verificar citas activas (no canceladas ni no-show)
  IF NEW.status IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

  -- Verificar que end_time existe
  IF NEW.end_time IS NULL THEN
    NEW.end_time := NEW.start_time + (COALESCE(NEW.duration_minutes, 30) || ' minutes')::interval;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE doctor_id = NEW.doctor_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('cancelled', 'no_show')
      AND start_time < NEW.end_time
      AND COALESCE(end_time, start_time + (COALESCE(duration_minutes, 30) || ' minutes')::interval) > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'SCHEDULING_CONFLICT: El doctor ya tiene una cita en ese horario (% - %)',
      NEW.start_time, NEW.end_time;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_conflict ON public.appointments;
CREATE TRIGGER trg_appointment_conflict
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_appointment_conflict();

-- ============================================================
-- 7. Trigger: log automático en appointment_history
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := NEW.status;
  ELSIF OLD.start_time IS DISTINCT FROM NEW.start_time THEN
    v_action := 'rescheduled';
  ELSE
    v_action := 'updated';
  END IF;

  INSERT INTO public.appointment_history (
    appointment_id, patient_id, doctor_id, action, old_status, new_status, metadata
  ) VALUES (
    NEW.id,
    NEW.patient_id,
    NEW.doctor_id,
    v_action,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    jsonb_build_object(
      'trigger_op', TG_OP,
      'old_start_time', CASE WHEN TG_OP = 'UPDATE' THEN OLD.start_time::text ELSE NULL END,
      'new_start_time', NEW.start_time::text
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_history ON public.appointments;
CREATE TRIGGER trg_appointment_history
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_appointment_change();

-- ============================================================
-- 8. Trigger: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_availability_updated_at
  BEFORE UPDATE ON public.doctor_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_waitlist_updated_at
  BEFORE UPDATE ON public.appointment_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 9. RLS Policies
-- ============================================================
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_history ENABLE ROW LEVEL SECURITY;

-- doctor_availability: doctors can CRUD their own, everyone can read active
CREATE POLICY "availability_select_all" ON public.doctor_availability
  FOR SELECT USING (true);

CREATE POLICY "availability_insert_own" ON public.doctor_availability
  FOR INSERT WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "availability_update_own" ON public.doctor_availability
  FOR UPDATE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "availability_delete_own" ON public.doctor_availability
  FOR DELETE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

-- doctor_availability_overrides: same pattern
CREATE POLICY "overrides_select_all" ON public.doctor_availability_overrides
  FOR SELECT USING (true);

CREATE POLICY "overrides_insert_own" ON public.doctor_availability_overrides
  FOR INSERT WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "overrides_update_own" ON public.doctor_availability_overrides
  FOR UPDATE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "overrides_delete_own" ON public.doctor_availability_overrides
  FOR DELETE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

-- appointment_waitlist: patients can manage their own, doctors can read their waitlist
CREATE POLICY "waitlist_select_own" ON public.appointment_waitlist
  FOR SELECT USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
    OR doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "waitlist_insert_patient" ON public.appointment_waitlist
  FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  );

CREATE POLICY "waitlist_update_own" ON public.appointment_waitlist
  FOR UPDATE USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
    OR doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

-- appointment_reminders: participants can read their reminders
CREATE POLICY "reminders_select_participants" ON public.appointment_reminders
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM public.appointments
      WHERE patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
         OR doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

-- appointment_history: participants can read history
CREATE POLICY "history_select_participants" ON public.appointment_history
  FOR SELECT USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
    OR doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

-- ============================================================
-- 10. Indices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_availability_doctor_day
  ON public.doctor_availability (doctor_id, day_of_week)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_overrides_doctor_date
  ON public.doctor_availability_overrides (doctor_id, override_date);

CREATE INDEX IF NOT EXISTS idx_waitlist_doctor_waiting
  ON public.appointment_waitlist (doctor_id, priority DESC, created_at ASC)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_reminders_pending_schedule
  ON public.appointment_reminders (scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_history_patient_date
  ON public.appointment_history (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_doctor_date
  ON public.appointment_history (doctor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_appointment
  ON public.appointment_history (appointment_id);
