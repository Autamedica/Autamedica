import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const tables = ['patients', 'doctors', 'patient_care_team', 'appointments', 'profiles'];
  
  console.log('--- Fetching RLS Policies for tables ---');
  for (const table of tables) {
    console.log(`\nTable: ${table}`);
    const { data: policies, error } = await supabase
      .rpc('execute_sql', { sql: `SELECT policyname, action, roles, qual, with_check FROM pg_policies WHERE tablename = '${table}'` });
    
    if (error) {
      console.log(`Error fetching policies for ${table} via RPC: ${error.message}`);
      // Try another way if execute_sql is not available
    } else {
      console.log(JSON.stringify(policies, null, 2));
    }
  }
}

run();
