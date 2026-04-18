-- ============================================================
-- Human takeover: bot only responds after 15min of human inactivity
-- per peer (chat).
-- ============================================================

-- 1. Defer column on inbound queue
ALTER TABLE public.appointment_inbound_messages
  ADD COLUMN IF NOT EXISTS deferred_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_inbound_messages_deferred
  ON public.appointment_inbound_messages (deferred_until, from_phone, created_at)
  WHERE deferred_until IS NOT NULL AND status = 'pending';

COMMENT ON COLUMN public.appointment_inbound_messages.deferred_until IS
  'Timestamp hasta el cual el row no debe ser procesado por el bot. Se usa cuando el humano (Eduardo) está activo en el chat. NULL = no diferido.';

-- 2. Tabla de actividad humana por peer
CREATE TABLE IF NOT EXISTS public.whatsapp_peer_activity (
  peer                    text PRIMARY KEY,
  account_id              text NOT NULL,
  channel                 text NOT NULL DEFAULT 'whatsapp'
                          CHECK (channel IN ('whatsapp', 'telegram', 'signal', 'discord')),
  last_human_outbound_at  timestamptz NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_peer_activity_recent
  ON public.whatsapp_peer_activity (last_human_outbound_at DESC);

COMMENT ON TABLE public.whatsapp_peer_activity IS
  'Registro del ultimo mensaje outbound HUMANO por peer. Usado para el delay de 15min antes de que el bot intervenga.';

ALTER TABLE public.whatsapp_peer_activity ENABLE ROW LEVEL SECURITY;

-- 3. Trigger set_updated_at
DROP TRIGGER IF EXISTS trg_whatsapp_peer_activity_updated_at ON public.whatsapp_peer_activity;
CREATE TRIGGER trg_whatsapp_peer_activity_updated_at
  BEFORE UPDATE ON public.whatsapp_peer_activity
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
