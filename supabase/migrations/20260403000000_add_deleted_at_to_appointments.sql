-- Add soft delete support to appointments table
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT null;
