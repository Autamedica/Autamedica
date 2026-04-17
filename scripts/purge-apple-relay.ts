import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function purgeApple() {
  console.log('🍎 Purga de Apple Private Relay iniciada...');
  
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, email')
    .ilike('email', '%@privaterelay.appleid.com')
    .eq('newsletter_subscribed', true);

  if (error) {
    console.error('Error al filtrar:', error);
    return;
  }

  console.log(`📦 Encontrados \${profiles.length} correos de Apple Private Relay.`);

  for (const p of profiles) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ newsletter_subscribed: false })
      .eq('user_id', p.user_id);
    
    if (!updateError) console.log(`✅ Desactivado: \${p.email}`);
  }
  console.log('🏁 Purga finalizada.');
}
purgeApple();
