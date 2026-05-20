import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qxjjrpksmwwrmubhvjew.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo'
);

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
