-- Crear tabla juegos_leaderboard
CREATE TABLE IF NOT EXISTS public.juegos_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    tiempo_segundos INTEGER NOT NULL,
    juego_id TEXT NOT NULL DEFAULT 'patologia-especial',
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Asegurar RLS habilitado
ALTER TABLE public.juegos_leaderboard ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'juegos_leaderboard' AND policyname = 'Permitir lectura pública del leaderboard'
    ) THEN
        CREATE POLICY "Permitir lectura pública del leaderboard"
            ON public.juegos_leaderboard FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'juegos_leaderboard' AND policyname = 'Permitir inserción pública en el leaderboard'
    ) THEN
        CREATE POLICY "Permitir inserción pública en el leaderboard"
            ON public.juegos_leaderboard FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;
