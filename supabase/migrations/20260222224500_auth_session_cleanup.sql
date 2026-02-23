-- Procedimiento para limpiar sesiones duplicadas manteniendo la más reciente
CREATE OR REPLACE FUNCTION public.cleanup_duplicate_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT user_id, count(*) as session_count 
        FROM auth.sessions 
        GROUP BY user_id 
        HAVING count(*) > 1
    LOOP
        -- Borrar todas las sesiones de este usuario excepto la más reciente actualizadas
        DELETE FROM auth.sessions 
        WHERE user_id = user_record.user_id 
        AND id NOT IN (
            SELECT id 
            FROM auth.sessions 
            WHERE user_id = user_record.user_id 
            ORDER BY updated_at DESC 
            LIMIT 1
        );
    END LOOP;
END;
$$;
