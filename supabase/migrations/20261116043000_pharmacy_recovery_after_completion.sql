-- Completed encounters retain device-scoped recovery for document delivery.
-- Cancelled/expired requests still revoke the high-entropy recovery credential.
CREATE OR REPLACE FUNCTION app_private.revoke_closed_pharmacy_guest_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' AS $revoke$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('cancelled','expired')
  THEN
    UPDATE public.pharmacy_guest_dispatch_sessions
    SET revoked_at = NOW()
    WHERE request_id = NEW.id
      AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$revoke$;

REVOKE ALL ON FUNCTION app_private.revoke_closed_pharmacy_guest_session()
  FROM PUBLIC, anon, authenticated;
