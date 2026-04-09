import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const doctorId = '080fb7ae-92b4-44d4-8941-a6db65004b9f';
  
  console.log(`Triggering metrics recalculation for doctor ${doctorId}...`);
  
  const { error } = await supabase.rpc('recalculate_doctor_metrics', {
    target_doctor_id: doctorId
  });

  if (error) {
    console.error('Error triggering recalculation:', error);
  } else {
    console.log('Recalculation triggered successfully.');
    
    // Check updated metrics
    const { data: metrics } = await supabase
      .from('doctor_ranking_metrics')
      .select('*')
      .eq('doctor_id', doctorId)
      .single();
    
    console.log('Updated Metrics:', metrics);
  }
}

run();
