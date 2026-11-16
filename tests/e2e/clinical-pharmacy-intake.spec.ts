import { expect, test, type Page } from '@playwright/test'

/**
 * Browser-level contract with a mocked API. No real doctor, patient, clinic,
 * clinical data, prescription provider, Supabase write, or videoconference.
 */
async function waitForPharmacyHydration(page: Page): Promise<void> {
  // Wait for the actual PharmacyExpressConsultation React island to hydrate.
  await page.waitForFunction(() => [...document.querySelectorAll('astro-island')].some(
    (island) => (
      island.getAttribute('component-export') === 'PharmacyExpressConsultation' ||
      island.getAttribute('component-url')?.includes('PharmacyExpressConsultation')
    ) && !island.hasAttribute('ssr'),
  ), null, { timeout: 15000 })
}

test.describe('Pharmacy intake AR/BR clinical country', () => {
  const cases = [
    { country: 'AR', countryLabel: 'Argentina', idLabel: 'DNI', nameLabel: 'Nombre y apellido', reasonOption: 'Dolor / malestar', submitLabel: 'Continuar',
      document: '38123456', phone: '+5491122223333', docField: 'patientDni', absentField: 'patientCpf' },
    { country: 'BR', countryLabel: 'Brasil', idLabel: 'CPF', nameLabel: 'Nome completo', reasonOption: 'Dor / mal-estar', submitLabel: 'Iniciar consulta',
      document: '11144477735', phone: '+5551999998888', docField: 'patientCpf', absentField: 'patientDni' },
  ] as const

  for (const c of cases) {
    test(`submits explicit ${c.country} with only its matching document and reaches waiting state`, async ({ page }) => {
      let receivedBody: Record<string, unknown> | null = null
      await page.route('**/api/pharmacy/dispatch/request', async (route) => {
        receivedBody = route.request().postDataJSON() as Record<string, unknown>
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              request: { id: '11111111-1111-4111-8111-111111111111', status: 'searching',
                care_country: c.country, cloudflare_room_id: 'cf-room-synthetic-ci' },
              cloudflare_room_id: 'cf-room-synthetic-ci',
              accessToken: 'synthetic-not-real-guest-token',
            },
          }),
        })
      })
      await page.route('**/api/pharmacy/dispatch/11111111-1111-4111-8111-111111111111**', async route => {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            success: true, data: { request: { status: 'searching',
              care_country: c.country, cloudflare_room_id: 'cf-room-synthetic-ci' }, doctor: null },
          }),
        })
      })

      await page.goto('/farmacia/solicitar')
      await waitForPharmacyHydration(page)
      await expect(page.getByRole('heading', { name: /Consulta médica/ })).toBeVisible()
      await page.getByText(c.countryLabel, { exact: true }).click()
      await expect(page.getByRole('radio', { name: c.countryLabel })).toBeChecked()
      await expect(page.getByRole('textbox', { name: c.idLabel })).toBeVisible({ timeout: 10000 })
      await page.getByRole('textbox', { name: c.idLabel }).fill(c.document)
      await page.getByLabel(c.nameLabel).fill('PACIENTE SINTETICO TEST')
      await page.getByLabel('WhatsApp').fill(c.phone)
      await page.getByRole('button', { name: c.reasonOption }).click()
      if (c.country === 'BR') await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: c.submitLabel }).click()
      await expect.poll(() => receivedBody !== null, { timeout: 10000 }).toBe(true)
      // The mocked API must be reached before any waiting-state assertion.
      await expect(page.getByText('Buscando médico')).toBeVisible({ timeout: 10000 })

      expect(receivedBody).not.toBeNull()
      const body = receivedBody as Record<string, unknown> | null
      expect(body?.careCountry).toBe(c.country)
      expect(body?.[c.docField]).toBe(c.document)
      expect(body?.[c.absentField]).toBeUndefined()
      expect(body?.patientName).toBe('PACIENTE SINTETICO TEST')
      expect(body?.patientPhone).toBe(c.phone)
      expect(body?.symptomSummary).toBe(c.reasonOption)
    })
  }

  test('blocks request until country is selected without calling any backend', async ({ page }) => {
    let postCount = 0
    await page.route('**/api/pharmacy/dispatch/request', async (route) => {
      postCount++
      await route.abort()
    })
    await page.goto('/farmacia/solicitar')
    await waitForPharmacyHydration(page)
    await expect(page.getByRole('heading', { name: /Consulta médica/ })).toBeVisible()
    await page.getByLabel('DNI').fill('38123456')
    await page.getByLabel('Nombre y apellido').fill('PACIENTE SINTETICO TEST')
    await page.getByLabel('WhatsApp').fill('+5491122223333')
    await page.getByRole('button', { name: 'Dolor / malestar' }).click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText('Buscando médico')).toHaveCount(0)
    expect(postCount).toBe(0)
  })
})
