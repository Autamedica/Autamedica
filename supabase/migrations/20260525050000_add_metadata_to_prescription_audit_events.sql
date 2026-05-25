-- Migration: Add metadata to prescription_audit_events
-- Path: supabase/migrations/20260525050000_add_metadata_to_prescription_audit_events.sql

ALTER TABLE public.prescription_audit_events 
ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN public.prescription_audit_events.metadata IS 'Rich metadata for the audit event (e.g. signature method, cuir details, etc.)';
