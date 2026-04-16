import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .ilike('first_name', '%EDUARDO%')
    .ilike('last_name', '%MARQUES%');
  
  if (pError) {
    console.error('Error fetching profiles:', pError);
    return;
  }
  
  console.log('Profiles found:', profiles);

  for (const prof of profiles) {
    const { data: doctor, error: dError } = await supabase
      .from('doctors')
      .select('id, user_id')
      .eq('user_id', prof.user_id)
      .maybeSingle();
      
    if (dError) {
      console.error(`Error fetching doctor for ${prof.user_id}:`, dError);
      continue;
    }
    
    if (doctor) {
      console.log(`Doctor found: ID=${doctor.id}, UserID=${doctor.user_id}`);
      
      const { data: patients, error: patError } = await supabase
        .from('patient_care_team')
        .select('patient_id, active')
        .eq('doctor_id', doctor.id);
        
      console.log(`Care Team entries for doctor ${doctor.id}:`, patients);
      
      const { data: appts, error: aError } = await supabase
        .from('appointments')
        .select('id, patient_id, status')
        .eq('doctor_id', doctor.id);
        
      console.log(`Appointments for doctor ${doctor.id}:`, appts);
    }
  }
}

run();
