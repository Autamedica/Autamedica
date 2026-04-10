import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function findLatestIntake() {
  const { data: intake, error } = await supabase
    .from('psychiatry_intakes')
    .select('id, patient_id, completed_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching intake:', error);
    return;
  }

  const { data: patient } = await supabase
    .from('profiles')
    .select('first_name, last_name, metadata')
    .eq('user_id', (await supabase.from('patients').select('user_id').eq('id', intake.patient_id).single()).data.user_id)
    .single();

  const { data: sections } = await supabase
    .from('psychiatry_intake_sections')
    .select('section, phase, data')
    .eq('intake_id', intake.id);

  console.log(JSON.stringify({ intake, patient, sections }, null, 2));
}

findLatestIntake();
