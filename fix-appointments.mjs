import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const doctorId = '080fb7ae-92b4-44d4-8941-a6db65004b9f';
  
  // Find all past appointments for this doctor that are NOT completed/cancelled
  const now = new Date().toISOString();
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, status, start_time')
    .eq('doctor_id', doctorId)
    .not('status', 'in', '("completed","cancelled")')
    .lt('start_time', now);

  if (error) {
    console.error('Error fetching appointments:', error);
    return;
  }

  console.log(`Found ${appointments.length} appointments to fix.`);

  for (const appt of appointments) {
    console.log(`Fixing appointment ${appt.id} (Current Status: ${appt.status})...`);
    
    // Direct DB update bypassing RLS/Logic
    const { error: uErr } = await supabase
      .from('appointments')
      .update({ 
        status: 'completed'
      })
      .eq('id', appt.id);

    if (uErr) {
      console.error(`Failed to fix appointment ${appt.id}:`, uErr);
    } else {
      console.log(`Appointment ${appt.id} marked as completed.`);
    }
  }
}

run();
