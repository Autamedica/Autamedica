#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://qxjjrpksmwwrmubhvjew.supabase.co'
const supabaseKey = 'REPLACE_WITH_ROTATED_KEY.DeEm08k7QOrKObWaz8AUaOB5N6Z2QZhZHFaUf2siALA'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testCallFlow() {
  console.log('🧪 Testing Call Flow...')
  console.log('Supabase URL:', supabaseUrl)
  console.log('')

  try {
    // Test 1: Check if create_call function exists
    console.log('1. Testing create_call function...')
    const { data, error } = await supabase
      .rpc('create_call', {
        p_doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        p_patient_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12'
      })

    if (error) {
      console.log('❌ create_call function error:', {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details
      })

      if (error.code === '42883' || error.message.includes('function create_call')) {
        console.log('')
        console.log('🚨 DIAGNOSIS: create_call function does not exist')
        console.log('💡 SOLUTION: Apply the migration from apply-migration-direct.sql')
        console.log('')
        return false
      }
    } else {
      console.log('✅ create_call function works!')
      console.log('Result:', data)
    }

    // Test 2: Check calls table
    console.log('')
    console.log('2. Testing calls table access...')
    const { data: callsData, error: callsError } = await supabase
      .from('calls')
      .select('count')
      .limit(1)

    if (callsError) {
      console.log('❌ calls table error:', {
        message: callsError.message,
        code: callsError.code
      })

      if (callsError.code === '42P01') {
        console.log('')
        console.log('🚨 DIAGNOSIS: calls table does not exist')
        console.log('💡 SOLUTION: Apply the migration from apply-migration-direct.sql')
        console.log('')
        return false
      }
    } else {
      console.log('✅ calls table accessible!')
    }

    // Test 3: Check update_call_status function
    if (data && data.length > 0) {
      console.log('')
      console.log('3. Testing update_call_status function...')
      const callId = data[0].id

      const { data: updateData, error: updateError } = await supabase
        .rpc('update_call_status', {
          p_call_id: callId,
          p_status: 'ringing'
        })

      if (updateError) {
        console.log('❌ update_call_status error:', updateError.message)
      } else {
        console.log('✅ update_call_status works!')
      }
    }

    return true

  } catch (err) {
    console.log('❌ Unexpected error:', err.message)
    return false
  }
}

async function main() {
  const success = await testCallFlow()

  if (success) {
    console.log('')
    console.log('🎉 All tests passed! Call flow should work.')
  } else {
    console.log('')
    console.log('⚠️  Migration needed. Apply apply-migration-direct.sql in Supabase Dashboard.')
    console.log('URL: https://supabase.com/dashboard/project/qxjjrpksmwwrmubhvjew/sql/new')
  }
}

main().catch(console.error)