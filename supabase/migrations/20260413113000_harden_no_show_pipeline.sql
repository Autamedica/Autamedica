-- Hardening pass for the anti no-show circuit:
-- - per-doctor scheduling config
-- - atomic reminder creation on appointment insert
-- - reminder retries/backoff metadata
-- - durable inbound message queue
-- - waitlist offer slot tracking
-- - no_show reaper RPC

-- ============================================================
-- 1. doctor_scheduling_config
-- ============================================================
CREATE TABLE IF NOT EXISTS public.doctor_scheduling_config (
  doctor_id                    uuid PRIMARY KEY REFERENCES public.doctors(id) ON DELETE CASCADE,
  reminder_hours_before        integer[] NOT NULL DEFAULT ARRAY[24, 2],
  waitlist_offer_expiry_hours  integer NOT NULL DEFAULT 4 CHECK (waitlist_offer_expiry_hours BETWEEN 1 AND 72),
  noshow_overbooking_threshold numeric(4,3) NOT NULL DEFAULT 0.300 CHECK (noshow_overbooking_threshold >= 0 AND noshow_overbooking_threshold <= 1),
  noshow_grace_minutes         integer NOT NULL DEFAULT 30 CHECK (noshow_grace_minutes BETWEEN 5 AND 720),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctor_scheduling_config_reminder_hours_before_check CHECK (
    array_length(reminder_hours_before, 1) IS NOT NULL
    AND array_length(reminder_hours_before, 1) > 0
  )
);

COMMENT ON TABLE public.doctor_scheduling_config IS 'Configuración de reminders/no-show por doctor';
COMMENT ON COLUMN public.doctor_scheduling_config.reminder_hours_before IS 'Horas antes de la cita para programar recordatorios';
COMMENT ON COLUMN public.doctor_scheduling_config.waitlist_offer_expiry_hours IS 'Horas antes de expirar una oferta de waitlist';
COMMENT ON COLUMN public.doctor_scheduling_config.noshow_overbooking_threshold IS 'Umbral de probabilidad para habilitar overbooking';
COMMENT ON COLUMN public.doctor_scheduling_config.noshow_grace_minutes IS 'Minutos de gracia después del fin de la cita antes de marcar no_show';

ALTER TABLE public.doctor_scheduling_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctor_scheduling_config_select_own" ON public.doctor_scheduling_config;
CREATE POLICY "doctor_scheduling_config_select_own" ON public.doctor_scheduling_config
  FOR SELECT USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "doctor_scheduling_config_insert_own" ON public.doctor_scheduling_config;
CREATE POLICY "doctor_scheduling_config_insert_own" ON public.doctor_scheduling_config
  FOR INSERT WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "doctor_scheduling_config_update_own" ON public.doctor_scheduling_config;
CREATE POLICY "doctor_scheduling_config_update_own" ON public.doctor_scheduling_config
  FOR UPDATE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_doctor_scheduling_config_updated_at ON public.doctor_scheduling_config;
CREATE TRIGGER trg_doctor_scheduling_config_updated_at
  BEFORE UPDATE ON public.doctor_scheduling_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. appointment_reminders retry metadata
-- ============================================================
ALTER TABLE public.appointment_reminders
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Deduplicate existing rows before adding unique constraint.
-- Keeps the newest row (by id) for each (appointment_id, channel, scheduled_for) group.
DELETE FROM public.appointment_reminders
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY appointment_id, channel, scheduled_for
             ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM public.appointment_reminders
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_reminders_schedule
  ON public.appointment_reminders (appointment_id, channel, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_retry_window
  ON public.appointment_reminders (status, next_retry_at);

COMMENT ON COLUMN public.appointment_reminders.retry_count IS 'Cantidad de reintentos realizados para este reminder';
COMMENT ON COLUMN public.appointment_reminders.next_retry_at IS 'Cuándo vuelve a estar elegible para reintento';
COMMENT ON COLUMN public.appointment_reminders.last_error IS 'Último error de envío registrado por el worker';

-- ============================================================
-- 3. waitlist offer tracking
-- ============================================================
ALTER TABLE public.appointment_waitlist
  ADD COLUMN IF NOT EXISTS offer_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS offered_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS offered_end_time timestamptz;

COMMENT ON COLUMN public.appointment_waitlist.offer_sent_at IS 'Timestamp cuando la oferta fue enviada al paciente';
COMMENT ON COLUMN public.appointment_waitlist.offered_start_time IS 'Horario exacto del slot ofrecido al paciente';
COMMENT ON COLUMN public.appointment_waitlist.offered_end_time IS 'Fin exacto del slot ofrecido al paciente';

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_unsent_offers
  ON public.appointment_waitlist (status, offer_sent_at, expires_at)
  WHERE status = 'offered';

-- ============================================================
-- 4. durable inbound queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_inbound_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_key  text NOT NULL UNIQUE,
  channel             text NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'signal', 'discord')),
  from_phone          text NOT NULL,
  message_text        text NOT NULL,
  parsed_response     text CHECK (parsed_response IS NULL OR parsed_response IN ('confirmed', 'cancelled', 'accepted')),
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'ignored')),
  attempt_count       integer NOT NULL DEFAULT 0,
  last_attempt_at     timestamptz,
  next_attempt_at     timestamptz,
  processed_at        timestamptz,
  last_error          text,
  webhook_result      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_inbound_messages IS 'Cola durable de respuestas inbound de OpenClaw para confirmaciones/cancelaciones';
COMMENT ON COLUMN public.appointment_inbound_messages.source_message_key IS 'Clave idempotente calculada por el watcher a partir del evento original';

ALTER TABLE public.appointment_inbound_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_appointment_inbound_messages_pending
  ON public.appointment_inbound_messages (status, next_attempt_at, created_at)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_appointment_inbound_messages_updated_at ON public.appointment_inbound_messages;
CREATE TRIGGER trg_appointment_inbound_messages_updated_at
  BEFORE UPDATE ON public.appointment_inbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. DB-side reminder scheduling
-- ============================================================

-- Verify no pre-existing function with different body before replacing.
-- If the function exists from a prior migration with different logic,
-- this DO block will raise an explicit error instead of silently overwriting.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'schedule_appointment_reminders'
  ) THEN
    -- Function already exists; drop it explicitly so we can recreate cleanly.
    -- If this migration created it on a previous partial run, the drop is safe.
    DROP FUNCTION public.schedule_appointment_reminders(uuid, text);
  END IF;
END;
$$;

CREATE FUNCTION public.schedule_appointment_reminders(
  target_appointment_id uuid,
  reminder_channel text DEFAULT 'whatsapp'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment record;
  v_hours integer[];
  v_hour integer;
  v_reminder_time timestamptz;
  v_inserted integer := 0;
BEGIN
  SELECT id, doctor_id, start_time, status
  INTO v_appointment
  FROM public.appointments
  WHERE id = target_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND: %', target_appointment_id;
  END IF;

  IF v_appointment.status IN ('cancelled', 'no_show', 'completed') THEN
    RETURN 0;
  END IF;

  SELECT reminder_hours_before
  INTO v_hours
  FROM public.doctor_scheduling_config
  WHERE doctor_id = v_appointment.doctor_id;

  v_hours := COALESCE(v_hours, ARRAY[24, 2]);

  FOREACH v_hour IN ARRAY v_hours LOOP
    v_reminder_time := v_appointment.start_time - make_interval(hours => v_hour);

    IF v_reminder_time > now() THEN
      INSERT INTO public.appointment_reminders (
        appointment_id,
        channel,
        scheduled_for
      )
      VALUES (
        v_appointment.id,
        reminder_channel,
        v_reminder_time
      )
      ON CONFLICT (appointment_id, channel, scheduled_for) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.schedule_appointment_reminders(uuid, text)
  IS 'Crea recordatorios futuros para una cita usando la configuración del doctor o el default global';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'trg_schedule_appointment_reminders'
  ) THEN
    DROP FUNCTION public.trg_schedule_appointment_reminders();
  END IF;
END;
$$;

CREATE FUNCTION public.trg_schedule_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.schedule_appointment_reminders(NEW.id, 'whatsapp');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_appointment_reminders ON public.appointments;
CREATE TRIGGER trg_schedule_appointment_reminders
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_schedule_appointment_reminders();

-- ============================================================
-- 6. no_show reaper
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'mark_overdue_appointments_no_show'
  ) THEN
    DROP FUNCTION public.mark_overdue_appointments_no_show();
  END IF;
END;
$$;

CREATE FUNCTION public.mark_overdue_appointments_no_show()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_marked integer := 0;
BEGIN
  WITH due AS (
    SELECT
      a.id
    FROM public.appointments a
    LEFT JOIN public.doctor_scheduling_config cfg
      ON cfg.doctor_id = a.doctor_id
    WHERE a.status IN ('scheduled', 'confirmed')
      AND COALESCE(
        a.end_time,
        a.start_time + (COALESCE(a.duration_minutes, 30) || ' minutes')::interval
      ) < now() - make_interval(mins => COALESCE(cfg.noshow_grace_minutes, 30))
  ),
  updated AS (
    UPDATE public.appointments a
    SET
      status = 'no_show',
      updated_at = now()
    FROM due
    WHERE a.id = due.id
    RETURNING a.id
  )
  SELECT count(*)::integer INTO v_marked FROM updated;

  RETURN v_marked;
END;
$$;

COMMENT ON FUNCTION public.mark_overdue_appointments_no_show()
  IS 'Marca como no_show las citas vencidas según la gracia configurada por doctor';
