import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  throw new Error('Missing Supabase Service Role Key');
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function upload() {
    console.log('☁️  Subiendo assets a Supabase Storage...');
    
    // 1. Intentar crear el bucket público si no existe
    await supabase.storage.createBucket('public_assets', { public: true });

    const fileBuffer = fs.readFileSync('/home/edu/autamedica-vital-animated.svg');
    
    const { error } = await supabase.storage
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
