import { createClient } from '@supabase/supabase-client';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function getMetrics() {
  const { data: leadsCount } = await supabase.from('growth_os.leads').select('*', { count: 'exact', head: true });
  const { data: doctorsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'doctor');
  const { data: appointmentsCount } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'completed');
  const { data: payments } = await supabase.from('appointment_payments').select('gross_amount').eq('status', 'approved');
  
  const gmv = payments?.reduce((acc, p) => acc + (p.gross_amount || 0), 0) || 0;
  const netIncome = gmv * 0.15; // Assumption: 15% fee
  
  const { data: attribution } = await supabase.rpc('growth_os.dashboard_summary', { days_back: 365 });
  
  console.log(JSON.stringify({
    total_leads: leadsCount || 0,
    total_doctors: doctorsCount || 0,
    completed_appointments: appointmentsCount || 0,
    gmv,
    net_income: netIncome,
    attribution: attribution || {}
  }, null, 2));
}

getMetrics();
