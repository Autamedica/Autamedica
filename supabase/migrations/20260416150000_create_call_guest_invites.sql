-- Tabla para registrar invitaciones de invitados
CREATE TABLE IF NOT EXISTS public.call_guest_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
    room_id text NOT NULL,
    guest_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz
);

ALTER TABLE public.call_guest_invites ENABLE ROW LEVEL SECURITY;

-- API utiliza service_role, no se exponen policies al cliente.
