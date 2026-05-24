import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function upload() {
    const fileBuffer = fs.readFileSync('/home/edu/autamedica-vital-pro.gif');
    await supabase.storage.from('public_assets').upload('autamedica-vital-pro.gif', fileBuffer, { contentType: 'image/gif', upsert: true });
    const { data: urlData } = supabase.storage.from('public_assets').getPublicUrl('autamedica-vital-pro.gif');
    console.log('✅ URL Logo Pro:', urlData.publicUrl);
}
upload();
