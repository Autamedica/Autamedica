import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const { data: policies, error } = await supabase.rpc('public.get_policies_for_table', { table_name: 'patients' });
  if (error) {
    // If RPC doesn't exist, try querying pg_policies directly via execute_sql if possible, 
    // but usually I don't have that RPC. Let's try to find common ones.
    const { data: pols, error: err2 } = await supabase.from('pg_policies').select('*').eq('tablename', 'patients');
    console.log('Policies (pg_policies):', pols || err2);
  } else {
    console.log('Policies:', policies);
  }
}

run();
