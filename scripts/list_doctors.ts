import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/web/.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function listDoctors() {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name, role'); // using user_id as identifier

  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Profiles found:', data);
}

listDoctors();
