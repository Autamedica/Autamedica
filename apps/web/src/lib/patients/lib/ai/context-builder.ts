/* eslint-disable */
// @ts-nocheck
import { createAdminClient } from '@autamedica/auth/server'
import type { AppSupabaseClient } from '@autamedica/supabase-client'

export type PatientContextSummary = {
  name: string | null
  email: string | null
  role: string | null
  portal: string | null
  gender: string | null
  bloodType: string | null
  heightCm: number | null
  weightKg: number | null
  birthDate: string | null
}

/** Safely extract a string field from an unknown record */
function getString(obj: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!obj) return null
  const val = obj[key]
  return typeof val === 'string' ? val : null
}

/** Safely extract a number field from an unknown record */
function getNumber(obj: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!obj) return null
  const val = obj[key]
  return typeof val === 'number' ? val : null
}

// getAdminClient is now a wrapper around the standardized factory
export async function getAdminClient(): Promise<AppSupabaseClient> {
  return createAdminClient() as unknown as AppSupabaseClient;
}

export async function buildPatientContext(userId: string, admin?: AppSupabaseClient) {
  const client = admin ?? (await getAdminClient())
  const [{ data: profile }, { data: patient }] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    client.from('patients').select('*').eq('user_id', userId).maybeSingle(),
  ])

  // Cast Supabase rows to generic records for safe field access
  const p = profile as Record<string, unknown> | null
  const pt = patient as Record<string, unknown> | null

  const fullName = getString(p, 'full_name')
  const firstName = getString(p, 'first_name')
  const lastName = getString(p, 'last_name')
  const derivedName = fullName ?? ([firstName, lastName].filter(Boolean).join(' ').trim() || null)

  const summary: PatientContextSummary = {
    name: derivedName,
    email: getString(p, 'email'),
    role: getString(p, 'role') ?? 'patient',
    portal: getString(p, 'portal') ?? 'patients',
    gender: getString(pt, 'gender'),
    bloodType: getString(pt, 'blood_type'),
    heightCm: getNumber(pt, 'height_cm'),
    weightKg: getNumber(pt, 'weight_kg'),
    birthDate: getString(pt, 'birth_date'),
  }

  return { profile, patient, summary }
}

export async function persistPatientContextFiles(userId: string, data: { profile: unknown; patient: unknown; summary: PatientContextSummary }, admin?: AppSupabaseClient) {
  const client = admin ?? (await getAdminClient())
  const BUCKET = 'patient-files'

  const profileJson = Buffer.from(JSON.stringify(data.profile ?? {}, null, 2), 'utf8')
  const patientJson = Buffer.from(JSON.stringify(data.patient ?? {}, null, 2), 'utf8')
  const contextJson = Buffer.from(JSON.stringify(data.summary, null, 2), 'utf8')
  const summaryMd = Buffer.from(
    `# Resumen del Paciente\n\n` +
    `- Nombre: ${data.summary.name ?? '—'}\n` +
    `- Email: ${data.summary.email ?? '—'}\n` +
    `- Rol: ${data.summary.role ?? '—'}\n` +
    `- Género: ${data.summary.gender ?? '—'}\n` +
    `- Grupo sanguíneo: ${data.summary.bloodType ?? '—'}\n` +
    `- Altura (cm): ${data.summary.heightCm ?? '—'}\n` +
    `- Peso (kg): ${data.summary.weightKg ?? '—'}\n` +
    `- Fecha de nacimiento: ${data.summary.birthDate ?? '—'}\n`,
    'utf8',
  )

  const uploads: Array<Promise<unknown>> = []
  uploads.push(
    client.storage.from(BUCKET).upload(`${userId}/profile.json`, profileJson, { contentType: 'application/json', upsert: true }),
  )
  uploads.push(
    client.storage.from(BUCKET).upload(`${userId}/patient.json`, patientJson, { contentType: 'application/json', upsert: true }),
  )
  uploads.push(
    client.storage.from(BUCKET).upload(`${userId}/context.json`, contextJson, { contentType: 'application/json', upsert: true }),
  )
  uploads.push(
    client.storage.from(BUCKET).upload(`${userId}/summary.md`, summaryMd, { contentType: 'text/markdown; charset=utf-8', upsert: true }),
  )

  await Promise.allSettled(uploads)

  return {
    bucket: BUCKET,
    paths: {
      profile: `${userId}/profile.json`,
      patient: `${userId}/patient.json`,
      context: `${userId}/context.json`,
      summary: `${userId}/summary.md`,
    },
  }
}
