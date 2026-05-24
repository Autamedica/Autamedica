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
    // If it starts with wa.me/54 (Argentina) but does NOT have a 9 immediately following, it's a landline or 0800
    if (acc.whatsapp_url.match(/^https:\/\/wa\.me\/54(?!9)/) || acc.whatsapp_url.match(/^https:\/\/wa\.me\/5491120008647/)) { // I also noticed one fake +549112000...
        await supabase.schema('growth_os').from('crm_accounts').update({ whatsapp_url: null }).eq('id', acc.id);
        fixedCount++;
    }
  }
  console.log("Nulled " + fixedCount + " more invalid landline WhatsApp links.");
}
fixLinks();
