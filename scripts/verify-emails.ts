import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyEmails() {
  console.log('🔍 Iniciando auditoría de calidad de 850+ correos...');
  
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, email')
    .not('email', 'is', null);

  if (error) {
    console.error('Error al obtener correos:', error);
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let invalidCount = 0;
  let domains: Set<string> = new Set();

  profiles.forEach(p => {
    if (!emailRegex.test(p.email!)) {
      console.log(`❌ Sintaxis inválida: \${p.email}`);
      invalidCount++;
    } else {
      const domain = p.email!.split('@')[1];
      domains.add(domain);
    }
  });

  console.log('--- Resumen de Calidad ---');
  console.log(`✅ Correos analizados: \${profiles.length}`);
  console.log(`⚠️ Correos con sintaxis inválida: \${invalidCount}`);
  console.log(`🌐 Dominios únicos detectados: \${domains.size}`);
  console.log('💡 Sugerencia: Antes de enviar, marcaremos los inválidos como "unsubscribed" para proteger tu cuenta.');
}

verifyEmails();
