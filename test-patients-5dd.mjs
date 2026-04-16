import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const doctorUserId = '5ddfda98-fae0-46ab-8d17-a6f40b665d67';
  
  // 1. Get doctor
  const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', doctorUserId).single();
  console.log('Doctor ID:', doctor?.id);

  // 2. Get patient IDs from appointments
  const { data: appts } = await supabase
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctor.id);
  const appointmentIds = (appts ?? [])
    .map(a => a.patient_id)
    .filter(id => typeof id === 'string');
  console.log('Unique Patient IDs count:', new Set(appointmentIds).size);

  const allPatientIds = [...new Set(appointmentIds)];

  if (allPatientIds.length === 0) {
    console.log('No patient IDs found.');
    return;
  }

  // 4. Fetch profiles
  const { data: patients, error: patError } = await supabase
    .from('patients')
    .select('*, profile:profiles!inner(*)')
    .in('id', allPatientIds)
    .eq('active', true);
    
  if (patError) console.error('Pat Error:', patError);
  console.log('Patients fetched:', patients?.length);
}

run();
