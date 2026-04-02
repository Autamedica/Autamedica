import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/web/.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('--- Diagnosis: Total Doctors Count ---');
  
  // Count all doctors
  const { count, error } = await supabase.from('doctors').select('*', { count: 'exact', head: true });
  if (error) console.error('Error counting doctors:', error);
  else console.log('Total doctors in platform:', count);
}

diagnose();
