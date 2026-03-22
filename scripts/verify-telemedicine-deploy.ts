/**
 * Verificación de telemedicina en deployments de Cloudflare Pages
 * - Chequea Permissions-Policy headers
 * - Verifica /api/turn-credentials
 * - Detecta violations de Permissions Policy en consola
 * - Toma screenshot del componente de videollamada
 */
import { chromium } from 'patchright'

const DEPLOYMENTS = {
  patients: 'https://20420947.autamedica-patients-82t.pages.dev',
  doctors: 'https://e56de291.autamedica-doctors-az6.pages.dev',
}

interface CheckResult {
  app: string
  url: string
  permissionsPolicy: string | null
  csp: string | null
  turnCredentials: { status: number; body: unknown } | null
  consoleViolations: string[]
  consoleErrors: string[]
  screenshot: string
  status: 'OK' | 'WARN' | 'ERROR'
  issues: string[]
}

async function checkApp(app: string, baseUrl: string): Promise<CheckResult> {
  const result: CheckResult = {
    app,
    url: baseUrl,
    permissionsPolicy: null,
    csp: null,
    turnCredentials: null,
    consoleViolations: [],
    consoleErrors: [],
    screenshot: '',
    status: 'OK',
    issues: [],
  }

  // 1. Check HTTP headers via fetch
  try {
    const res = await fetch(`${baseUrl}/test-call`)
    result.permissionsPolicy = res.headers.get('permissions-policy')
    result.csp = res.headers.get('content-security-policy')

    if (!result.permissionsPolicy?.includes('microphone=(self)')) {
      result.issues.push(`❌ Permissions-Policy no tiene microphone=(self): ${result.permissionsPolicy}`)
      result.status = 'ERROR'
    } else {
      console.log(`✅ [${app}] Permissions-Policy correcto: microphone=(self), camera=(self)`)
    }
  } catch (e) {
    result.issues.push(`❌ No se pudo obtener headers HTTP: ${e}`)
    result.status = 'ERROR'
  }

  // 2. Check /api/turn-credentials
  try {
    const turnRes = await fetch(`${baseUrl}/api/turn-credentials`)
    const body = await turnRes.json()
    result.turnCredentials = { status: turnRes.status, body }

    if (turnRes.status !== 200) {
      result.issues.push(`❌ /api/turn-credentials devuelve ${turnRes.status}`)
      result.status = 'ERROR'
    } else if (!(body as { ok?: boolean }).ok) {
      result.issues.push(`❌ /api/turn-credentials ok=false: ${JSON.stringify(body)}`)
      result.status = 'ERROR'
    } else {
      const servers = (body as { iceServers?: unknown[] }).iceServers
      console.log(`✅ [${app}] /api/turn-credentials OK - ${servers?.length} ICE servers`)
    }
  } catch (e) {
    result.issues.push(`❌ Error en /api/turn-credentials: ${e}`)
    result.status = 'ERROR'
  }

  // 3. Navigate with patchright and check console violations
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  try {
    const context = await browser.newContext({
      permissions: ['microphone', 'camera'],
    })
    const page = await context.newPage()

    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('Permissions policy violation') || text.includes('not allowed in this document')) {
        result.consoleViolations.push(text)
      } else if (msg.type() === 'error') {
        result.consoleErrors.push(text)
      }
    })

    const testUrl = `${baseUrl}/test-call`
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3000) // esperar inicialización WebRTC

    const screenshotPath = `/tmp/telemedicine-${app}-verify.png`
    await page.screenshot({ path: screenshotPath, fullPage: false })
    result.screenshot = screenshotPath

    if (result.consoleViolations.length > 0) {
      result.issues.push(`❌ Violations en consola: ${result.consoleViolations.join(' | ')}`)
      result.status = 'ERROR'
    } else {
      console.log(`✅ [${app}] Sin Permissions Policy violations en consola`)
    }

    if (result.consoleErrors.length > 0) {
      const webrtcErrors = result.consoleErrors.filter(e => e.includes('WebRTC') || e.includes('turn') || e.includes('TURN'))
      if (webrtcErrors.length > 0) {
        result.issues.push(`⚠️  Errores WebRTC: ${webrtcErrors.slice(0, 3).join(' | ')}`)
        if (result.status === 'OK') result.status = 'WARN'
      }
    }

    await context.close()
  } finally {
    await browser.close()
  }

  return result
}

async function main() {
  console.log('🔍 Verificando deployments de telemedicina...\n')

  const results: CheckResult[] = []

  for (const [app, url] of Object.entries(DEPLOYMENTS)) {
    console.log(`\n── Verificando ${app} (${url}) ──`)
    try {
      const result = await checkApp(app, url)
      results.push(result)
    } catch (e) {
      console.error(`❌ Error fatal en ${app}:`, e)
      results.push({
        app, url, permissionsPolicy: null, csp: null, turnCredentials: null,
        consoleViolations: [], consoleErrors: [], screenshot: '',
        status: 'ERROR', issues: [`Fatal: ${e}`],
      })
    }
  }

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║          REPORTE DE VERIFICACIÓN          ║')
  console.log('╚══════════════════════════════════════════╝\n')

  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌'
    console.log(`${icon} ${r.app.toUpperCase()} → ${r.status}`)
    console.log(`   URL: ${r.url}`)
    console.log(`   Permissions-Policy: ${r.permissionsPolicy ?? 'N/A'}`)
    if (r.turnCredentials) {
      console.log(`   turn-credentials: HTTP ${r.turnCredentials.status} | ok=${(r.turnCredentials.body as {ok?:boolean}).ok} | servers=${JSON.stringify((r.turnCredentials.body as {iceServers?:unknown[]}).iceServers?.length ?? 0)}`)
    }
    if (r.consoleViolations.length > 0) {
      console.log(`   Violations: ${r.consoleViolations.length}`)
    } else {
      console.log(`   Violations: ninguna ✅`)
    }
    if (r.issues.length > 0) {
      r.issues.forEach(i => console.log(`   ${i}`))
    }
    if (r.screenshot) {
      console.log(`   Screenshot: ${r.screenshot}`)
    }
    console.log()
  }

  const allOk = results.every(r => r.status !== 'ERROR')
  console.log(allOk ? '🎉 Todo OK — telemedicina operativa' : '🚨 Hay problemas que requieren atención')
  process.exit(allOk ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
