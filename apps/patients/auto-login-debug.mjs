import { chromium } from '@playwright/test';

(async () => {
  console.log('🚀 Iniciando navegador...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // 🔍 CAPTURAR CONSOLE LOGS
  const consoleLogs = [];
  page.on('console', msg => {
    const logEntry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    consoleLogs.push(logEntry);
    console.log(`📝 BROWSER:`, logEntry);
  });

  // 🌐 CAPTURAR NETWORK REQUESTS
  const networkLogs = [];
  page.on('request', request => {
    const entry = `➡️  ${request.method()} ${request.url()}`;
    networkLogs.push(entry);
    console.log(`🌐 REQUEST:`, entry);
  });

  page.on('response', response => {
    const entry = `⬅️  ${response.status()} ${response.url()}`;
    networkLogs.push(entry);
    console.log(`🌐 RESPONSE:`, entry);
  });

  // 🚨 CAPTURAR ERRORES
  page.on('pageerror', error => {
    console.error('❌ PAGE ERROR:', error.message);
    console.error('Stack:', error.stack);
  });

  try {
    console.log('📱 Navegando a http://localhost:3000/auth/login?role=patient');
    await page.goto('http://localhost:3000/auth/login?role=patient', {
      waitUntil: 'networkidle',
      timeout: 15000
    });

    console.log('⏳ Esperando formulario de login...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    console.log('✍️ Llenando email: paciente.test@autamedica.test');
    await page.fill('input[type="email"]', 'paciente.test@autamedica.test');

    console.log('✍️ Llenando contraseña...');
    await page.fill('input[type="password"]', 'TestPaciente2025!');

    console.log('📸 Screenshot antes del login...');
    await page.screenshot({ path: '/tmp/antes-login-debug.png', fullPage: true });

    console.log('');
    console.log('🔍 ===== ESTADO ANTES DEL CLICK =====');
    console.log(`URL actual: ${page.url()}`);
    console.log(`Console logs hasta ahora: ${consoleLogs.length}`);
    console.log(`Network requests hasta ahora: ${networkLogs.filter(l => l.startsWith('➡️')).length}`);
    console.log('');

    console.log('🔐 Haciendo click en "Iniciar Sesión"...');
    const submitButton = await page.$('button[type="submit"]');

    if (!submitButton) {
      console.error('❌ No se encontró el botón de submit!');
    } else {
      console.log('✅ Botón encontrado, haciendo click...');

      // Limpiar logs anteriores para ver solo lo que pasa después del click
      const preClickRequestCount = networkLogs.filter(l => l.startsWith('➡️')).length;

      await submitButton.click();

      console.log('⏳ Esperando 5 segundos para observar qué pasa...');
      await page.waitForTimeout(5000);

      console.log('');
      console.log('🔍 ===== ESTADO DESPUÉS DEL CLICK =====');
      console.log(`URL actual: ${page.url()}`);

      const postClickRequests = networkLogs.filter((l, i) =>
        i >= preClickRequestCount && l.startsWith('➡️')
      );

      console.log(`Requests nuevos después del click: ${postClickRequests.length}`);

      if (postClickRequests.length > 0) {
        console.log('Requests detectados:');
        postClickRequests.forEach(req => console.log(`  ${req}`));
      } else {
        console.log('❌ NO SE DETECTÓ NINGÚN REQUEST DESPUÉS DEL CLICK!');
      }

      console.log('');
      console.log('Console logs después del click:');
      consoleLogs.slice(-10).forEach(log => console.log(`  ${log}`));
      console.log('');
    }

    console.log('📸 Screenshot después del login...');
    await page.screenshot({ path: '/tmp/despues-login-debug.png', fullPage: true });

    console.log('');
    console.log('📊 ===== RESUMEN COMPLETO =====');
    console.log(`Total console logs: ${consoleLogs.length}`);
    console.log(`Total requests: ${networkLogs.filter(l => l.startsWith('➡️')).length}`);
    console.log(`Total responses: ${networkLogs.filter(l => l.startsWith('⬅️')).length}`);
    console.log(`URL final: ${page.url()}`);
    console.log('');

    console.log('⏰ Manteniendo navegador abierto por 30 segundos...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    await page.screenshot({ path: '/tmp/error-login-debug.png' });
  } finally {
    console.log('');
    console.log('📝 GUARDANDO LOGS COMPLETOS...');

    const fs = await import('fs');
    const logsReport = `
=================================================
AUTAMEDICA LOGIN DEBUG REPORT
=================================================

URL FINAL: ${page.url()}

CONSOLE LOGS (${consoleLogs.length}):
${consoleLogs.join('\n')}

NETWORK LOGS (${networkLogs.length}):
${networkLogs.join('\n')}

=================================================
    `.trim();

    await fs.promises.writeFile('/tmp/login-debug-report.txt', logsReport);
    console.log('✅ Reporte guardado en: /tmp/login-debug-report.txt');

    console.log('🔒 Cerrando navegador...');
    await browser.close();
    console.log('✅ Completado');
  }
})();
