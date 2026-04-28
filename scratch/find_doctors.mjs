import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPaths = [
  path.join(__dirname, '../apps/web/.env'),
  path.join(__dirname, '../apps/web/.env.local')
]

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
  }
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function findSpecificDoctors() {
  const { data: doctors, error } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name, email, role')
    .or('first_name.ilike.%Gabriel%,first_name.ilike.%Laila%,email.ilike.%gabriel%,email.ilike.%laila%')
    .eq('role', 'doctor')
  
  if (error) {
    console.error('Error fetching doctors:', error)
    return
  }

  const { data: doctorRecords } = await supabase
    .from('doctors')
    .select('id, user_id')

  const merged = doctors.map(d => ({
    name: `${d.first_name} ${d.last_name}`,
    email: d.email,
    user_id: d.user_id,
    doctor_record_id: doctorRecords?.find(dr => dr.user_id === d.user_id)?.id
  }))

  console.log('Result:', JSON.stringify(merged, null, 2))
}

findSpecificDoctors()
