import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  console.log('--- 0. Fetching tables list ---');
  const { data: tables, error: tError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  
  if (tError) {
    console.log('Error fetching tables (trying alternate method):', tError.message);
    // Alternate method: query a common table and see if it fails or list common ones
  } else {
    console.log('Tables in public schema:', tables.map(t => t.table_name).join(', '));
  }

  console.log('\n--- 1. Identify user_id for autamedica@gmail.com ---');
  // Since we use service_role, we can use auth.admin
  const { data: { users }, error: uError } = await supabase.auth.admin.listUsers();
  const eduardo = users?.find(u => u.email === 'autamedica@gmail.com');
  
  if (!eduardo) {
    console.log('Eduardo not found in auth.users');
    // Try to find in profiles
    const { data: prof } = await supabase.from('profiles').select('*').eq('email', 'autamedica@gmail.com').maybeSingle();
    console.log('Found in profiles:', prof);
    if (!prof) return;
  } else {
    console.log('Eduardo found in auth.users:', eduardo.id);
  }

  const userId = eduardo?.id || '00a76034-eed7-4af3-85fd-e374a71afd89';

  console.log('\n--- 2. Check doctor_profiles for user_id ---');
  const { data: docProfile, error: dpError } = await supabase
    .from('doctor_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  
  console.log('Doctor profile:', docProfile);
  if (dpError) console.log('Error fetching doctor_profiles:', dpError.message);

  const doctorId = docProfile?.id;

  if (doctorId) {
    console.log('\n--- 3. Check care_team for doctor_id ---');
    const { data: careTeam, error: ctError } = await supabase
      .from('care_team')
      .select('*')
      .eq('doctor_id', doctorId);
    
    console.log('Care team count:', careTeam?.length);
    console.log('Care team data:', careTeam);
    if (ctError) console.log('Error fetching care_team:', ctError.message);

    console.log('\n--- 4. Check appointments for doctor_id ---');
    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('doctor_id', doctorId);
    
    console.log('Appointments count:', appointments?.length);
    if (apptError) console.log('Error fetching appointments:', apptError.message);
  } else {
    console.log('No doctor_id found, skipping care_team and appointments check by doctor_id');
  }

  console.log('\n--- 5. Check profiles for user_id role ---');
  const { data: profile, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  
  console.log('Profile:', profile);
  if (pError) console.log('Error fetching profiles:', pError.message);

  console.log('\n--- 6. RLS Policies ---');
  const { data: policies, error: polError } = await supabase.rpc('get_policies'); // If such RPC exists
  if (polError) {
    console.log('get_policies RPC failed (expected if not custom), fetching via SQL...');
    const { data: sqlPolicies, error: sqlPolError } = await supabase.from('pg_policies').select('*').in('tablename', ['patients', 'doctor_profiles', 'care_team', 'appointments']);
    if (sqlPolError) {
        // pg_policies might not be accessible via from()
        const { data: sqlPolRaw, error: sqlPolRawError } = await supabase.rpc('execute_sql', { sql: "SELECT * FROM pg_policies WHERE tablename IN ('patients', 'doctor_profiles', 'care_team', 'appointments')" });
        console.log('SQL Policies (via RPC if exists):', sqlPolRaw);
    } else {
        console.log('SQL Policies:', sqlPolicies);
    }
  }

  console.log('\n--- 7. Check user_metadata disconnect ---');
  console.log('User metadata from auth.users:', eduardo?.user_metadata);
  console.log('Role from profiles:', profile?.role);
}

run();
