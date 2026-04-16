import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const emails = ['autamedica@gmail.com', 'ecucondor@gmail.com'];
  
  for (const email of emails) {
    console.log(`\n--- Investigating ${email} ---`);
    const { data: { users }, error: uError } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === email);
    
    if (user) {
      console.log(`Auth.users: id=${user.id}, role=${user.role}, user_metadata=`, JSON.stringify(user.user_metadata, null, 2));
      
      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      console.log(`Profiles: role=${profile?.role}, name=${profile?.first_name} ${profile?.last_name}`);
      
      const { data: docByUserId } = await supabase.from('doctors').select('*').eq('user_id', user.id).maybeSingle();
      console.log(`Doctors table check (by user_id):`, docByUserId);
      
      if (docByUserId) {
        const { data: careTeam } = await supabase.from('patient_care_team').select('*').eq('doctor_id', docByUserId.id);
        console.log(`Care team count (as doctor):`, careTeam?.length);
        
        const { data: appts } = await supabase.from('appointments').select('*').eq('doctor_id', docByUserId.id);
        console.log(`Appointments count (as doctor):`, appts?.length);
      }
    } else {
      console.log(`User ${email} not found in auth.users`);
    }
  }

  console.log('\n--- Checking if table "doctor_profiles" exists ---');
  const { data: docProfTable, error: docProfError } = await supabase.from('doctor_profiles').select('*').limit(1);
  if (docProfError) {
    console.log(`doctor_profiles table error: ${docProfError.message}`);
  } else {
    console.log(`doctor_profiles table exists and has data.`);
  }

  console.log('\n--- Checking if table "doctors" exists ---');
  const { data: docTable, error: docError } = await supabase.from('doctors').select('*').limit(1);
  if (docError) {
    console.log(`doctors table error: ${docError.message}`);
  } else {
    console.log(`doctors table exists and has data.`);
  }
}

run();
