import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

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
