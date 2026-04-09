import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .ilike('first_name', '%Eduardo%');
  
  if (pErr) { console.error('Profiles err:', pErr); return; }
  console.log('Profiles found:', profiles);

  for (const p of profiles) {
    const { data: doctor } = await supabase.from('doctors').select('id, specialty').eq('user_id', p.user_id).single();
    if (!doctor) {
      console.log(`No doctor profile for ${p.first_name}`);
      continue;
    }
    console.log(`\nDoctor ID for ${p.first_name} ${p.last_name}:`, doctor.id);

    const { data: metrics } = await supabase.from('doctor_ranking_metrics').select('*').eq('doctor_id', doctor.id).single();
    console.log('Metrics:', metrics);

    const { data: reviews } = await supabase.from('doctor_reviews').select('*').eq('doctor_id', doctor.id);
    console.log(`Reviews count: ${reviews?.length || 0}`);
    if (reviews && reviews.length > 0) {
      console.log('Reviews:', reviews);
    }

    const { data: appointments } = await supabase.from('appointments').select('id, status').eq('doctor_id', doctor.id);
    console.log(`Appointments total: ${appointments?.length || 0}`);
    const completed = appointments?.filter(a => a.status === 'completed') || [];
    console.log(`Appointments completed: ${completed.length}`);
  }
}

run();
