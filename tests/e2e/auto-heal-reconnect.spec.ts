/**
 * E2E: auto-heal when a peer reconnects with a new SFU sessionId
 *
 * Regression guard for the cascade of bugs fixed in PRs #321–#326. Opens two
 * browser contexts (doctor + patient), waits for both to show live video of
 * the other, reloads ONE side, and asserts the remaining side sees video of
 * the returning peer within 5 seconds WITHOUT any manual action.
 *
 * Run: pnpm exec playwright test tests/e2e/auto-heal-reconnect.spec.ts
 * Env:
 *   DOCTOR_URL   — e.g. https://doctor.autamedica.com (or pages.dev preview)
 *   PATIENT_URL  — e.g. https://paciente.autamedica.com
 *   ROOM_ID      — optional shared room id; defaults to a timestamped one
 *   CALL_ID      — optional shared call id; defaults to a timestamped one
 */
import { test, expect, type Page } from 'patchright/test'

const DOCTOR_URL = process.env.DOCTOR_URL || 'https://doctor.autamedica.com'
const PATIENT_URL = process.env.PATIENT_URL || 'https://paciente.autamedica.com'
const ROOM_ID = process.env.ROOM_ID || `e2e-heal-${Date.now()}`
const CALL_ID = process.env.CALL_ID || `e2e-call-${Date.now()}`

const RECONNECT_BUDGET_MS = 5000

async function waitForRemoteVideoWithFrames(page: Page, label: string, timeoutMs = 15000): Promise<void> {
  await expect
    .poll(
      async () => {
        return await page.evaluate(() => {
          const videos = Array.from(document.querySelectorAll('video'))
          // The remote video element is the one without `muted` (local preview is muted).
          const remote = videos.find((v) => !v.muted)
          if (!remote) return { ok: false, reason: 'no remote video element' }
          const stream = remote.srcObject as MediaStream | null
          if (!stream) return { ok: false, reason: 'no stream on remote video' }
          const tracks = stream.getTracks()
          const hasVideoTrack = tracks.some((t) => t.kind === 'video' && t.readyState === 'live')
          return {
            ok: hasVideoTrack && remote.videoWidth > 0 && remote.videoHeight > 0,
            videoWidth: remote.videoWidth,
            videoHeight: remote.videoHeight,
            trackKinds: tracks.map((t) => t.kind),
          }
        })
      },
      {
        message: `[${label}] remote video never rendered frames`,
        timeout: timeoutMs,
        intervals: [250, 500, 1000],
      },
    )
    .toMatchObject({ ok: true })
}

test.describe('Auto-heal peer reconnect', () => {
  test.use({ permissions: ['camera', 'microphone'] })

  test('patient sees doctor within 5s after doctor reloads — no manual action', async ({ browser }) => {
    const doctorCtx = await browser.newContext({ permissions: ['camera', 'microphone'] })
    const patientCtx = await browser.newContext({ permissions: ['camera', 'microphone'] })

    const doctorPage = await doctorCtx.newPage()
    const patientPage = await patientCtx.newPage()

    await doctorPage.goto(`${DOCTOR_URL}/doctors/call/${ROOM_ID}?callId=${CALL_ID}`)
    await patientPage.goto(`${PATIENT_URL}/patients/call/${ROOM_ID}?callId=${CALL_ID}`)

    // Initial convergence: both sides must see each other before we reload.
    await waitForRemoteVideoWithFrames(doctorPage, 'doctor-initial')
    await waitForRemoteVideoWithFrames(patientPage, 'patient-initial')

    // Force doctor reload while patient stays untouched.
    const reloadStart = Date.now()
    await doctorPage.reload()

    // Patient must recover its view of the doctor WITHOUT any patient-side action.
    await waitForRemoteVideoWithFrames(patientPage, 'patient-after-doctor-reload', RECONNECT_BUDGET_MS + 10_000)
    const recoveryMs = Date.now() - reloadStart
    console.log(`[auto-heal] patient recovered doctor video in ${recoveryMs}ms`)

    // Sanity: the returning peer (doctor) also sees the patient.
    await waitForRemoteVideoWithFrames(doctorPage, 'doctor-after-reload')

    await doctorCtx.close()
    await patientCtx.close()
  })

  test('doctor sees patient within 5s after patient reloads — no manual action', async ({ browser }) => {
    const doctorCtx = await browser.newContext({ permissions: ['camera', 'microphone'] })
    const patientCtx = await browser.newContext({ permissions: ['camera', 'microphone'] })

    const doctorPage = await doctorCtx.newPage()
    const patientPage = await patientCtx.newPage()

    await doctorPage.goto(`${DOCTOR_URL}/doctors/call/${ROOM_ID}?callId=${CALL_ID}`)
    await patientPage.goto(`${PATIENT_URL}/patients/call/${ROOM_ID}?callId=${CALL_ID}`)

    await waitForRemoteVideoWithFrames(doctorPage, 'doctor-initial')
    await waitForRemoteVideoWithFrames(patientPage, 'patient-initial')

    const reloadStart = Date.now()
    await patientPage.reload()

    await waitForRemoteVideoWithFrames(doctorPage, 'doctor-after-patient-reload', RECONNECT_BUDGET_MS + 10_000)
    const recoveryMs = Date.now() - reloadStart
    console.log(`[auto-heal] doctor recovered patient video in ${recoveryMs}ms`)

    await waitForRemoteVideoWithFrames(patientPage, 'patient-after-reload')

    await doctorCtx.close()
    await patientCtx.close()
  })
})
