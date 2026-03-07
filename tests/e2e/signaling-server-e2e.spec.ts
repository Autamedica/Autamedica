/**
 * E2E Test: WebRTC Signaling Server
 *
 * Tests the full signaling flow using two browser contexts (doctor + patient)
 * connecting to the production test-call pages via the deployed signaling server.
 *
 * Artifacts: generated-docs/patchright-signaling
 * Requires: patchright install chromium
 * Run: pnpm test:signaling-e2e
 */
import { test, expect, type Browser, type Page, type TestInfo } from 'patchright/test'

const DOCTOR_URL = process.env.DOCTOR_URL || 'https://autamedica-doctors.pages.dev'
const PATIENT_URL = process.env.PATIENT_URL || 'https://autamedica-patients.pages.dev'

const ROOM_ID = `e2e-test-${Date.now()}`

type PageDiagnostics = {
  label: string
  consoleMessages: Array<{ type: string; text: string; location: string }>
  pageErrors: string[]
  requestFailures: Array<{ method: string; url: string; errorText: string }>
}

function createPageDiagnostics(label: string): PageDiagnostics {
  return {
    label,
    consoleMessages: [],
    pageErrors: [],
    requestFailures: [],
  }
}

function formatLocation(location: { url?: string; lineNumber?: number; columnNumber?: number }): string {
  const url = location.url || 'unknown'
  const line = typeof location.lineNumber === 'number' ? location.lineNumber + 1 : 0
  const column = typeof location.columnNumber === 'number' ? location.columnNumber + 1 : 0
  return line > 0 ? `${url}:${line}:${column}` : url
}

function attachDiagnosticsListeners(page: Page, diagnostics: PageDiagnostics): void {
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') {
      return
    }

    diagnostics.consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: formatLocation(message.location()),
    })
  })

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.stack || error.message)
  })

  page.on('requestfailed', (request) => {
    diagnostics.requestFailures.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || 'unknown',
    })
  })
}

async function attachPageScreenshot(label: string, page: Page | undefined, testInfo: TestInfo): Promise<void> {
  if (!page || page.isClosed()) {
    return
  }

  try {
    const body = await page.screenshot({ fullPage: true })
    await testInfo.attach(`${label}-page.png`, {
      body,
      contentType: 'image/png',
    })
  } catch {
    // Ignore screenshot failures to preserve the original test result.
  }
}

async function createPageWithFakeMedia(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
  })
  return context.newPage()
}

test.describe('Signaling Server E2E', () => {
  let doctorPage: Page
  let patientPage: Page
  let doctorDiagnostics: PageDiagnostics
  let patientDiagnostics: PageDiagnostics

  test.beforeAll(async ({ browser }) => {
    doctorPage = await createPageWithFakeMedia(browser)
    patientPage = await createPageWithFakeMedia(browser)
    doctorDiagnostics = createPageDiagnostics('doctor')
    patientDiagnostics = createPageDiagnostics('patient')
    attachDiagnosticsListeners(doctorPage, doctorDiagnostics)
    attachDiagnosticsListeners(patientPage, patientDiagnostics)
  })

  test.afterAll(async () => {
    await doctorPage?.context().close()
    await patientPage?.context().close()
  })

  test.afterEach(async ({}, testInfo) => {
    const payload = {
      roomId: ROOM_ID,
      retry: testInfo.retry,
      doctorUrl: doctorPage?.isClosed() ? 'closed' : doctorPage?.url(),
      patientUrl: patientPage?.isClosed() ? 'closed' : patientPage?.url(),
      doctorDiagnostics,
      patientDiagnostics,
    }

    await testInfo.attach('signaling-diagnostics.json', {
      body: Buffer.from(JSON.stringify(payload, null, 2)),
      contentType: 'application/json',
    })

    if (testInfo.status !== testInfo.expectedStatus) {
      await attachPageScreenshot('doctor', doctorPage, testInfo)
      await attachPageScreenshot('patient', patientPage, testInfo)
    }
  })

  test('doctor and patient connect via signaling server', async ({}, testInfo) => {
    testInfo.annotations.push({ type: 'room-id', description: ROOM_ID })

    // --- Step 1: Doctor navigates to test-call page ---
    await doctorPage.goto(`${DOCTOR_URL}/test-call`)
    await expect(doctorPage.getByText('Test de Videollamada - Portal Médicos')).toBeVisible({ timeout: 15_000 })

    // Set a unique room ID to avoid collisions
    const doctorRoomInput = doctorPage.locator('input[placeholder="Ej: test-room-001"]')
    await doctorRoomInput.fill(ROOM_ID)

    // --- Step 2: Doctor clicks setup button to render UnifiedVideoCall ---
    await doctorPage.getByRole('button', { name: /Iniciar Videollamada de Prueba/ }).click()

    // Verify UnifiedVideoCall loaded with disconnected state
    await expect(doctorPage.getByText('Desconectado')).toBeVisible({ timeout: 10_000 })
    await expect(doctorPage.getByText('Presiona el botón para iniciar la videollamada')).toBeVisible()

    // --- Step 3: Doctor starts the call ---
    await doctorPage.locator('button[title="Iniciar videollamada"]').click()

    // Wait for connection (WebSocket → signaling join → connected)
    await expect(doctorPage.getByText('Conectado')).toBeVisible({ timeout: 20_000 })
    await expect(doctorPage.getByText('1 participante')).toBeVisible()

    // --- Step 4: Patient navigates to test-call page ---
    await patientPage.goto(`${PATIENT_URL}/test-call`)
    await expect(patientPage.getByText('Test de Videollamada - Portal Pacientes')).toBeVisible({ timeout: 15_000 })

    // Set the same room ID
    const patientRoomInput = patientPage.locator('input[placeholder="Ej: test-room-001"]')
    await patientRoomInput.fill(ROOM_ID)

    // --- Step 5: Patient clicks setup button ---
    await patientPage.getByRole('button', { name: /Unirse a Consulta/ }).click()
    await expect(patientPage.getByText('Desconectado')).toBeVisible({ timeout: 10_000 })

    // --- Step 6: Patient starts the call ---
    await patientPage.locator('button[title="Iniciar videollamada"]').click()

    // Wait for patient to connect
    await expect(patientPage.getByText('Conectado')).toBeVisible({ timeout: 20_000 })

    // --- Step 7: Verify both see 2 participants ---
    await expect(doctorPage.getByText('2 participantes', { exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await expect(patientPage.getByText('2 participantes', { exact: true }).first()).toBeVisible({ timeout: 10_000 })

    // --- Step 8: Verify "Videollamada activa" status text (in bottom bar) ---
    await expect(doctorPage.getByText(/Videollamada activa/)).toBeVisible()
    await expect(patientPage.getByText(/Videollamada activa/)).toBeVisible()

    // --- Step 9: Doctor ends the call ---
    await doctorPage.locator('button[title="Terminar videollamada"]').click()

    // Doctor returns to setup form (onCallEnd triggers setCallStarted(false))
    await expect(doctorPage.getByRole('button', { name: /Iniciar Videollamada de Prueba/ })).toBeVisible({ timeout: 10_000 })

    // Patient should see user-left (1 participant or disconnected)
    await expect(patientPage.getByText('1 participante').first()).toBeVisible({ timeout: 10_000 })
  })
})
