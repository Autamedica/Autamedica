BEGIN;

-- ============================================================================
-- Ephemeral single-use server-side session handoff codes for Android -> Memed
-- mobile WebView bridge. Replaces manual client-side cookie forging.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.memed_mobile_session_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  next_path text NOT NULL CHECK (
    next_path LIKE '/doctors/prescriptions/memed-mobile?%'
    AND length(next_path) <= 256
  ),
  access_token text,
  refresh_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT memed_mobile_session_handoffs_ttl_bounds CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '120 seconds'
  )
);

CREATE INDEX IF NOT EXISTS idx_memed_mobile_session_handoffs_expires_at
  ON public.memed_mobile_session_handoffs (expires_at);

CREATE INDEX IF NOT EXISTS idx_memed_mobile_session_handoffs_user_created
  ON public.memed_mobile_session_handoffs (user_id, created_at DESC);

ALTER TABLE public.memed_mobile_session_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memed_mobile_session_handoffs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.memed_mobile_session_handoffs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.memed_mobile_session_handoffs TO service_role;

DROP POLICY IF EXISTS memed_mobile_session_handoffs_deny_client_roles
  ON public.memed_mobile_session_handoffs;
CREATE POLICY memed_mobile_session_handoffs_deny_client_roles
  ON public.memed_mobile_session_handoffs
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY memed_mobile_session_handoffs_deny_client_roles
  ON public.memed_mobile_session_handoffs
  IS 'Defense in depth: browser roles cannot read or mutate ephemeral Memed mobile handoff codes; service_role handles issuance and exchange.';

-- Atomically consume an unexpired, unused handoff code, wipe stored tokens
-- immediately, and purge stale expired rows.
CREATE OR REPLACE FUNCTION public.consume_memed_mobile_session_handoff(
  p_code_hash text
)
RETURNS TABLE (
  user_id uuid,
  doctor_id uuid,
  next_path text,
  access_token text,
  refresh_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.memed_mobile_session_handoffs%ROWTYPE;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_row
  FROM public.memed_mobile_session_handoffs
  WHERE code_hash = p_code_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.memed_mobile_session_handoffs
  SET consumed_at = now(),
      access_token = NULL,
      refresh_token = NULL
  WHERE id = v_row.id;

  DELETE FROM public.memed_mobile_session_handoffs
  WHERE expires_at < now() - interval '5 minutes'
     OR consumed_at < now() - interval '5 minutes';

  RETURN QUERY
  SELECT
    v_row.user_id,
    v_row.doctor_id,
    v_row.next_path,
    v_row.access_token,
    v_row.refresh_token;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_memed_mobile_session_handoff(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_memed_mobile_session_handoff(text) TO service_role;

-- Explicit TTL cleanup routine for scheduled/operational maintenance.
CREATE OR REPLACE FUNCTION public.cleanup_expired_memed_mobile_session_handoffs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.memed_mobile_session_handoffs
  WHERE expires_at < now() - interval '5 minutes'
     OR consumed_at < now() - interval '5 minutes';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_memed_mobile_session_handoffs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_memed_mobile_session_handoffs() TO service_role;

COMMIT;
