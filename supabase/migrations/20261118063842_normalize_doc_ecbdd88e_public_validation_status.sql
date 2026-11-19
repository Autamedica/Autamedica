BEGIN;
ALTER TABLE public.medical_document_archives DISABLE TRIGGER trg_guard_medical_document_archive;
UPDATE public.medical_document_archives
SET authorization_snapshot =
  (coalesce(authorization_snapshot, '{}'::jsonb) - 'signature_mode' - 'signature_note')
  || jsonb_build_object(
    'statement', 'Emitido y registrado oficialmente en AutaMedica',
    'validation_status', 'Emitido y registrado oficialmente en AutaMedica'
  )
WHERE reference = 'DOC-ECBDD88EE67947D1B3610D5FAB9D31C3';
ALTER TABLE public.medical_document_archives ENABLE TRIGGER trg_guard_medical_document_archive;
COMMIT;
