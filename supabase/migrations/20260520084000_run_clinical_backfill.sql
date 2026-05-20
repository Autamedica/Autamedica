-- Migration: Execute Clinical Silver Layer Backfill for Historical Anamnesis Extractions
-- Timestamp: 20260520084000

-- Trigger backfill process by updating existing historical rows. 
-- This will automatically trigger the process_anamnesis_extraction_silver_layer() PL/pgSQL function.
UPDATE public.anamnesis_extractions 
  SET updated_at = now() 
  WHERE extraction_result IS NOT NULL 
    AND extraction_result <> '{}'::jsonb;
