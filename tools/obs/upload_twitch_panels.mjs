#!/usr/bin/env node
/**
 * AutaMedica — Twitch Panel Uploader via Patchright
 * Uses persistent browser profile (already logged in to Twitch)
 * to automate panel creation with images and descriptions.
 *
 * Usage: node tools/obs/upload_twitch_panels.mjs
 */

import { chromium } from 'patchright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────
const CHROME_USER_DATA = '/home/edu/.config/google-chrome';
const CHROME_PROFILE = 'Profile 15'; // autamedica@gmail.com
const CHANNEL_URL = 'https://www.twitch.tv/autamedica';
const PANELS_DIR = path.join(__dirname, 'assets', 'twitch_panels');

const PANELS = [
  {
    name: 'Acerca de',
    image: 'panel_acerca_de.png',
    description: `🏥 AutaMedica — Plataforma integral de salud digital.

Conectamos pacientes, médicos y empresas en toda América Latina con IA, datos clínicos y telemedicina segura.

En este canal exploramos la intersección entre tecnología y salud: desarrollo de software médico, IA aplicada a diagnóstico, regulaciones y el futuro de la medicina.

🧑‍💻 CEO & Founder | Ingeniero de Software
💡 "La tecnología debe servir a la salud, no al revés."`,
    link: 'https://autamedica.com',
  },
  {
    name: 'Agenda',
    image: 'panel_agenda.png',
    description: `📅 Horarios de Stream (ART)

🟢 Martes 20:00-22:00 — Coding Session
🟢 Jueves 20:00-22:00 — Salud Digital & Debates  
🟢 Sábado 15:00-18:00 — Tech Talk + Comunidad

🔔 Activá las notificaciones para no perderte ningún stream.`,
    link: 'webcal://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=1374917529',
  },
  {
    name: 'Tecnología',
    image: 'panel_tecnologia.png',
    description: `⚡ Stack Tecnológico de AutaMedica

🌐 Frontend: Astro 5 + React 19 Islands
🗄️ Backend: Supabase (PostgreSQL + Edge Functions)
🤖 AI: Gemini API (análisis de documentos, diagnóstico)
📹 Telemedicina: WebRTC (servidor propio)
☁️ Deploy: Cloudflare Pages + Turborepo
🔒 Seguridad: HIPAA, RLS, JWT, E2E Encryption

Todo lo que ves es código real de producción.`,
    link: 'https://github.com/ecucondorSA',
  },
  {
    name: 'Enlaces',
    image: 'panel_enlaces.png',
    description: `🔗 Links Importantes

🌐 autamedica.com — Plataforma principal
📺 YouTube — Videos y tutoriales
💼 LinkedIn — Perfil corporativo
📧 contacto@autamedica.com

💜 ¿Querés apoyar? Seguí el canal y compartí con alguien que le interese la salud digital.`,
    link: 'https://autamedica.com',
  },
];

// ── Helpers ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function screenshot(page, label) {
  const dir = path.join(__dirname, 'assets', 'twitch_panels', 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   📸 Screenshot: ${file}`);
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('🎮 AutaMedica — Twitch Panel Uploader');
  console.log(`   📂 Panels: ${PANELS_DIR}`);
  console.log(`   🔐 Chrome Profile: ${CHROME_PROFILE} (autamedica@gmail.com)\n`);

  // Verify panel images exist
  for (const panel of PANELS) {
    const imgPath = path.join(PANELS_DIR, panel.image);
    if (!fs.existsSync(imgPath)) {
      console.error(`❌ Panel image not found: ${imgPath}`);
      console.error('   Ejecutá primero: python3 tools/obs/generate_twitch_panels.py');
      process.exit(1);
    }
  }

  // Launch with Chrome Profile 15 (autamedica@gmail.com - already logged in to Twitch)
  console.log('🚀 Lanzando Patchright con Chrome Profile 15 (autamedica@gmail.com)...');
  const context = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1400, height: 900 },
    args: [
      `--profile-directory=${CHROME_PROFILE}`,
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    // Navigate to channel
    console.log(`\n🌐 Navegando a ${CHANNEL_URL}...`);
    await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await screenshot(page, '01_channel_loaded');

    // Check if logged in - look for user menu or avatar
    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('[data-a-target="user-menu-toggle"]') ||
             !!document.querySelector('.user-menu') ||
             !!document.querySelector('[data-a-target="edit-panel-button"]') ||
             document.body.innerText.includes('Editar paneles');
    });

    if (!isLoggedIn) {
      console.error('❌ No estás logueado en Twitch. Logueate manualmente en el perfil primero.');
      await screenshot(page, '01_not_logged_in');
      await sleep(30000); // Give time to see the browser
      await context.close();
      process.exit(1);
    }
    console.log('✅ Sesión de Twitch activa');

    // Scroll down to find "Editar paneles" toggle
    console.log('\n📝 Buscando "Editar paneles"...');
    
    // Click "Acerca de" tab first to go to the panel section
    try {
      const aboutTab = page.locator('a:has-text("Acerca de"), [data-a-target="channel-home-tab-Acerca de"]').first();
      await aboutTab.click({ timeout: 5000 });
      await sleep(2000);
    } catch {
      console.log('   ⚠️ Tab "Acerca de" no encontrado, continuando...');
    }

    // Scroll down to panels section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1500);

    await screenshot(page, '02_scrolled_to_panels');

    // Find and click "Editar paneles" toggle
    const editPanelToggle = page.locator('[data-a-target="edit-panel-button"], label:has-text("Editar paneles"), button:has-text("Editar paneles")').first();
    
    try {
      await editPanelToggle.click({ timeout: 5000 });
      console.log('✅ Modo edición de paneles activado');
      await sleep(2000);
    } catch {
      // Try finding the toggle by text content
      console.log('   🔍 Buscando toggle alternativo...');
      const toggleByText = page.locator('text=Editar paneles').first();
      try {
        await toggleByText.click({ timeout: 5000 });
        console.log('✅ Modo edición activado (via texto)');
        await sleep(2000);
      } catch {
        console.log('   ⚠️ No se encontró el toggle. Intentando via JavaScript...');
        await page.evaluate(() => {
          const labels = [...document.querySelectorAll('label, button, div')];
          const toggle = labels.find(el => el.textContent.includes('Editar paneles'));
          if (toggle) toggle.click();
        });
        await sleep(2000);
      }
    }

    await screenshot(page, '03_edit_mode_active');

    // Now create each panel
    for (let i = 0; i < PANELS.length; i++) {
      const panel = PANELS[i];
      console.log(`\n━━━ Panel ${i + 1}/${PANELS.length}: ${panel.name} ━━━`);

      // Click the "+" button to add a new panel
      console.log('   ➕ Buscando botón de agregar panel...');
      
      // Scroll down to find the add button
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1000);

      const addButton = page.locator('[data-a-target="add-panel-button"], button:has-text("+"), .channel-panels-container button[aria-label*="Add"], [data-a-target="panel-add-button"]').first();
      
      try {
        await addButton.click({ timeout: 8000 });
        console.log('   ✅ Panel nuevo abierto');
        await sleep(1500);
      } catch {
        // Try alternative selectors
        console.log('   🔍 Buscando botón + alternativo...');
        await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('button, div[role="button"]')];
          const addBtn = buttons.find(b => 
            b.textContent.trim() === '+' || 
            b.getAttribute('aria-label')?.includes('Add') ||
            b.getAttribute('aria-label')?.includes('Agregar')
          );
          if (addBtn) addBtn.click();
        });
        await sleep(1500);
      }

      await screenshot(page, `04_panel_${i + 1}_form`);

      // Upload image
      const imgPath = path.join(PANELS_DIR, panel.image);
      console.log(`   🖼️  Subiendo imagen: ${panel.image}`);
      
      try {
        // Look for file input
        const fileInput = page.locator('input[type="file"]').last();
        await fileInput.setInputFiles(imgPath);
        console.log('   ✅ Imagen subida');
        await sleep(2000);
      } catch (e) {
        console.log(`   ⚠️ Error subiendo imagen: ${e.message}`);
      }

      // Fill description
      console.log('   📝 Llenando descripción...');
      try {
        const descInput = page.locator('textarea[data-a-target="panel-description-input"], textarea[placeholder*="escripci"], textarea').last();
        await descInput.fill(panel.description);
        console.log('   ✅ Descripción completada');
        await sleep(500);
      } catch (e) {
        console.log(`   ⚠️ Error en descripción: ${e.message}`);
      }

      // Fill link
      if (panel.link) {
        console.log(`   🔗 Agregando link: ${panel.link}`);
        try {
          const linkInput = page.locator('input[data-a-target="panel-link-input"], input[placeholder*="enlace"], input[placeholder*="link"], input[type="url"]').last();
          await linkInput.fill(panel.link);
          console.log('   ✅ Link agregado');
          await sleep(500);
        } catch (e) {
          console.log(`   ⚠️ Error en link: ${e.message}`);
        }
      }

      // Submit/Save the panel
      console.log('   💾 Guardando panel...');
      try {
        const submitBtn = page.locator('button:has-text("Enviar"), button:has-text("Submit"), button:has-text("Guardar"), button:has-text("Done"), [data-a-target="panel-save-button"]').first();
        await submitBtn.click({ timeout: 5000 });
        console.log('   ✅ Panel guardado');
        await sleep(2000);
      } catch (e) {
        console.log(`   ⚠️ Error guardando: ${e.message}`);
      }

      await screenshot(page, `05_panel_${i + 1}_saved`);
    }

    // Final screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1000);
    await screenshot(page, '06_all_panels_done');

    console.log('\n🎉 ¡Proceso completado! Verificá los paneles en tu canal.');
    console.log('   Dejando el navegador abierto 30 segundos para revisión...');
    await sleep(30000);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    await screenshot(page, 'error_state');
    await sleep(15000);
  } finally {
    await context.close();
    console.log('\n👋 Navegador cerrado.');
  }
}

main().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
