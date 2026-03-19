import { createRouteHandlerClient } from '@autamedica/auth/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolvePatientContext } from '../../shared/patient-context'

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient()
  const context = await resolvePatientContext(supabase)
  if (!context) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await request.json().catch(() => ({}))

  const allergen = String(body?.allergen || '').trim()
  if (!allergen) return NextResponse.json({ error: 'allergen requerido' }, { status: 400 })

  const type = body?.type ? String(body.type).trim() : null
  const severity = body?.severity ? String(body.severity).trim() : null
  const reaction = body?.reaction ? String(body.reaction).trim() : null
  const notes = body?.notes ? String(body.notes).trim() : null

  const { data, error } = await supabase
    .from('medical_records')
    .insert([{
      patient_id: context.patientId,
      type: 'allergy',
      title: `Alergia: ${allergen}`,
      content: {
        allergen,
        allergy_type: type,
        severity,
        reaction,
        notes,
        status: 'active'
      },
      visibility: 'shared'
    }])
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, data }, { status: 201 })
}
