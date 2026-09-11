import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

export const CANONICAL_SECTIONS = [
  'edad',
  'ocupacion',
  'motivo_consulta',
  'enfermedades_previas',
  'medicamentos',
  'alergias',
  'antecedentes_familiares',
  'habitos',
  'cardiovascular',
  'respiratorio',
  'digestivo',
  'genitourinario',
  'resumen_final',
] as const

interface PatientRow {
  id: string
  user_id: string
  birth_date?: string | null
  gender?: string | null
  dni?: string | null
}

interface ProfileRow {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
}

interface AnamnesisRow {
  id: string
  patient_id: string
  status: string
  completion_percentage: number
  sections_status: Record<string, unknown>
  locked: boolean
  created_at: string
  updated_at: string
  completed_at?: string | null
}

function calculateAge(birthDateStr?: string | null): number | null {
  if (!birthDateStr) return null
  const birthDate = new Date(birthDateStr)
  if (isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age >= 0 ? age : null
}

export async function handler(req: Request): Promise<Response> {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('[patients-anamnesis] Server misconfigured: missing Supabase env vars')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Authenticate user from JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Admin client for privileged, secure DB access
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })

    // 3. Resolve or create patient
    let { data: patient, error: patientError } = await adminClient
      .from('patients')
      .select('id, user_id, birth_date, gender, dni')
      .eq('user_id', user.id)
      .maybeSingle()

    if (patientError) {
      console.error('[patients-anamnesis] Error fetching patient row:', patientError)
      return new Response(
        JSON.stringify({ error: 'Error fetching patient profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let activePatient: PatientRow
    if (!patient) {
      const { data: newPatient, error: createPatientError } = await adminClient
        .from('patients')
        .upsert({ user_id: user.id, active: true }, { onConflict: 'user_id' })
        .select('id, user_id, birth_date, gender, dni')
        .single()

      if (createPatientError || !newPatient) {
        console.error('[patients-anamnesis] Failed auto-creating patient:', createPatientError)
        return new Response(
          JSON.stringify({ error: 'Failed creating patient record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      activePatient = newPatient as unknown as PatientRow
    } else {
      activePatient = patient as unknown as PatientRow
    }

    const patientId = activePatient.id

    // Fetch profile for preloading
    const { data: profile } = await adminClient
      .from('profiles')
      .select('first_name, last_name, phone, email')
      .eq('user_id', user.id)
      .maybeSingle()

    const age = calculateAge(activePatient.birth_date)
    const preload = {
      firstName: (profile as ProfileRow | null)?.first_name || '',
      lastName: (profile as ProfileRow | null)?.last_name || '',
      phone: (profile as ProfileRow | null)?.phone || '',
      email: (profile as ProfileRow | null)?.email || user.email || '',
      birthDate: activePatient.birth_date || '',
      gender: activePatient.gender || '',
      dni: activePatient.dni || '',
      age: age != null ? age.toString() : '',
    }

    // 4. Ensure Anamnesis record exists
    let { data: anamnesis, error: anamnesisError } = await adminClient
      .from('anamnesis')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (anamnesisError) {
      console.error('[patients-anamnesis] Error fetching anamnesis:', anamnesisError)
      return new Response(
        JSON.stringify({ error: 'Failed fetching anamnesis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!anamnesis) {
      const defaultStatus: Record<string, string> = {}
      for (const sec of CANONICAL_SECTIONS) {
        defaultStatus[sec] = 'pending'
      }

      const { data: newAnamnesis, error: createAnamnesisError } = await adminClient
        .from('anamnesis')
        .insert({
          patient_id: patientId,
          status: 'in_progress',
          completion_percentage: 0,
          sections_status: defaultStatus,
          locked: false,
        })
        .select('*')
        .single()

      if (createAnamnesisError || !newAnamnesis) {
        console.error('[patients-anamnesis] Failed creating anamnesis:', createAnamnesisError)
        return new Response(
          JSON.stringify({ error: 'Failed creating anamnesis' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      anamnesis = newAnamnesis as AnamnesisRow

      // Pre-create sections in DB
      const sectionInserts = CANONICAL_SECTIONS.map((sec) => ({
        anamnesis_id: anamnesis.id,
        section: sec,
        data: {},
        completed: false,
      }))
      await adminClient.from('anamnesis_sections').insert(sectionInserts)
    }

    // 5. Route actions based on Method & Body
    const url = new URL(req.url)
    const actionQuery = url.searchParams.get('action')

    let bodyAction: string | null = null
    let bodyPayload: Record<string, unknown> = {}

    if (req.method === 'POST') {
      try {
        bodyPayload = await req.json()
        bodyAction = (bodyPayload.action as string) || actionQuery
      } catch {
        bodyAction = actionQuery
      }
    }

    // ACTION: SAVE_SECTION
    if (req.method === 'POST' && (bodyAction === 'save_section' || bodyAction === 'saveSection')) {
      if (anamnesis.locked || anamnesis.status === 'under_review' || anamnesis.status === 'approved') {
        return new Response(
          JSON.stringify({ error: 'Anamnesis is locked and cannot be edited' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const sectionName = bodyPayload.section as string
      if (!sectionName || !CANONICAL_SECTIONS.includes(sectionName as typeof CANONICAL_SECTIONS[number])) {
        return new Response(
          JSON.stringify({ error: 'Invalid or missing section name' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const data = (bodyPayload.data as Record<string, unknown>) || {}
      const completed = bodyPayload.completed === true

      const now = new Date().toISOString()

      // Upsert section
      const { data: updatedSection, error: updateSecError } = await adminClient
        .from('anamnesis_sections')
        .upsert(
          {
            anamnesis_id: anamnesis.id,
            section: sectionName,
            data,
            completed,
            completed_at: completed ? now : null,
            updated_at: now,
          },
          { onConflict: 'anamnesis_id,section' }
        )
        .select('*')
        .single()

      if (updateSecError) {
        console.error('[patients-anamnesis] Failed saving section:', updateSecError)
        return new Response(
          JSON.stringify({ error: 'Failed saving section data' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Re-calculate completion percentage
      const { data: allSections } = await adminClient
        .from('anamnesis_sections')
        .select('section, completed')
        .eq('anamnesis_id', anamnesis.id)

      const completedCount = (allSections || []).filter((s) => s.completed).length
      const totalCount = CANONICAL_SECTIONS.length
      const percentage = Math.round((completedCount / totalCount) * 100)

      const sectionsStatus = (anamnesis.sections_status as Record<string, string>) || {}
      sectionsStatus[sectionName] = completed ? 'completed' : 'in_progress'

      await adminClient
        .from('anamnesis')
        .update({
          completion_percentage: percentage,
          sections_status: sectionsStatus,
          updated_at: now,
        })
        .eq('id', anamnesis.id)

      return new Response(
        JSON.stringify({
          success: true,
          section: updatedSection,
          completionPercentage: percentage,
          completedSectionsCount: completedCount,
          totalSections: totalCount,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: SUBMIT
    if (req.method === 'POST' && bodyAction === 'submit') {
      if (anamnesis.locked || anamnesis.status === 'under_review' || anamnesis.status === 'approved') {
        return new Response(
          JSON.stringify({ error: 'Anamnesis already submitted or locked' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Fetch all sections to create snapshot
      const { data: sections } = await adminClient
        .from('anamnesis_sections')
        .select('*')
        .eq('anamnesis_id', anamnesis.id)

      const now = new Date().toISOString()

      // Determine next version number
      const { data: lastVersion } = await adminClient
        .from('anamnesis_versions')
        .select('version_number')
        .eq('anamnesis_id', anamnesis.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersionNumber = ((lastVersion as { version_number: number } | null)?.version_number || 0) + 1

      // Insert version snapshot (Ley 26.529 legal audit)
      await adminClient
        .from('anamnesis_versions')
        .insert({
          anamnesis_id: anamnesis.id,
          patient_id: patientId,
          version_number: nextVersionNumber,
          trigger: nextVersionNumber === 1 ? 'initial' : 'update',
          sections_snapshot: sections || [],
          created_at: now,
        })

      // Lock anamnesis
      const { data: submittedAnamnesis, error: submitError } = await adminClient
        .from('anamnesis')
        .update({
          status: 'under_review',
          locked: true,
          completion_percentage: 100,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', anamnesis.id)
        .select('*')
        .single()

      if (submitError) {
        console.error('[patients-anamnesis] Error locking anamnesis:', submitError)
        return new Response(
          JSON.stringify({ error: 'Failed submitting anamnesis' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          anamnesis: submittedAnamnesis,
          versionNumber: nextVersionNumber,
          message: 'Anamnesis enviada correctamente y sellada para revisión médica.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // DEFAULT (GET): Return full snapshot
    const { data: sections } = await adminClient
      .from('anamnesis_sections')
      .select('*')
      .eq('anamnesis_id', anamnesis.id)

    // Sort by canonical order
    const sortedSections = (sections || []).sort((a, b) => {
      const idxA = CANONICAL_SECTIONS.indexOf(a.section as typeof CANONICAL_SECTIONS[number])
      const idxB = CANONICAL_SECTIONS.indexOf(b.section as typeof CANONICAL_SECTIONS[number])
      return (idxA >= 0 ? idxA : 999) - (idxB >= 0 ? idxB : 999)
    })

    const completedSectionsCount = sortedSections.filter((s) => s.completed).length

    return new Response(
      JSON.stringify({
        anamnesis: {
          id: anamnesis.id,
          patientId: anamnesis.patient_id,
          status: anamnesis.status,
          completionPercentage: anamnesis.completion_percentage,
          locked: anamnesis.locked,
          createdAt: anamnesis.created_at,
          updatedAt: anamnesis.updated_at,
          completedAt: anamnesis.completed_at,
          totalSections: CANONICAL_SECTIONS.length,
          completedSectionsCount,
        },
        sections: sortedSections.map((s) => ({
          id: s.id,
          anamnesisId: s.anamnesis_id,
          section: s.section,
          data: s.data || {},
          completed: s.completed,
          completedAt: s.completed_at,
          updatedAt: s.updated_at,
        })),
        preload,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[patients-anamnesis] Unhandled exception:', message)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

Deno.serve(handler)
