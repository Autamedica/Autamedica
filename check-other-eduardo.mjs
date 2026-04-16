import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const doctorId = '7af753a7-1876-4324-92dd-3e7d72407bc8'; // ID for UserID a647f95f...
  
  const { data: appts } = await supabase
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctorId);
    
  console.log('Appointments:', appts);

  if (appts && appts.length > 0) {
    const patientId = appts[0].patient_id;
    const { data: patient } = await supabase
      .from('patients')
      .select('*, profile:profiles(*)')
      .eq('id', patientId)
      .maybeSingle();
      
    console.log('Patient:', patient);
  }
}

run();
