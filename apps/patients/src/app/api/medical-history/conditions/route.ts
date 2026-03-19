import { createRouteHandlerClient } from '@autamedica/auth/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolvePatientContext } from '../../shared/patient-context'

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient()
  const context = await resolvePatientContext(supabase)
  if (!context) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const condition = String(body?.condition || '').trim()
  const icd10_code = body?.icd10_code ? String(body.icd10_code).trim() : null
  const notes = body?.notes ? String(body.notes).trim() : null

  if (!condition) return NextResponse.json({ error: 'condition requerido' }, { status: 400 })

  const { data, error } = await (supabase as any)
    .from('medical_records')
    .insert([{
      patient_id: context.patientId,
      type: 'diagnosis',
      title: condition,
      content: {
        condition,
        icd10_code,
        notes,
        status: 'active'
      },
      visibility: 'private'
    }])
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, data }, { status: 201 })
}
