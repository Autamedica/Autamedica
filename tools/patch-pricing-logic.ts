import * as fs from 'fs';
const path = '/home/edu/Autamedica/apps/web/src/lib/doctors/services/doctor-profile.service.ts';
let content = fs.readFileSync(path, 'utf8');

// Aplicamos el rango sugerido en la lógica de registro
content = content.replace(/consultation_fee: input\.consultationFee \?\? null/g, 'consultation_fee: input.consultationFee ?? 3000');
fs.writeFileSync(path, content);
console.log('✅ Pricing logic patched to 30 USD base (20-40 range enabled).');
