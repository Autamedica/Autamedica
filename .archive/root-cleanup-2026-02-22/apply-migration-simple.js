#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://knywotiidsydsaveqkjs.supabase.co'
const supabaseKey = 'REPLACE_WITH_ROTATED_KEY.DeEm08k7QOrKObWaz8AUaOB5N6Z2QZhZHFaUf2siALA'

async function applyMigrationStepByStep() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  console.log('🚀 Aplicando migración paso a paso...')

  // Paso 1: Test de función create_call (para ver si ya existe)
  console.log('1️⃣ Probando si create_call ya existe...')
  const { data: testExisting, error: testError } = await supabase
    .rpc('create_call', {
      p_doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      p_patient_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12'
    })

  if (!testError) {
    console.log('✅ create_call ya existe y funciona!')
    console.log('   Resultado:', testExisting)
    return true
  }

  console.log('   create_call no existe:', testError.message)

  // Paso 2: Crear tabla calls si no existe
  console.log('2️⃣ Verificando tabla calls...')
  const { data: _callsCheck, error: callsError } = await supabase
    .from('calls')
    .select('count')
    .limit(1)

  if (callsError && callsError.code === '42P01') {
    console.log('   Tabla calls no existe, necesitamos aplicar migración manual')
  } else if (!callsError) {
    console.log('✅ Tabla calls ya existe')
  }

  // Paso 3: Test simple para ver permisos
  console.log('3️⃣ Probando permisos básicos...')
  const { data: _basicTest, error: basicError } = await supabase
    .from('_realtime_schema_versions')
    .select('*')
    .limit(1)

  if (basicError) {
    console.log('   Permisos limitados:', basicError.message)
  } else {
    console.log('✅ Permisos básicos funcionan')
  }

  console.log('')
  console.log('🚨 DIAGNOSIS: La migración debe aplicarse manualmente')
  console.log('💡 SOLUTION: Usar el SQL Editor de Supabase')
  console.log('')
  console.log('📋 PASOS MANUAL:')
  console.log('1. Abrir: https://supabase.com/dashboard/project/knywotiidsydsaveqkjs/sql/new')
  console.log('2. Copiar todo el contenido de: apply-migration-direct.sql')
  console.log('3. Pegar en el editor y hacer click en "Run"')
  console.log('4. Verificar que muestre: "Migración completada exitosamente!"')
  console.log('')

  return false
}

async function main() {
  const success = await applyMigrationStepByStep()

  if (success) {
    console.log('🎉 Sistema completamente funcional!')
  } else {
    console.log('⚠️  Migración manual requerida - seguir pasos arriba.')
    process.exit(1)
  }
}

main().catch(console.error)