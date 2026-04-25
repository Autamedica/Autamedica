ALTER TABLE growth_os.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_job_type_check;

ALTER TABLE growth_os.email_jobs ADD CONSTRAINT email_jobs_job_type_check 
  CHECK (job_type IN (
    'welcome', 
    'anamnesis_reminder', 
    'appointment_reminder', 
    'newsletter',
    'doctor_new_appointment',
    'doctor_appointment_cancelled',
    'doctor_anamnesis_ready',
    'patient_appointment_cancelled',
    'patient_prescription_ready'
  ));
