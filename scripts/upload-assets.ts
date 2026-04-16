import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function upload() {
    console.log('☁️  Subiendo assets a Supabase Storage...');
    
    // 1. Intentar crear el bucket público si no existe
    await supabase.storage.createBucket('public_assets', { public: true });

    const fileBuffer = fs.readFileSync('/home/edu/autamedica-vital-animated.svg');
    
    const { data, error } = await supabase.storage
        .from('public_assets')
        .upload('autamedica-vital-animated.svg', fileBuffer, {
            contentType: 'image/svg+xml',
            upsert: true
        });

    if (error) {
        console.error('Error al subir:', error);
    } else {
        const { data: urlData } = supabase.storage.from('public_assets').getPublicUrl('autamedica-vital-animated.svg');
        console.log('✅ Logo alojado en:', urlData.publicUrl);
    }
}
upload();
