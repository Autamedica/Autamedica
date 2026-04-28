import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.join(__dirname, '../apps/web/.env')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function auditNeglect() {
  console.log('🚀 Iniciando auditoría de pacientes desatendidos...')

  // 1. Buscar a Carlos Alvarez o médicos similares
  const { data: searchDoctors } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name, email')
    .or('first_name.ilike.%Carlos%,last_name.ilike.%Alvarez%')
    .eq('role', 'doctor')

  console.log('🔍 Médicos encontrados con ese nombre:', searchDoctors)

  // 2. Analizar asignaciones y últimas consultas
  const { data: doctors } = await supabase
    .from('doctors')
    .select(`
      id,
      user_id,
      profiles (first_name, last_name),
      patient_care_team (
        patient_id,
        patients (
          id,
          profiles (first_name, last_name)
        )
      )
    `)

  for (const doc of doctors || []) {
    const assignedPatients = doc.patient_care_team || []
    const totalAssigned = assignedPatients.length
    
    if (totalAssigned === 0) continue

    let neglectedCount = 0
    const neglectedDetails = []

    for (const teamItem of assignedPatients) {
      const patientId = teamItem.patient_id
      
      // Buscar última consulta completada
      const { data: lastAppt } = await supabase
        .from('appointments')
        .select('start_time')
        .eq('doctor_id', doc.id)
        .eq('patient_id', patientId)
        .eq('status', 'completed')
        .order('start_time', { ascending: false })
        .limit(1)

      const lastDate = lastAppt?.[0]?.start_time
      const daysSince = lastDate ? (new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24) : 999

      if (daysSince > 15) {
        neglectedCount++
        neglectedDetails.push({
          patient: `${teamItem.patients.profiles.first_name} ${teamItem.patients.profiles.last_name}`,
          days: Math.round(daysSince)
        })
      }
    }

    if (neglectedCount > 0) {
      console.log(`⚠️ Doctor: ${doc.profiles.first_name} ${doc.profiles.last_name}`)
      console.log(`   - Pacientes asignados: ${totalAssigned}`)
      console.log(`   - Pacientes desatendidos (>15 días): ${neglectedCount}`)
      console.log(`   - Detalles:`, neglectedDetails.slice(0, 3), neglectedCount > 3 ? '...' : '')
    }
  }
}

auditNeglect()
