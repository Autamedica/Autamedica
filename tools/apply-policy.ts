import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function apply() {
  const sql = `
    DROP POLICY IF EXISTS "Doctors global patient search" ON public.profiles;
    CREATE POLICY "Doctors global patient search"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (
        (auth.jwt() ->> 'role' = 'doctor')
        OR (auth.uid() = user_id)
      );
  `;
  
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  if (error) {
    console.error('Error connecting to Supabase:', error);
    return;
  }
  
  console.log('--- Applying SQL Policy via RPC ---');
  const { error: sqlError } = await supabase.rpc('admin_execute_sql', { query_text: sql });
  if (sqlError) {
    console.error('Error executing SQL:', sqlError);
    console.log('Try applying this SQL manually in the Dashboard:');
    console.log(sql);
  } else {
    console.log('✅ Policy applied successfully!');
  }
}
apply();
