-- Activa el Loop Viral: Tracking de mensajes de referidos post-consulta
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS referral_sent boolean DEFAULT false;
COMMENT ON COLUMN public.appointments.referral_sent IS 'Indica si ya se envió el mensaje de Referral Engine (WhatsApp Share) al paciente 1h después de completar la cita.';
