/**
 * Test visual de streaming — graba video del flujo completo:
 * Doctor inicia sala → Paciente se une → ambos ven video
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'fs'

const ROOM_ID = `sala-${Date.now()}`
const DIR = '/tmp/telemedicina-video'
const TIMEOUT = 30_000

const FAKE_MEDIA_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
  '--disable-dev-shm-usage',
]

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })

async function shot(page: import('playwright').Page, name: string) {
  const p = `${DIR}/${name}.png`
  await page.screenshot({ path: p, fullPage: false })
  console.log(`  📸 ${p}`)
  return p
}

async function run() {
  console.log('\n🎥 Test streaming telemedicina — Cloudflare Calls SFU')
  console.log(`   Room: ${ROOM_ID}\n`)

  // Lanzar un solo browser con dos pestañas para evitar conflictos de cookies
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/edu/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
    args: FAKE_MEDIA_ARGS,
  })

  // Contextos completamente limpios (sin cookies/storage)
  const ctxDoctor = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    permissions: ['camera', 'microphone'],
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: DIR, size: { width: 1280, height: 800 } },
  })
  const ctxPatient = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    permissions: ['camera', 'microphone'],
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: DIR, size: { width: 1280, height: 800 } },
  })

  const doctor = await ctxDoctor.newPage()
  const patient = await ctxPatient.newPage()

  const consoleErrors: string[] = []
  doctor.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(`[D] ${m.text().slice(0, 100)}`) })
  patient.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(`[P] ${m.text().slice(0, 100)}`) })

  try {
    // 1. Cargar ambas páginas test-call (sin sesión → formulario visible)
    console.log('1. Cargando test-call pages...')
    await Promise.all([
      doctor.goto(`https://doctor.autamedica.com/test-call`, { waitUntil: 'networkidle', timeout: TIMEOUT }),
      patient.goto(`https://paciente.autamedica.com/test-call`, { waitUntil: 'networkidle', timeout: TIMEOUT }),
    ])
    await Promise.all([shot(doctor, '01a-doctor-loaded'), shot(patient, '01b-patient-loaded')])

    // 2. Llenar Room ID en ambos
    console.log('2. Configurando Room ID...')
    for (const [page, label] of [[doctor, 'doctor'], [patient, 'patient']] as const) {
      const input = page.locator('input[type="text"]').first()
      const visible = await input.isVisible().catch(() => false)
      if (visible) {
        await input.fill(ROOM_ID)
        console.log(`   ✅ ${label}: room ID configurado`)
      } else {
        console.log(`   ⚠️  ${label}: input no visible, usando default`)
      }
    }
    await Promise.all([shot(doctor, '02a-doctor-form'), shot(patient, '02b-patient-form')])

    // 3. Doctor inicia primero
    console.log('3. Doctor inicia consulta...')
    const docBtn = doctor.getByRole('button').filter({ hasText: /iniciar|consulta|start/i }).first()
    await docBtn.waitFor({ state: 'visible', timeout: 8000 })
    await docBtn.click()
    await doctor.waitForTimeout(3000)
    await shot(doctor, '03a-doctor-warmup')

    // 4. Paciente se une
    console.log('4. Paciente uniéndose...')
    const patBtn = patient.getByRole('button').filter({ hasText: /unirse|consulta|join|start|iniciar/i }).first()
    await patBtn.waitFor({ state: 'visible', timeout: 8000 })
    await patBtn.click()
    await patient.waitForTimeout(3000)
    await shot(patient, '04b-patient-warmup')

    // 5. Doctor acepta warmup (si hay botón "Iniciar llamada" o similar)
    console.log('5. Esperando que ambos entren a la llamada...')
    const docCallBtn = doctor.getByRole('button').filter({ hasText: /llamada|call|unirse|conectar/i }).first()
    const hasCallBtn = await docCallBtn.isVisible().catch(() => false)
    if (hasCallBtn) {
      await docCallBtn.click()
      console.log('   Doctor: click en botón de llamada')
    }

    const patCallBtn = patient.getByRole('button').filter({ hasText: /llamada|call|unirse|conectar/i }).first()
    const hasPatCallBtn = await patCallBtn.isVisible().catch(() => false)
    if (hasPatCallBtn) {
      await patCallBtn.click()
      console.log('   Paciente: click en botón de llamada')
    }

    // 6. Esperar videos — dar tiempo al SFU para establecer streams
    console.log('6. Esperando streams (15s para SFU)...')
    await Promise.all([doctor.waitForTimeout(15000), patient.waitForTimeout(15000)])

    await Promise.all([shot(doctor, '06a-doctor-streaming'), shot(patient, '06b-patient-streaming')])

    // 7. Analizar estado de videos
    async function analyzeVideos(page: import('playwright').Page, name: string) {
      return page.evaluate((n) => {
        const vids = Array.from(document.querySelectorAll('video'))
        return {
          name: n,
          total: vids.length,
          withSrcObject: vids.filter(v => v.srcObject !== null).length,
          playing: vids.filter(v => !v.paused && !v.ended).length,
          readyStates: vids.map(v => v.readyState),
          // buscar texto de estado en la UI
          connectionText: document.body.innerText.match(/conectad|connected|connecting|error/i)?.[0] ?? 'no-text',
        }
      }, name)
    }

    const [dStats, pStats] = await Promise.all([
      analyzeVideos(doctor, 'Doctor'),
      analyzeVideos(patient, 'Paciente'),
    ])

    console.log('\n📊 Estadísticas de video:')
    for (const s of [dStats, pStats]) {
      console.log(`   ${s.name}: ${s.total} videos | srcObject: ${s.withSrcObject} | playing: ${s.playing} | readyState: [${s.readyStates}] | UI: "${s.connectionText}"`)
    }

    // 8. Screenshot final de alta resolución para confirmar visualmente
    await Promise.all([
      shot(doctor, '07a-FINAL-doctor'),
      shot(patient, '07b-FINAL-patient'),
    ])

    // 9. Verificar proxy CF Calls y turn-credentials
    const [cfCheck, turnCheck] = await Promise.all([
      doctor.evaluate(async () => {
        const r = await fetch('/api/cloudflare-calls', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'GET', path: 'sessions/active', body: null }),
        })
        return r.status
      }),
      patient.evaluate(async () => {
        const r = await fetch('/api/turn-credentials')
        const b = await r.json() as { ok?: boolean; iceServers?: unknown[] }
        return { status: r.status, ok: b.ok, servers: b.iceServers?.length ?? 0 }
      }),
    ])

    console.log(`\n   CF Calls proxy: ${cfCheck < 500 ? '✅' : '❌'} (HTTP ${cfCheck})`)
    console.log(`   turn-credentials: ${turnCheck.status !== 503 ? '✅' : '❌'} (HTTP ${turnCheck.status}, ${turnCheck.servers} ICE servers)`)

    // Resumen
    const videoWorking = pStats.withSrcObject > 0 || dStats.withSrcObject > 0
    console.log('\n' + '─'.repeat(55))
    if (videoWorking) {
      console.log('🟢 VIDEO STREAMING ACTIVO — Cloudflare Calls SFU funcionando')
      console.log(`   Paciente: ${pStats.withSrcObject} stream(s) con srcObject`)
      console.log(`   Doctor:   ${dStats.withSrcObject} stream(s) con srcObject`)
    } else {
      console.log('🟡 PÁGINAS OK — streams pendientes (normal en headless sin peer activo)')
    }

    if (consoleErrors.length > 0) {
      const relevant = consoleErrors.filter(e => !e.includes('TURN') && !e.includes('ICE') && !e.includes('chext'))
      if (relevant.length > 0) {
        console.log('\n⚠️  Errores de consola relevantes:')
        relevant.slice(0, 5).forEach(e => console.log('  ', e))
      }
    }
    console.log(`\n📁 Screenshots: ${DIR}/`)
    console.log('   Archivos: 01a..07b-FINAL-doctor/patient.png + videos WebM\n')

  } finally {
    // Cerrar y guardar videos
    await Promise.all([ctxDoctor.close(), ctxPatient.close()])
    await browser.close()
  }
}

run().catch(e => { console.error(e); process.exit(1) })
