import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const doctorId = '080fb7ae-92b4-44d4-8941-a6db65004b9f';
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, status, created_at, start_time, end_time')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching appointments:', error);
    return;
  }
  
  console.log('Appointments Status Breakdown:');
  const statusCounts = {};
  for (const appt of appointments) {
    statusCounts[appt.status] = (statusCounts[appt.status] || 0) + 1;
    console.log(`- ID: ${appt.id} | Status: ${appt.status} | Start: ${appt.start_time}`);
  }
  console.log('\nSummary:', statusCounts);
}

run();
