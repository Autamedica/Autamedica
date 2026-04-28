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

const DOCTOR_GABRIEL = '7bbdfe61-434a-4ed1-8dc5-663f48611f93'
const DOCTOR_LAILA = '1f8b9585-b559-414c-a756-2745c7c4e77e'

async function reassignPatients() {
  // 1. Fetch all patients with profiles
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, profile:profiles!inner(email, first_name, last_name)')
    .eq('active', true)

  if (error) {
    console.error('Error fetching patients:', error)
    return
  }

  // 2. Filter real patients
  const testKeywords = ['autamedica', 'test', 'demo', 'ecucondor', 'edu']
  const realPatients = patients.filter(p => {
    const email = p.profile?.email?.toLowerCase() || ''
    return !testKeywords.some(keyword => email.includes(keyword))
  })

  console.log(`Found ${realPatients.length} real patients.`)

  // 3. Shuffle (optional) or just split
  const half = Math.ceil(realPatients.length / 2)
  const group1 = realPatients.slice(0, half)
  const group2 = realPatients.slice(half)

  console.log(`Group 1 (Gabriel): ${group1.length} patients`)
  console.log(`Group 2 (Laila): ${group2.length} patients`)

  // 4. Update patient_care_team
  // First, remove them from any existing care team to avoid duplicates or multiple primary doctors if that's a constraint
  // In Autamedica, usually we want to ADD or REASSIGN.
  
  async function assign(group, doctorId) {
    for (const patient of group) {
      console.log(`Assigning ${patient.profile.email} to doctor ${doctorId}`)
      
      // Upsert into patient_care_team
      const { error: upsertError } = await supabase
        .from('patient_care_team')
        .upsert({
          patient_id: patient.id,
          doctor_id: doctorId,
          active: true,
          role: 'primary' // or whatever default role
        }, { onConflict: 'patient_id,doctor_id' })
      
      if (upsertError) {
        console.error(`Error assigning patient ${patient.id}:`, upsertError)
      }
    }
  }

  await assign(group1, DOCTOR_GABRIEL)
  await assign(group2, DOCTOR_LAILA)

  console.log('Reassignment complete!')
}

reassignPatients()
