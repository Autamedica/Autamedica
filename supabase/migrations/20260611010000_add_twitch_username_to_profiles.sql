-- Añadir columna twitch_username a la tabla public.profiles para vinculación de cuentas
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS twitch_username TEXT UNIQUE;
