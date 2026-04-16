import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function upload() {
    const fileBuffer = fs.readFileSync('/home/edu/autamedica-scan-style.gif');
    await supabase.storage.from('public_assets').upload('autamedica-scan-style.gif', fileBuffer, { contentType: 'image/gif', upsert: true });
    const { data: urlData } = supabase.storage.from('public_assets').getPublicUrl('autamedica-scan-style.gif');
    console.log('✅ URL Estilo Scan:', urlData.publicUrl);
}
upload();
