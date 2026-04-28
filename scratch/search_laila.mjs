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

async function searchLaila() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name, email, role')
    .or('first_name.ilike.%lail%,first_name.ilike.%layl%,first_name.ilike.%leil%,email.ilike.%lail%,email.ilike.%layl%,email.ilike.%leil%')
  
  if (error) {
    console.error('Error fetching profiles:', error)
    return
  }

  console.log('Search Results:', JSON.stringify(profiles, null, 2))
}

searchLaila()
