import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const PASSWORD = 'PatientE2E2026!';
const SCREENSHOT_DIR = path.resolve(__dirname, '../test-results');
const SEEDED_SYMPTOM = 'Dolor torácico de prueba E2E';

test.describe('Patients anamnesis DB integration', () => {
  test('frontend autenticado consulta anamnesis real desde la base', async ({ page }) => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error('Faltan variables SUPABASE_* para ejecutar la prueba E2E real');
    }

    const email = `e2e.patient.anamnesis.${Date.now()}@autamedica.test`;
    const admin = createClient(supabaseUrl, serviceKey);
    const pub = createClient(supabaseUrl, anonKey);

    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'patient', portal: 'patients' },
    });

    if (created.error || !created.data.user) {
      throw new Error(`No se pudo crear el usuario E2E: ${created.error?.message}`);
    }

    const userId = created.data.user.id;

    await admin
      .from('profiles')
      .upsert(
        {
          id: userId,
          user_id: userId,
          email,
          full_name: 'Paciente E2E Anamnesis',
        },
        { onConflict: 'user_id' },
      );

    const patientResult = await admin
      .from('patients')
      .upsert({ user_id: userId, active: true }, { onConflict: 'user_id' })
      .select('id')
      .single();

    if (patientResult.error || !patientResult.data) {
      throw new Error(`No se pudo crear el paciente E2E: ${patientResult.error?.message}`);
    }

    const patientId = patientResult.data.id;

    const anamnesisResult = await admin
      .from('anamnesis')
      .insert({
        patient_id: patientId,
        status: 'in_progress',
        completion_percentage: 8,
        privacy_accepted: true,
        terms_accepted: true,
        sections_status: { completed: ['motivo_consulta'] },
      })
      .select('id')
      .single();

    if (anamnesisResult.error || !anamnesisResult.data) {
      throw new Error(`No se pudo crear la anamnesis E2E: ${anamnesisResult.error?.message}`);
    }

    const anamnesisId = anamnesisResult.data.id;

    const sectionResult = await admin.from('anamnesis_sections').upsert(
      {
        anamnesis_id: anamnesisId,
        section: 'motivo_consulta',
        data: {
          sintoma_principal: SEEDED_SYMPTOM,
          cuando_empezo: '2-7dias',
          intensidad_sintoma: 6,
        },
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'anamnesis_id,section' },
    );

    if (sectionResult.error) {
      throw new Error(`No se pudo sembrar la sección E2E: ${sectionResult.error.message}`);
    }

    const signed = await pub.auth.signInWithPassword({ email, password: PASSWORD });
    if (signed.error || !signed.data.session) {
      throw new Error(`No se pudo autenticar el usuario E2E: ${signed.error?.message}`);
    }

    const callbackUrl =
      `/auth/callback?access_token=${encodeURIComponent(signed.data.session.access_token)}` +
      `&refresh_token=${encodeURIComponent(signed.data.session.refresh_token)}` +
      `&returnTo=${encodeURIComponent('http://localhost:3002/anamnesis')}`;

    await page.goto(callbackUrl, { waitUntil: 'networkidle' });
    await page.waitForURL(/localhost:3002\/.*/, { timeout: 30_000 });

    const apiResponse = await page.goto('/api/anamnesis', { waitUntil: 'networkidle' });
    expect(apiResponse?.status(), 'La navegación autenticada al endpoint debería responder 200').toBe(200);
    await expect(page.locator('body')).toContainText(SEEDED_SYMPTOM);

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const apiScreenshot = path.join(SCREENSHOT_DIR, 'anamnesis-api-e2e.png');
    await page.screenshot({ path: apiScreenshot, fullPage: true });

    await page.goto('/anamnesis', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /Tu Historia Clínica/i })).toBeVisible();
    const uiScreenshot = path.join(SCREENSHOT_DIR, 'anamnesis-ui-e2e.png');
    await page.screenshot({ path: uiScreenshot, fullPage: true });
  });
});
