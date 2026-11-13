-- Non-mutating gate. The GiST exclusion constraint must exist and be valid
-- in the throwaway replay database, independently of any appointment fixtures.
DO $check$
DECLARE v_oid oid; v_definition text;
BEGIN
 SELECT oid,pg_get_constraintdef(oid) INTO v_oid,v_definition
 FROM pg_constraint
 WHERE conrelid='public.appointments'::regclass
   AND conname='appointments_doctor_no_overlap'
   AND contype='x' AND convalidated;
 IF v_oid IS NULL
    OR v_definition NOT ILIKE '%doctor_id WITH =%'
    OR v_definition NOT ILIKE '%tstzrange%'
    OR v_definition NOT ILIKE '%cancelled%'
    OR v_definition NOT ILIKE '%no_show%'
 THEN
   RAISE EXCEPTION 'Doctor appointment overlap exclusion constraint missing/invalid';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.appointments'::regclass
     AND tgname='trg_appointment_conflict' AND tgenabled <> 'D'
 ) THEN
   RAISE EXCEPTION 'Existing appointment conflict trigger was unexpectedly removed';
 END IF;
END $check$;
