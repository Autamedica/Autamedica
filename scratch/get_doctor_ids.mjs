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

async function getDoctorIds() {
  const { data: gabriel } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .ilike('first_name', '%Gabriel%')
    .eq('role', 'doctor')
    .single()

  const { data: laila } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .ilike('first_name', '%Layla%')
    .single()

  const { data: gabrielRecord } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', gabriel.user_id)
    .single()

  const { data: lailaRecord } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', laila.user_id)
    .single()

  console.log('Gabriel:', { ...gabriel, doctor_id: gabrielRecord.id })
  console.log('Laila:', { ...laila, doctor_id: lailaRecord.id })
}

getDoctorIds()
