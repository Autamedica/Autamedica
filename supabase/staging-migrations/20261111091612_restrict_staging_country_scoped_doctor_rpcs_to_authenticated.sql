REVOKE ALL ON FUNCTION public.get_doctor_busy_slots(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_busy_slots(uuid,date,date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_duty_doctors_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_duty_doctors_summary() TO authenticated, service_role;
