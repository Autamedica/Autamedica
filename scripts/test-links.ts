import * as fs from 'fs';

const RESEND_API_KEY = 're_eAgErXPd_Ffci3rKxoHDh7U5Y1t9mwF4Y';
const htmlTemplate = fs.readFileSync('/home/edu/autamedica-newsletter-final.html', 'utf8');

async function testLinks() {
    console.log('🚀 Probando enlaces dinámicos en Gmail...');
    
    // Simulamos un ID de usuario real de tu DB
    const testUserId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'AutaMedica Vital <contacto@autamedica.com>',
                to: ['reinamosquera2003@gmail.com'],
                subject: 'AutaMedica: Verificación de Enlaces',
                html: htmlTemplate
                    .replace('[Nombre del Paciente]', 'Reina Mosquera')
                    .replace('[USER_ID]', testUserId)
            })
        });

        if (response.ok) {
            console.log('✅ Prueba de enlaces enviada!');
            console.log('💡 Al recibirlo, verifica que el enlace de baja termine en:', testUserId);
        } else {
            const err = await response.json();
            console.error('❌ Error:', err);
        }
    } catch (err) {
        console.error('❌ Fallo:', err);
    }
}

testLinks();
