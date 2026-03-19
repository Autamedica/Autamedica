import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const PASSWORD = 'PrescriptionE2E2026!'
const SCREENSHOT_DIR = path.resolve(__dirname, '../test-results')

test.describe('Patients medical history prescription integration', () => {
  test('muestra una prescripción real sembrada en BD dentro de historia clínica', async ({ page }) => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error('Faltan variables SUPABASE_* para ejecutar la prueba E2E real')
    }

    const email = `e2e.patient.prescription.${Date.now()}@autamedica.test`
    const medicationName = 'Atorvastatina E2E'
    const dosage = '20mg'
    const frequency = 'Una vez al día'

    const admin = createClient(supabaseUrl, serviceKey)
    const pub = createClient(supabaseUrl, anonKey)

    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'patient', portal: 'patients' },
    })

    if (created.error || !created.data.user) {
      throw new Error(`No se pudo crear el usuario E2E: ${created.error?.message}`)
    }

    const userId = created.data.user.id

    await admin.from('profiles').upsert(
      {
        id: userId,
        user_id: userId,
        email,
        full_name: 'Paciente E2E Prescripciones',
      },
      { onConflict: 'user_id' },
    )

    const patientResult = await admin
      .from('patients')
      .upsert({ user_id: userId, active: true }, { onConflict: 'user_id' })
      .select('id')
      .single()

    if (patientResult.error || !patientResult.data) {
      throw new Error(`No se pudo crear el paciente E2E: ${patientResult.error?.message}`)
    }

    const patientId = patientResult.data.id

    const prescriptionInsert = await admin
      .from('medical_records')
      .insert({
        patient_id: patientId,
        doctor_id: null,
        type: 'prescription',
        title: `Prescripción: ${medicationName}`,
        visibility: 'patient',
        date_recorded: new Date().toISOString(),
        content: {
          medication_name: medicationName,
          dosage,
          frequency,
          duration: '30 días',
          instructions: 'Tomar por la noche',
          status: 'activa',
          start_date: new Date().toISOString(),
          prescribed_date: new Date().toISOString(),
        },
      })
      .select('id')
      .single()

    if (prescriptionInsert.error || !prescriptionInsert.data) {
      throw new Error(`No se pudo crear la prescripción E2E: ${prescriptionInsert.error?.message}`)
    }

    const signed = await pub.auth.signInWithPassword({ email, password: PASSWORD })

    if (signed.error || !signed.data.session) {
      throw new Error(`No se pudo autenticar el usuario E2E: ${signed.error?.message}`)
    }

    const callbackUrl =
      `/auth/callback?access_token=${encodeURIComponent(signed.data.session.access_token)}` +
      `&refresh_token=${encodeURIComponent(signed.data.session.refresh_token)}` +
      `&returnTo=${encodeURIComponent('http://localhost:3002/medical-history')}`

    await page.goto(callbackUrl, { waitUntil: 'networkidle' })
    await page.waitForURL(/localhost:3002\/medical-history.*/, { timeout: 30_000 })

    const apiResponse = await page.request.get('/api/medical-history')
    expect(apiResponse.status()).toBe(200)
    const payload = await apiResponse.json()
    expect(payload?.success).toBe(true)
    expect(payload?.data?.summary?.active_medications_count).toBeGreaterThanOrEqual(1)

    await expect(page.getByRole('heading', { name: /Mi Historia Clínica/i })).toBeVisible()
    await expect(page.locator('body')).toContainText(medicationName)
    await expect(page.locator('body')).toContainText(dosage)
    await expect(page.locator('body')).toContainText(frequency)

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    const screenshotPath = path.join(SCREENSHOT_DIR, 'medical-history-prescription-e2e.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })
  })
})
