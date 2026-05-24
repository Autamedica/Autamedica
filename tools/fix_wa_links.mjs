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
    if (acc.whatsapp_url.match(/^https:\/\/wa\.me\/5411\d{8}$/)) {
        // This is a landline incorrectly mapped to whatsapp in the past. 
        // We will null it out so it doesn't show in the UI as a valid whatsapp link.
        await supabase.schema('growth_os').from('crm_accounts').update({ whatsapp_url: null }).eq('id', acc.id);
        fixedCount++;
    }
  }
  console.log(`Nulled ${fixedCount} invalid landline WhatsApp links.`);
}
fixLinks();
