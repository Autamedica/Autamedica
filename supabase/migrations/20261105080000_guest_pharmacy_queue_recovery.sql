-- Guest patients must be able to restore their waiting room after Android
-- process death without extending the 2-hour clinical access JWT.
-- The 256-bit bearer recovery token is returned once to the originating device;
-- only its SHA-256 digest is stored. No anon/authenticated SQL access.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pharmacy_guest_dispatch_sessions (
  request_id uuid PRIMARY KEY REFERENCES public.pharmacy_dispatch_requests(id) ON DELETE CASCADE,
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  revoked_at timestamptz
);
ALTER TABLE public.pharmacy_guest_dispatch_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pharmacy_guest_dispatch_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.pharmacy_guest_dispatch_sessions TO service_role;

CREATE OR REPLACE FUNCTION app_private.revoke_closed_pharmacy_guest_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' AS $revoke$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('cancelled','completed','expired')
  THEN
    UPDATE public.pharmacy_guest_dispatch_sessions
    SET revoked_at = NOW()
    WHERE request_id = NEW.id
      AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$revoke$;

DROP TRIGGER IF EXISTS trg_revoke_closed_pharmacy_guest_session
  ON public.pharmacy_dispatch_requests;
CREATE TRIGGER trg_revoke_closed_pharmacy_guest_session
AFTER UPDATE OF status ON public.pharmacy_dispatch_requests
FOR EACH ROW
EXECUTE FUNCTION app_private.revoke_closed_pharmacy_guest_session();

REVOKE ALL ON FUNCTION app_private.revoke_closed_pharmacy_guest_session()
  FROM PUBLIC, anon, authenticated;

COMMIT;
