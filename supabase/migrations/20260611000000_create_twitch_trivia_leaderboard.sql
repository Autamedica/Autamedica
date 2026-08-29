-- Crear tabla twitch_trivia_leaderboard para registrar puntajes históricos de usuarios de Twitch
CREATE TABLE IF NOT EXISTS public.twitch_trivia_leaderboard (
    username TEXT PRIMARY KEY,
    puntos INTEGER NOT NULL DEFAULT 0,
    actualizado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Asegurar RLS habilitado
ALTER TABLE public.twitch_trivia_leaderboard ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'twitch_trivia_leaderboard' AND policyname = 'Permitir lectura pública de trivia leaderboard'
    ) THEN
        CREATE POLICY "Permitir lectura pública de trivia leaderboard"
            ON public.twitch_trivia_leaderboard FOR SELECT
            USING (true);
    END IF;
END $$;

-- Función RPC para incrementar de forma atómica los puntos de un usuario
CREATE OR REPLACE FUNCTION public.incrementar_puntos_twitch(p_username text, p_puntos integer)
RETURNS void AS $$
BEGIN
    INSERT INTO public.twitch_trivia_leaderboard (username, puntos, actualizado_at)
    VALUES (p_username, p_puntos, timezone('utc'::text, now()))
    ON CONFLICT (username)
    DO UPDATE SET 
        puntos = public.twitch_trivia_leaderboard.puntos + p_puntos,
        actualizado_at = timezone('utc'::text, now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
