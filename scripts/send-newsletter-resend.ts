import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// CONFIGURACIÓN (Pegarás tu llave aquí)
const RESEND_API_KEY = 're_xxxxxxxxx'; 
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const htmlTemplate = fs.readFileSync('/home/edu/autamedica-newsletter-final.html', 'utf8');

async function main() {
    console.log('🚀 Iniciando campaña AutaMedica Vital vía Resend...');
    
    const { data: patients, error } = await supabase
        .from('profiles')
        .select('email, first_name')
        .eq('newsletter_subscribed', true)
        .not('email', 'is', null);

    if (error || !patients) return console.error('Error:', error);
    
    console.log(`📦 Preparando envío para \${patients.length} pacientes...`);

    for (const patient of patients) {
            if (patient.email.includes('test') || patient.email.includes('example') || patient.email.includes('appleid')) { console.log('⏭️ Saltando registro de prueba/Apple: ' + patient.email); continue; }
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'AutaMedica Vital <onboarding@resend.dev>', // Cambiar a contacto@autamedica.com tras validar dominio
                    to: [patient.email],
                    subject: 'AutaMedica: Cuidando su salud en tiempo real',
                    html: htmlTemplate.replace('[Nombre del Paciente]', patient.first_name || 'Paciente').replace('[USER_ID]', patient.user_id)
                })
            });

            if (response.ok) console.log(`✅ Enviado: \${patient.email}`);
            else console.error(`❌ Error en \${patient.email}: \${response.statusText}`);
        } catch (err) {
            console.error(`❌ Fallo crítico en \${patient.email}`);
        }
    }
}

main();
