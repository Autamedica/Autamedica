import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const doctorUserId = '00a76034-eed7-4af3-85fd-e374a71afd89';
  
  // 1. Resolve doctor
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', doctorUserId)
    .single();
    
  console.log('Doctor ID:', doctor?.id);

  // 2. Care team
  const { data: careTeam } = await supabase
    .from('patient_care_team')
    .select('patient_id')
    .eq('doctor_id', doctor.id)
    .eq('active', true);
    
  console.log('Care Team IDs:', careTeam);

  // 3. Appointments
  const { data: appts } = await supabase
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctor.id);
    
  console.log('Appt Patient IDs:', appts);

  const allIds = [...new Set([...(careTeam || []).map(a => a.patient_id), ...(appts || []).map(a => a.patient_id)])].filter(Boolean);
  console.log('All Patient IDs:', allIds);

  // 4. Fetch with profile
  const { data: patients, error } = await supabase
    .from('patients')
    .select(`
      *,
      profile:profiles!inner(
        user_id,
        first_name,
        last_name,
        email,
        phone,
        avatar_url,
        role
      )
    `)
    .in('id', allIds)
    .eq('active', true);
    
  if (error) {
    console.error('Query Error:', error);
  } else {
    console.log('Final Patients List:', patients);
  }
}

run();
