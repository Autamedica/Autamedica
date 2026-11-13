import { expect, test } from '@playwright/test'

/**
 * The pharmacy intake is server-gated by a verified patient session.
 * This unauthenticated browser contract checks the access wall; authenticated
 * AR/BR request creation is covered by the API tests.
 */
test.describe('Pharmacy intake access control', () => {
  test('requires a verified patient session before rendering intake or calling dispatch', async ({ page }) => {
    let dispatchPosts = 0
    await page.route('**/api/pharmacy/dispatch/request', async (route) => {
      dispatchPosts += 1
      await route.abort()
    })

    await page.goto('/farmacia/solicitar')

    await expect(
      page.getByRole('heading', { name: 'Identifica tu cuenta para recibir atención' }),
    ).toBeVisible()

    await expect(
      page.getByRole('link', { name: 'Ingresar como paciente' }),
    ).toHaveAttribute('href', /\/auth\/login\?role=patient&returnTo=/)

    await expect(
      page.getByRole('heading', { name: /Consulta Exprés en Farmacia/ }),
    ).toHaveCount(0)
    expect(dispatchPosts).toBe(0)
  })
})
