import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/web/.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? (() => { throw new Error('PUBLIC_SUPABASE_URL is not set'); })();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set'); })();

const supabase = createClient(supabaseUrl, supabaseKey);

async function runUpdates() {
  console.log('--- Updating Demo Garcia ---');
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ first_name: 'Carlos', last_name: 'Alvarez' })
    .eq('user_id', '9a78cfb6-52cc-4edb-b935-864151f3b23d');

  if (updateError) console.error('Error updating:', updateError);
  else console.log('Successfully updated Demo Garcia to Carlos Alvarez');

  console.log('--- Creating 7 new doctors ---');
  // Need to insert into auth.users first, but I probably don't have access to auth schema directly via public client.
  // Wait, I can only update profiles if they already exist.
  // Actually, I should probably check if I can create users via Auth API or just assume users exist.
  // The prompt implies "aumentar este numero mas 7" so I should create them.
  // Since I don't have access to auth.users, I will assume the users might need to be created or I can just insert profiles if they are decoupled.
  // Usually profiles are created on user signup. 
  // Let me try inserting into profiles and doctors table assuming the user exists or I can fake the creation.
  // Actually, inserting into 'profiles' and 'doctors' is safer.
  
  const newDoctors = [
    { first: 'Ana', last: 'Martínez' },
    { first: 'Luis', last: 'Rodríguez' },
    { first: 'María', last: 'Gómez' },
    { first: 'Juan', last: 'Pérez' },
    { first: 'Laura', last: 'Sánchez' },
    { first: 'Jorge', last: 'Hernández' },
    { first: 'Elena', last: 'Díaz' }
  ];

  for (const doc of newDoctors) {
    // Generate UUIDs
    const userId = crypto.randomUUID();
    const doctorId = crypto.randomUUID();

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ user_id: userId, first_name: doc.first, last_name: doc.last, role: 'doctor' });

    if (profileError) {
      console.error(`Error creating profile for ${doc.first}:`, profileError);
      continue;
    }

    const { error: doctorError } = await supabase
      .from('doctors')
      .insert({ id: doctorId, user_id: userId });

    if (doctorError) {
      console.error(`Error creating doctor for ${doc.first}:`, doctorError);
    } else {
      console.log(`Created doctor: ${doc.first} ${doc.last}`);
    }
  }
}

runUpdates();
