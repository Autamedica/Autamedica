import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
}
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
