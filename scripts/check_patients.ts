import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/web/.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? (() => { throw new Error('PUBLIC_SUPABASE_URL is not set'); })();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set'); })();

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('--- Diagnosis: Total Doctors Count ---');
  
  // Count all doctors
  const { count, error } = await supabase.from('doctors').select('*', { count: 'exact', head: true });
  if (error) console.error('Error counting doctors:', error);
  else console.log('Total doctors in platform:', count);
}

diagnose();
