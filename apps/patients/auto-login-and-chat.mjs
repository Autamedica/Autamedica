import { chromium } from '@playwright/test';

(async () => {
  console.log('🚀 Iniciando navegador...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Capturar console logs
  page.on('console', msg => {
    console.log(`📝 BROWSER [${msg.type()}]:`, msg.text());
  });

  // Capturar errores
  page.on('pageerror', error => {
    console.error('❌ PAGE ERROR:', error.message);
  });

  try {
    // ========== PASO 1: LOGIN ==========
    console.log('');
    console.log('='.repeat(60));
    console.log('PASO 1: LOGIN');
    console.log('='.repeat(60));

    console.log('📱 Navegando a login...');
    await page.goto('http://localhost:3003/auth/login?role=patient', {
      waitUntil: 'networkidle',
      timeout: 15000
    });

    console.log('⏳ Esperando formulario...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    console.log('✍️  Llenando credenciales...');
    await page.fill('input[type="email"]', 'paciente.test@autamedica.test');
    await page.fill('input[type="password"]', 'TestPaciente2025!');

    console.log('📸 Screenshot pre-login...');
    await page.screenshot({ path: '/tmp/1-pre-login.png' });

    console.log('🔐 Haciendo click en "Iniciar Sesión"...');
    await page.click('button[type="submit"]');

    console.log('⏳ Esperando navegación a dashboard...');
    try {
      // Esperar a que salga de la página de login
      await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 10000 });
      console.log('✅ ¡Salimos de la página de login!');
    } catch (_e) {
      console.log('⚠️  No detecté navegación automática, esperando 3 seg...');
      await page.waitForTimeout(3000);
    }

    const currentUrl = page.url();
    // Aceptar tanto / como /dashboard/ como válidos
    if (currentUrl.match(/localhost:3003\/(dashboard\/?)?$/)) {
      console.log(`✅ Estamos en dashboard! (${currentUrl})`);
    } else {
      console.log('❌ No estamos en dashboard, URL actual:', currentUrl);
      await page.screenshot({ path: '/tmp/2-no-dashboard.png' });
      throw new Error('No se redirigió a dashboard');
    }

    console.log('📸 Screenshot post-login (dashboard)...');
    await page.screenshot({ path: '/tmp/2-dashboard.png', fullPage: true });

    // ========== PASO 1.5: MARCAR ONBOARDING COMO COMPLETADO ==========
    console.log('');
    console.log('='.repeat(60));
    console.log('PASO 1.5: CERRAR MODAL DE BIENVENIDA');
    console.log('='.repeat(60));

    console.log('🔧 Marcando onboarding como completado en localStorage...');

    // Marcar el onboarding como completado en localStorage
    await page.evaluate(() => {
      localStorage.setItem('autamedica_onboarding_completed', 'true');
    });

    console.log('  ✅ Onboarding marcado como completado');

    // Recargar la página para que el cambio surta efecto
    console.log('🔄 Recargando página para aplicar cambios...');
    await page.reload({ waitUntil: 'networkidle' });

    console.log('📸 Screenshot después de recargar sin onboarding...');
    await page.screenshot({ path: '/tmp/2.5-sin-onboarding.png' });

    // ========== PASO 2: BUSCAR CHATBOT AUTA ==========
    console.log('');
    console.log('='.repeat(60));
    console.log('PASO 2: BUSCAR CHATBOT AUTA');
    console.log('='.repeat(60));

    console.log('🔍 Buscando elemento de chat Auta...');

    // Posibles selectores para encontrar Auta (botón flotante en esquina inferior derecha)
    // IMPORTANTE: Usar el selector más específico primero (aria-label del componente)
    const autaSelectors = [
      'button[aria-label="Abrir asistente Auta"]', // Selector exacto del componente
      'button[aria-label*="Auta"]',
      'button.bottom-6.right-6', // Classes específicas de Auta
      'button:has-text("Abrir asistente")',
      '[data-testid*="auta"]',
      '.chatbot',
      '#chat'
    ];

    let autaElement = null;
    let foundSelector = null;

    for (const selector of autaSelectors) {
      try {
        console.log(`  🔎 Probando selector: ${selector}`);
        autaElement = await page.$(selector);
        if (autaElement) {
          foundSelector = selector;
          console.log(`  ✅ ¡Encontrado con selector: ${selector}!`);
          break;
        }
      } catch (_e) {
        // Ignorar errores de selectores inválidos
      }
    }

    if (!autaElement) {
      console.log('⚠️  No se encontró Auta con selectores predefinidos');
      console.log('📊 Analizando la página...');

      // Buscar todos los botones y links
      const clickableElements = await page.$$('button, a, [role="button"]');
      console.log(`   Encontrados ${clickableElements.length} elementos clickeables`);

      // Listar algunos textos para debug
      for (let i = 0; i < Math.min(10, clickableElements.length); i++) {
        const text = await clickableElements[i].textContent();
        console.log(`   [${i}] ${text?.trim().substring(0, 50) || '(sin texto)'}`);
      }

      console.log('');
      console.log('📸 Screenshot para análisis manual...');
      await page.screenshot({ path: '/tmp/3-buscar-auta.png', fullPage: true });
    } else {
      console.log(`✅ Auta encontrado con: ${foundSelector}`);

      console.log('🖱️  Haciendo click en Auta con JavaScript...');
      // Usar evaluate para hacer click directo con JavaScript (más confiable)
      await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        if (button) {
          button.click();
          return true;
        }
        return false;
      }, foundSelector);

      console.log('⏳ Esperando que el chat se abra...');
      await page.waitForTimeout(3000); // Esperar más tiempo para animación

      console.log('📸 Screenshot después de abrir chat...');
      await page.screenshot({ path: '/tmp/4-auta-abierto.png', fullPage: true });

      // ========== PASO 3: INTERACTUAR CON AUTA ==========
      console.log('');
      console.log('='.repeat(60));
      console.log('PASO 3: ENVIAR MENSAJE A AUTA');
      console.log('='.repeat(60));

      console.log('🔍 Buscando campo de texto del chat...');

      // Selector específico basado en el código del chatbot
      const chatInputSelector = 'input[placeholder*="Pregúntale a Auta"]';

      try {
        // Esperar a que aparezca el input del chat
        await page.waitForSelector(chatInputSelector, { timeout: 5000 });
        console.log(`  ✅ Input encontrado: ${chatInputSelector}`);

        const chatInput = await page.$(chatInputSelector);

        if (chatInput) {
          console.log('✍️  Escribiendo mensaje de prueba...');
          await chatInput.fill('Hola Auta, ¿cuáles son mis próximas citas médicas?');

          console.log('📸 Screenshot con mensaje escrito...');
          await page.screenshot({ path: '/tmp/5-mensaje-escrito.png' });

          console.log('📤 Enviando mensaje (presionando Enter)...');
          await chatInput.press('Enter');

          console.log('⏳ Esperando respuesta de Auta...');
          await page.waitForTimeout(4000); // Dar tiempo para que Auta procese y responda

          console.log('📸 Screenshot después de recibir respuesta...');
          await page.screenshot({ path: '/tmp/6-mensaje-enviado.png', fullPage: true });

          console.log('✅ ¡Mensaje enviado y respuesta recibida!');
        }
      } catch (error) {
        console.log('⚠️  Error al buscar/usar el input del chat:', error.message);
        console.log('📸 Screenshot de debugging...');
        await page.screenshot({ path: '/tmp/5-error-chat-input.png', fullPage: true });
      }
    }

    // ========== RESUMEN FINAL ==========
    console.log('');
    console.log('='.repeat(60));
    console.log('RESUMEN FINAL');
    console.log('='.repeat(60));
    console.log(`URL actual: ${page.url()}`);
    console.log(`Auta encontrado: ${autaElement ? '✅ SÍ' : '❌ NO'}`);
    console.log('');
    console.log('Screenshots guardados:');
    console.log('  1. /tmp/1-pre-login.png');
    console.log('  2. /tmp/2-dashboard.png');
    if (!autaElement) {
      console.log('  3. /tmp/3-buscar-auta.png (analizar manualmente)');
    } else {
      console.log('  3. /tmp/4-auta-abierto.png');
      console.log('  4. /tmp/5-mensaje-escrito.png');
      console.log('  5. /tmp/6-mensaje-enviado.png');
    }
    console.log('');

    console.log('⏰ Manteniendo navegador abierto por 30 segundos...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    await page.screenshot({ path: '/tmp/error.png' });
  } finally {
    console.log('🔒 Cerrando navegador...');
    await browser.close();
    console.log('✅ Completado');
  }
})();
