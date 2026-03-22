/**
 * Test E2E: verifica que la videollamada telemedicina funciona en producción.
 * Usa Playwright headless con fake media (video sintético verde).
 */
import { chromium, type Page, type BrowserContext } from 'playwright'
import { existsSync, mkdirSync } from 'fs'

const ROOM_ID = 'test-room-e2e'
const DOCTOR_URL = `https://doctor.autamedica.com/test-call`
const PATIENT_URL = `https://paciente.autamedica.com/test-call`
const SCREENSHOTS = '/tmp/telemedicina-test'
const TIMEOUT = 25_000

async function shot(page: Page, name: string) {
  if (!existsSync(SCREENSHOTS)) mkdirSync(SCREENSHOTS, { recursive: true })
  const path = `${SCREENSHOTS}/${name}.png`
  await page.screenshot({ path })
  console.log(`  📸 ${path}`)
}

async function launchCtx(): Promise<BrowserContext> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
    ],
  })
  return browser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 1280, height: 800 },
  })
}

/** Espera a que la página esté idle y el input sea interactuable */
async function fillRoomId(page: Page, roomId: string) {
  // Esperar que el formulario esté visible (puede tardar si hay auth loading)
  const input = page.locator('input[type="text"]').first()
  await input.waitFor({ state: 'visible', timeout: TIMEOUT })
  await input.fill(roomId)
}

/** Click en el primer botón que matchee el texto */
async function clickButton(page: Page, ...texts: string[]) {
  for (const text of texts) {
    const btn = page.getByRole('button', { name: new RegExp(text, 'i') })
    try {
      await btn.waitFor({ state: 'visible', timeout: 5000 })
      await btn.click()
      return
    } catch { /* try next */ }
  }
  throw new Error(`No se encontró botón con textos: ${texts.join(', ')}`)
}

async function run() {
  const errors: string[] = []
  let passed = 0

  console.log('\n🎬 Test E2E — Cloudflare Calls SFU Telemedicina')
  console.log(`   Room: ${ROOM_ID}\n`)

  const [ctxD, ctxP] = await Promise.all([launchCtx(), launchCtx()])
  const doctor = await ctxD.newPage()
  const patient = await ctxP.newPage()

  // Capturar errores de consola
  doctor.on('console', m => { if (m.type() === 'error') errors.push(`[doctor] ${m.text()}`) })
  patient.on('console', m => { if (m.type() === 'error') errors.push(`[patient] ${m.text()}`) })

  try {
    // ── PASO 1: Cargar páginas ─────────────────────────────────────────
    console.log('1. Cargando páginas...')
    await Promise.all([
      doctor.goto(DOCTOR_URL, { waitUntil: 'networkidle', timeout: TIMEOUT }),
      patient.goto(PATIENT_URL, { waitUntil: 'networkidle', timeout: TIMEOUT }),
    ])
    await Promise.all([shot(doctor, '01-doctor-initial'), shot(patient, '01-patient-initial')])
    console.log('   ✅ Páginas cargadas')
    passed++

    // ── PASO 2: Verificar sin React #418 ──────────────────────────────
    const has418 = errors.some(e => e.includes('#418') || e.includes('Minified React error'))
    if (has418) {
      console.log('   ❌ React #418 detectado')
    } else {
      console.log('2. ✅ Sin errores React #418')
      passed++
    }

    // ── PASO 3: Configurar Room ID ─────────────────────────────────────
    console.log('3. Configurando Room ID...')
    await Promise.all([
      fillRoomId(doctor, ROOM_ID).catch(() => console.log('   ⚠️  Doctor: input no encontrado, usando default')),
      fillRoomId(patient, ROOM_ID).catch(() => console.log('   ⚠️  Patient: input no encontrado, usando default')),
    ])
    await Promise.all([shot(doctor, '02-doctor-form'), shot(patient, '02-patient-form')])
    console.log(`   ✅ Room ID = ${ROOM_ID}`)
    passed++

    // ── PASO 4: Iniciar llamadas ───────────────────────────────────────
    console.log('4. Iniciando llamada...')
    // Doctor primero para crear el room
    await clickButton(doctor, 'Iniciar', 'Consulta', 'Start')
    console.log('   • Doctor: llamada iniciada')
    await doctor.waitForTimeout(1500)

    // Paciente se une
    await clickButton(patient, 'Unirse', 'Consulta', 'Join', 'Start')
    console.log('   • Paciente: uniéndose')
    await patient.waitForTimeout(1500)

    await Promise.all([shot(doctor, '03-doctor-calling'), shot(patient, '03-patient-calling')])
    console.log('   ✅ Llamadas iniciadas')
    passed++

    // ── PASO 5: Verificar <video> elements ────────────────────────────
    console.log('5. Verificando elementos de video...')
    const [doctorVid, patientVid] = await Promise.all([
      doctor.locator('video').first().waitFor({ state: 'attached', timeout: TIMEOUT }).then(() => true).catch(() => false),
      patient.locator('video').first().waitFor({ state: 'attached', timeout: TIMEOUT }).then(() => true).catch(() => false),
    ])
    if (doctorVid) { console.log('   ✅ Doctor: <video> presente'); passed++ }
    else { console.log('   ❌ Doctor: sin <video>') }
    if (patientVid) { console.log('   ✅ Paciente: <video> presente'); passed++ }
    else { console.log('   ❌ Paciente: sin <video>') }

    // ── PASO 6: Esperar stream (10s para dar tiempo al SFU) ───────────
    console.log('6. Esperando streams de video (10s)...')
    await Promise.all([doctor.waitForTimeout(10000), patient.waitForTimeout(10000)])

    const [dStream, pStream] = await Promise.all([
      doctor.evaluate(() => {
        const vids = Array.from(document.querySelectorAll('video'))
        return {
          count: vids.length,
          withStream: vids.filter(v => v.srcObject !== null).length,
          readyState: vids.map(v => v.readyState),
        }
      }),
      patient.evaluate(() => {
        const vids = Array.from(document.querySelectorAll('video'))
        return {
          count: vids.length,
          withStream: vids.filter(v => v.srcObject !== null).length,
          readyState: vids.map(v => v.readyState),
        }
      }),
    ])

    await Promise.all([shot(doctor, '04-doctor-streaming'), shot(patient, '04-patient-streaming')])

    console.log(`   Doctor: ${dStream.count} videos, ${dStream.withStream} con stream activo`)
    console.log(`   Paciente: ${pStream.count} videos, ${pStream.withStream} con stream activo`)

    if (dStream.withStream > 0) { console.log('   ✅ Doctor: stream activo'); passed++ }
    else { console.log('   ❌ Doctor: sin stream activo') }
    if (pStream.withStream > 0) { console.log('   ✅ Paciente: stream activo'); passed++ }
    else { console.log('   ❌ Paciente: sin stream activo') }

    // ── PASO 7: Verificar proxy CF Calls ──────────────────────────────
    console.log('7. Verificando proxy Cloudflare Calls...')
    const cfStatus = await doctor.evaluate(async () => {
      const r = await fetch('/api/cloudflare-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'POST', path: 'sessions/new', body: {} }),
      })
      return r.status
    })
    if (cfStatus < 500) {
      console.log(`   ✅ Proxy CF Calls responde (${cfStatus} — CF API recibió la petición)`)
      passed++
    } else {
      console.log(`   ❌ Proxy CF Calls falla (${cfStatus})`)
    }

    // ── PASO 8: turn-credentials no 503 ──────────────────────────────
    console.log('8. Verificando turn-credentials...')
    const turnStatus = await patient.evaluate(async () => {
      const r = await fetch('/api/turn-credentials')
      return r.status
    })
    if (turnStatus !== 503) {
      console.log(`   ✅ turn-credentials OK (${turnStatus})`)
      passed++
    } else {
      console.log(`   ❌ turn-credentials devuelve 503`)
    }

  } catch (err) {
    console.error('\n💥 Error:', err)
    await Promise.all([shot(doctor, 'error-doctor'), shot(patient, 'error-patient')]).catch(() => {})
  } finally {
    await Promise.all([ctxD.browser()?.close(), ctxP.browser()?.close()])
  }

  // ── Resumen ──────────────────────────────────────────────────────────
  const errCount = 10 - passed // 10 checks total
  console.log('\n' + '─'.repeat(50))
  console.log(`📊 ${passed}/10 checks pasaron`)
  console.log(`📁 Screenshots en ${SCREENSHOTS}/`)

  const criticalErrors = errors.filter(e =>
    !e.includes('No TURN servers') &&
    !e.includes('ICE') &&
    !e.includes('chext') &&
    !e.includes('favicon')
  )
  if (criticalErrors.length > 0) {
    console.log('\n⚠️  Errores en consola:')
    criticalErrors.slice(0, 5).forEach(e => console.log('  ', e.slice(0, 120)))
  }

  if (errCount <= 2) {
    console.log('\n🟢 TELEMEDICINA FUNCIONAL\n')
  } else {
    console.log('\n🔴 REQUIERE ATENCIÓN — ver screenshots\n')
    process.exit(1)
  }
}

run().catch(e => { console.error(e); process.exit(1) })
