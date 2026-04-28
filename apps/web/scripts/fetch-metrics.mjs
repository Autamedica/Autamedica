import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL/PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const growth = supabase.schema('growth_os');

function centsToMajorUnit(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

async function exactCount(query, label) {
  const { count, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return count || 0;
}

async function getMetrics() {
  const [leadsCount, doctorsCount, appointmentsCount] = await Promise.all([
    exactCount(growth.from('leads').select('id', { count: 'exact', head: true }), 'growth leads count'),
    exactCount(supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'doctor'), 'doctors count'),
    exactCount(supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed'), 'appointments count'),
  ]);

  const { data: payments, error: paymentsError } = await supabase
    .from('appointment_payments')
    .select('gross_amount')
    .eq('status', 'approved');

  if (paymentsError) throw new Error(`payments: ${paymentsError.message}`);
  
  const gmv = payments?.reduce((acc, p) => acc + centsToMajorUnit(p.gross_amount), 0) || 0;
  const netIncome = gmv * 0.15;
  
  const { data: attribution, error: attributionError } = await growth.rpc('dashboard_summary', { days_back: 365 });
  if (attributionError) throw new Error(`growth dashboard summary: ${attributionError.message}`);
  const normalizedAttribution = attribution
    ? {
        ...attribution,
        conversions: {
          ...attribution.conversions,
          total_revenue: centsToMajorUnit(attribution.conversions?.total_revenue),
        },
      }
    : {};
  
  console.log(JSON.stringify({
    total_leads: leadsCount || 0,
    total_doctors: doctorsCount || 0,
    completed_appointments: appointmentsCount || 0,
    gmv,
    net_income: netIncome,
    attribution: normalizedAttribution
  }, null, 2));
}

getMetrics();
