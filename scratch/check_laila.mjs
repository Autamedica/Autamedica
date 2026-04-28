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

async function checkLaylaDoctor() {
  const userId = '44b88122-cf5d-4180-bf56-6bff25b2a8d0'
  const { data: doctor, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  console.log('Doctor record for Layla:', JSON.stringify(doctor, null, 2))
}

checkLaylaDoctor()
