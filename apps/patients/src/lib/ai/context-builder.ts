import { createAdminClient } from '@autamedica/auth/server'

type AdminClient = ReturnType<typeof createAdminClient>

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

type SupabaseRow = Record<string, unknown>

export async function getAdminClient(): Promise<AdminClient> {
  return createAdminClient()
}

export async function buildPatientContext(userId: string, admin?: AdminClient) {
  const client = admin ?? (await getAdminClient())
  const [{ data: profile }, { data: patient }] = await Promise.all([
    client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    client.from('patients').select('*').eq('user_id', userId).maybeSingle(),
  ])

  const p = profile as SupabaseRow | null
  const pt = patient as SupabaseRow | null

  const summary: PatientContextSummary = {
    name: ([p?.first_name, p?.last_name].filter(Boolean).join(' ').trim()) || null,
    email: (p?.email as string | null) ?? null,
    role: (p?.role as string | null) ?? 'patient',
    portal: (p?.portal as string | null) ?? 'patients',
    gender: (pt?.gender as string | null) ?? null,
    bloodType: (pt?.blood_type as string | null) ?? null,
    heightCm: (pt?.height_cm as number | null) ?? null,
    weightKg: (pt?.weight_kg as number | null) ?? null,
    birthDate: (pt?.birth_date as string | null) ?? null,
  }

  return { profile: p, patient: pt, summary }
}

export async function persistPatientContextFiles(
  userId: string,
  data: { profile: SupabaseRow | null; patient: SupabaseRow | null; summary: PatientContextSummary },
  admin?: AdminClient,
) {
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
