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

// getAdminClient is now a wrapper around the standardized factory
export async function getAdminClient(): Promise<AppSupabaseClient> {
  return createAdminClient() as unknown as AppSupabaseClient;
}

export async function buildPatientContext(userId: string, admin?: AppSupabaseClient) {
  const client = admin ?? (await getAdminClient())
  const [{ data: profile }, { data: patient }]: [any, any] = await Promise.all([
    (client as any).from('profiles').select('*').eq('id', userId).maybeSingle(),
    (client as any).from('patients').select('*').eq('user_id', userId).maybeSingle(),
  ])

  const summary: PatientContextSummary = {
    name: ([profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()) || null,
    email: (profile?.email as any) ?? null,
    role: (profile?.role as any) ?? 'patient',
    portal: ((profile as any)?.portal) ?? 'patients',
    gender: (patient?.gender as any) ?? null,
    bloodType: (patient?.blood_type as any) ?? null,
    heightCm: (patient?.height_cm as any) ?? null,
    weightKg: (patient?.weight_kg as any) ?? null,
    birthDate: (patient?.birth_date as any) ?? null,
  }

  return { profile, patient, summary }
}

export async function persistPatientContextFiles(userId: string, data: { profile: any; patient: any; summary: PatientContextSummary }, admin?: AppSupabaseClient) {
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

  const uploads: Array<Promise<any>> = []
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
