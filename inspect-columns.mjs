import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const { data, error } = await supabase.from('appointments').select('*').limit(1);
  if (error) { console.error(error); return; }
  console.log('Available columns in appointments:', Object.keys(data[0]));
}

run();
