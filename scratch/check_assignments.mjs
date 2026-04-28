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

async function checkCurrentDoctor() {
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, email')
    .eq('email', 'doctor.demo@autamedica.com')
    .single()

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', profile.user_id)
    .single()

  const { data: assignments } = await supabase
    .from('patient_care_team')
    .select('patient_id, patient:patients(profile:profiles(email, first_name, last_name))')
    .eq('doctor_id', doctor.id)
    .eq('active', true)

  console.log(`Current doctor has ${assignments?.length || 0} assigned patients.`)
  console.log('Assignments:', JSON.stringify(assignments, null, 2))
}

checkCurrentDoctor()
