-- Only clinically approved physicians may be displayed as available
-- to patients. Account activation alone is never professional approval.
BEGIN;
CREATE OR REPLACE FUNCTION app_private.patient_doctor_directory()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',d.id,'user_id',d.user_id,'specialty',d.specialty,'subspecialty',d.subspecialty,
   'license_number',d.license_number,'license_type',d.license_type,'care_country',d.care_country,
   'uf_brazil',CASE WHEN d.care_country='BR' THEN d.uf_brazil END,
   'enrollment_jurisdiction',CASE WHEN d.care_country='AR' THEN d.enrollment_jurisdiction END,
   'consultation_fee',d.consultation_fee,'years_experience',d.years_experience,
   'bio',d.bio,'languages',d.languages,'active',d.active,'created_at',d.created_at,'updated_at',d.updated_at,
   'first_name',p.first_name,'last_name',p.last_name,'avatar_url',p.avatar_url,
   'sss_validation_status',CASE WHEN d.care_country='AR' THEN p.sss_validation_status END,
   'profile',jsonb_build_object('user_id',d.user_id,'first_name',p.first_name,'last_name',p.last_name,
     'avatar_url',p.avatar_url,'role','doctor',
     'sss_validation_status',CASE WHEN d.care_country='AR' THEN p.sss_validation_status END,
     'matricula_nacional',CASE WHEN d.care_country='AR' AND d.license_type='MN' THEN d.license_number END)
 ) ORDER BY d.created_at DESC),'[]'::jsonb)
 FROM public.doctors d JOIN public.profiles p ON p.user_id=d.user_id
 WHERE auth.uid() IS NOT NULL AND d.active IS TRUE
   AND d.care_country=app_private.viewer_care_country()
   AND app_private.is_doctor_dispatch_approved(d.id);
$function$;
COMMIT;
