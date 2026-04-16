import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

async function run() {
  const doctorUserId = '00a76034-eed7-4af3-85fd-e374a71afd89';
  
  // 1. Get doctor
  const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', doctorUserId).single();
  console.log('Doctor ID:', doctor?.id);

  // 2. Get patient IDs from care team
  const { data: assignments } = await supabase
    .from('patient_care_team')
    .select('patient_id')
    .eq('doctor_id', doctor.id)
    .eq('active', true);
  const careTeamIds = (assignments ?? []).map(a => a.patient_id);
  console.log('Care Team IDs:', careTeamIds);

  // 3. Get patient IDs from appointments
  const { data: appointmentPatients } = await supabase
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctor.id);
  const appointmentIds = (appointmentPatients ?? [])
    .map(a => a.patient_id)
    .filter(id => typeof id === 'string');
  console.log('Appt Patient IDs:', appointmentIds);

  const allPatientIds = [...new Set([...careTeamIds, ...appointmentIds])];
  console.log('All Patient IDs:', allPatientIds);

  if (allPatientIds.length === 0) {
    console.log('No patient IDs found.');
    return;
  }

  // 4. Fetch profiles
  const { data: patients, error: patError } = await supabase
    .from('patients')
    .select('*, profile:profiles!inner(*)')
    .in('id', allPatientIds)
    .eq('active', true);
    
  if (patError) console.error('Pat Error:', patError);
  console.log('Patients fetched:', patients?.length);

  // 5. Fetch alerts
  const { data: alerts, error: alError } = await supabase
    .from('patient_alerts')
    .select('*')
    .in('patient_id', allPatientIds);
    
  if (alError) console.error('Al Error:', alError);
  console.log('Alerts fetched:', alerts?.length);

  // 6. Score
  const scoredPatients = (patients || []).map(p => {
    let score = 0;
    const patientAlerts = (alerts || []).filter(a => a.patient_id === p.id);
    if (patientAlerts.some(a => a.severity === 'high')) score += 1000;
    if (patientAlerts.some(a => a.severity === 'medium')) score += 500;
    const lastUpdate = new Date(p.updated_at ?? p.created_at).getTime();
    score += lastUpdate / 1000000;
    return { p, score };
  });

  const final = scoredPatients.sort((a, b) => b.score - a.score).map(s => s.p);
  console.log('Final count:', final.length);
}

run();
