import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const doctorId = '080fb7ae-92b4-44d4-8941-a6db65004b9f';
  
  const { data: team } = await supabase.from('patient_care_team').select('patient_id').eq('doctor_id', doctorId).eq('active', true);
  console.log('Care team:', team);
  
  const { data: appts } = await supabase.from('appointments').select('patient_id').eq('doctor_id', doctorId);
  console.log('Appointments:', appts);
}

run();
