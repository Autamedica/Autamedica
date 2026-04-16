import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const patientIds = ['4bef2d39-6c56-46cc-8d37-3a2873c02e12', 'cc0f334a-d5a4-4e33-8474-82c1466dd625'];
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, active, user_id')
    .in('id', patientIds);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Patients status:', patients);
}

run();
