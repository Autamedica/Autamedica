-- Cloudflare Calls SFU session binding to the already-authorized room and owner.
-- Do not apply to production/staging before disposable replay, CI and smoke.
-- No patient/doctor names, CPF, clinical notes or media credentials are stored.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sfu_room_session_bindings (
  session_id text PRIMARY KEY
    CHECK (session_id ~ '^[A-Za-z0-9._-]{1,200}$'),
  room_id text NOT NULL CHECK (char_length(room_id) BETWEEN 1 AND 200),
  principal_key text NOT NULL
    CHECK (principal_key ~ '^(user|guest):[A-Za-z0-9._-]{8,200}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '4 hours'),
  CONSTRAINT sfu_session_expiry_after_creation CHECK (expires_at > created_at)
);

COMMENT ON TABLE public.sfu_room_session_bindings IS
  'Nonclinical, server-managed room binding for Cloudflare Calls sessions. Only backend service_role may SELECT/INSERT. Session ID must never authorize a different room or participant.';
CREATE INDEX IF NOT EXISTS idx_sfu_room_session_expiry
ON public.sfu_room_session_bindings(expires_at);
CREATE INDEX IF NOT EXISTS idx_sfu_room_session_room
ON public.sfu_room_session_bindings(room_id,created_at DESC);

ALTER TABLE public.sfu_room_session_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sfu_room_session_bindings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.sfu_room_session_bindings TO service_role;

-- No payout, payment, doctor duty, QR, clinical document or media flag changes.
COMMIT;
