import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  throw new Error('Missing Supabase Service Role Key');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixLinks() {
  const { data: accounts } = await supabase.schema('growth_os').from('crm_accounts').select('id, whatsapp_url').not('whatsapp_url', 'is', null);
  
  let fixedCount = 0;
  for (const acc of accounts) {
    // Check if the number does NOT have the 9 indicating mobile in Argentina, or is clearly a short landline
    const isLandline = acc.whatsapp_url.match(/^https:\/\/wa\.me\/54(11|[234678]\d)\d{6,7}$/);
    if (isLandline && !acc.whatsapp_url.includes('wa.me/549')) {
        await supabase.schema('growth_os').from('crm_accounts').update({ whatsapp_url: null }).eq('id', acc.id);
        fixedCount++;
    }
  }
  console.log("Nulled " + fixedCount + " additional invalid landline WhatsApp links.");
}
fixLinks();
