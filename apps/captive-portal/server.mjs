import http from 'node:http';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// CONFIG
// ============================================================================
const PORT = parseInt(process.env.PORTAL_PORT || '8888', 10);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REDIRECT_URL = process.env.REDIRECT_URL || 'https://autamedica.com';

const supabase = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// ============================================================================
// CAPTIVE PORTAL DETECTION PATHS
// iOS, Android, Windows, Samsung, Firefox — all check different URLs
// ============================================================================
const _CAPTIVE_DETECT_PATHS = new Set([
  '/hotspot-detect.html',            // Apple iOS / macOS
  '/library/test/success.html',      // Apple legacy
  '/generate_204',                   // Android / Chrome OS
  '/gen_204',                        // Android alt
  '/connecttest.txt',                // Windows 10/11
  '/ncsi.txt',                       // Windows legacy
  '/redirect',                       // Windows alt
  '/canonical.html',                 // Firefox
  '/success.txt',                    // Firefox alt
  '/check_network_status.txt',       // Samsung
]);

const _CAPTIVE_DETECT_HOSTS = new Set([
  'captive.apple.com',
  'www.apple.com',
  'connectivitycheck.gstatic.com',
  'clients3.google.com',
  'play.googleapis.com',
  'www.msftconnecttest.com',
  'www.msftncsi.com',
  'detectportal.firefox.com',
  'connectivity-check.ubuntu.com',
]);

// ============================================================================
// HTML PORTAL PAGE — Premium Dark Ivory Design
// ============================================================================
function getPortalHTML() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>AutaMedica WiFi — Conectá gratis</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-primary: #0C0B0A;
      --bg-card: #1A1918;
      --bg-input: #252322;
      --text-primary: #FAF8F5;
      --text-secondary: #A8A29E;
      --accent: #D4A853;
      --accent-glow: rgba(212, 168, 83, 0.3);
      --success: #4ADE80;
      --error: #F87171;
      --radius: 16px;
    }

    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      overflow-x: hidden;
    }

    /* Animated gradient bg */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: 
        radial-gradient(ellipse 600px 400px at 50% 0%, rgba(212,168,83,0.12), transparent),
        radial-gradient(ellipse 400px 300px at 80% 100%, rgba(212,168,83,0.06), transparent);
      z-index: 0;
      animation: pulse-bg 8s ease-in-out infinite alternate;
    }

    @keyframes pulse-bg {
      0% { opacity: 0.7; }
      100% { opacity: 1; }
    }

    .container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }

    /* Logo */
    .logo-area {
      text-align: center;
      animation: fadeInDown 0.6s ease-out;
    }

    .logo-icon {
      width: 72px;
      height: 72px;
      background: linear-gradient(135deg, var(--accent), #B8860B);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 36px;
      box-shadow: 0 8px 32px var(--accent-glow);
    }

    .logo-area h1 {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, var(--text-primary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .logo-area p {
      color: var(--text-secondary);
      font-size: 14px;
      margin-top: 6px;
    }

    /* WiFi signal animation */
    .wifi-signal {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 3px;
      height: 36px;
      margin-bottom: 8px;
    }

    .wifi-signal .bar {
      width: 6px;
      border-radius: 3px;
      background: var(--accent);
      animation: wifi-pulse 1.5s ease-in-out infinite;
    }

    .wifi-signal .bar:nth-child(1) { height: 8px; animation-delay: 0s; }
    .wifi-signal .bar:nth-child(2) { height: 16px; animation-delay: 0.2s; }
    .wifi-signal .bar:nth-child(3) { height: 24px; animation-delay: 0.4s; }
    .wifi-signal .bar:nth-child(4) { height: 32px; animation-delay: 0.6s; }

    @keyframes wifi-pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }

    /* Card */
    .card {
      width: 100%;
      background: var(--bg-card);
      border: 1px solid rgba(212,168,83,0.15);
      border-radius: var(--radius);
      padding: 28px 24px;
      animation: fadeInUp 0.6s ease-out 0.2s both;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }

    .card h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .card .subtitle {
      color: var(--text-secondary);
      font-size: 13px;
      margin-bottom: 20px;
      line-height: 1.5;
    }

    /* Form */
    .form-group {
      margin-bottom: 14px;
    }

    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .form-group input {
      width: 100%;
      background: var(--bg-input);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 14px 16px;
      font-size: 16px;
      color: var(--text-primary);
      font-family: inherit;
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
      -webkit-appearance: none;
    }

    .form-group input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .form-group input::placeholder {
      color: rgba(168,162,158,0.5);
    }

    /* Submit */
    .btn-submit {
      width: 100%;
      background: linear-gradient(135deg, var(--accent), #B8860B);
      color: #0C0B0A;
      border: none;
      border-radius: 12px;
      padding: 16px;
      font-size: 16px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      margin-top: 8px;
      transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
      box-shadow: 0 4px 16px var(--accent-glow);
      letter-spacing: 0.3px;
    }

    .btn-submit:active {
      transform: scale(0.97);
    }

    .btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-submit.loading {
      pointer-events: none;
      opacity: 0.7;
    }

    /* Skip */
    .skip-link {
      display: block;
      text-align: center;
      margin-top: 14px;
      color: var(--text-secondary);
      font-size: 13px;
      text-decoration: none;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .skip-link:active { opacity: 1; }

    /* Benefits */
    .benefits {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      animation: fadeInUp 0.6s ease-out 0.4s both;
    }

    .benefit {
      background: var(--bg-card);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 14px 12px;
      text-align: center;
    }

    .benefit-icon {
      font-size: 24px;
      margin-bottom: 6px;
    }

    .benefit-text {
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    /* Success State */
    .success-state {
      display: none;
      text-align: center;
      padding: 20px 0;
    }

    .success-state.show {
      display: block;
      animation: fadeInUp 0.4s ease-out;
    }

    .success-check {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(74,222,128,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 32px;
    }

    .success-state h3 {
      font-size: 20px;
      font-weight: 700;
      color: var(--success);
      margin-bottom: 8px;
    }

    .success-state p {
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    .error-msg {
      color: var(--error);
      font-size: 13px;
      margin-top: 8px;
      display: none;
    }

    /* Footer */
    .footer {
      text-align: center;
      color: var(--text-secondary);
      font-size: 11px;
      opacity: 0.5;
      margin-top: 8px;
      animation: fadeInUp 0.6s ease-out 0.6s both;
    }

    .footer a {
      color: var(--accent);
      text-decoration: none;
    }

    /* Animations */
    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-area">
      <div class="wifi-signal">
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
      </div>
      <div class="logo-icon">🏥</div>
      <h1>AutaMedica</h1>
      <p>WiFi Gratis · Tu salud, a un mensaje</p>
    </div>

    <div class="card" id="registration-card">
      <h2>📶 Conectate gratis</h2>
      <p class="subtitle">
        Registrate para acceder a internet y recibí un <strong>descuento exclusivo</strong> en tu primera videoconsulta médica.
      </p>

      <form id="wifi-form">
        <div class="form-group">
          <label for="name">Tu nombre</label>
          <input type="text" id="name" name="name" placeholder="Ej: María García" required autocomplete="name" />
        </div>

        <div class="form-group">
          <label for="phone">WhatsApp / Celular</label>
          <input type="tel" id="phone" name="phone" placeholder="+54 9 11 1234-5678" required autocomplete="tel" />
        </div>

        <div class="form-group">
          <label for="email">Email (opcional)</label>
          <input type="email" id="email" name="email" placeholder="maria@ejemplo.com" autocomplete="email" />
        </div>

        <button type="submit" class="btn-submit" id="submit-btn">
          🌐 Conectarme a Internet
        </button>

        <div class="error-msg" id="error-msg"></div>
      </form>

      <div class="success-state" id="success-state">
        <div class="success-check">✅</div>
        <h3>¡Conectado!</h3>
        <p>Ya tenés internet gratis.<br>Revisá tu WhatsApp para tu cupón de descuento.</p>
      </div>

      <a href="${REDIRECT_URL}" class="skip-link" id="skip-link">Saltar y navegar sin registrarme →</a>
    </div>

    <div class="benefits">
      <div class="benefit">
        <div class="benefit-icon">🩺</div>
        <div class="benefit-text">Videoconsultas<br>desde $2.000</div>
      </div>
      <div class="benefit">
        <div class="benefit-icon">💊</div>
        <div class="benefit-text">Recetas<br>digitales</div>
      </div>
      <div class="benefit">
        <div class="benefit-icon">🤖</div>
        <div class="benefit-text">Asistente IA<br>24/7</div>
      </div>
      <div class="benefit">
        <div class="benefit-icon">📱</div>
        <div class="benefit-text">App móvil<br>gratuita</div>
      </div>
    </div>

    <div class="footer">
      <p>Powered by <a href="https://autamedica.com">AutaMedica.com</a> · Argentina 🇦🇷</p>
    </div>
  </div>

  <script>
    const form = document.getElementById('wifi-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMsg = document.getElementById('error-msg');
    const successState = document.getElementById('success-state');
    const skipLink = document.getElementById('skip-link');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      submitBtn.classList.add('loading');
      submitBtn.textContent = '⏳ Conectando...';

      const data = {
        name: document.getElementById('name').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        email: document.getElementById('email').value.trim() || null,
        source: 'captive_portal_wifi',
        device: navigator.userAgent,
      };

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) throw new Error('Error del servidor');

        // Success!
        form.style.display = 'none';
        skipLink.style.display = 'none';
        successState.classList.add('show');

        // Redirect after 3s
        setTimeout(() => {
          window.location.href = '${REDIRECT_URL}';
        }, 3000);
      } catch (err) {
        errorMsg.textContent = 'No pudimos registrarte. Intentá de nuevo.';
        errorMsg.style.display = 'block';
        submitBtn.classList.remove('loading');
        submitBtn.textContent = '🌐 Conectarme a Internet';
      }
    });
  </script>
</body>
</html>`;
}

// ============================================================================
// HTTP SERVER
// ============================================================================
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '';
  const urlPath = new URL(req.url || '/', `http://${host}`).pathname;

  // Log all requests for debugging
  console.log(`[${new Date().toISOString()}] ${req.method} ${host}${urlPath}`);

  // ----- Captive Portal Detection Responses -----
  // These specific responses trigger the "Sign in to network" popup on devices

  // Apple iOS/macOS — expects exact HTML with "Success" text
  if (urlPath === '/hotspot-detect.html' || urlPath === '/library/test/success.html') {
    res.writeHead(302, {
      'Location': `http://192.168.0.2:${PORT}/portal`,
      'Cache-Control': 'no-cache, no-store',
    });
    res.end();
    return;
  }

  // Android/Chrome — expects HTTP 204, we return 302 to trigger popup
  if (urlPath === '/generate_204' || urlPath === '/gen_204') {
    res.writeHead(302, {
      'Location': `http://192.168.0.2:${PORT}/portal`,
      'Cache-Control': 'no-cache, no-store',
    });
    res.end();
    return;
  }

  // Windows — expects specific text
  if (urlPath === '/connecttest.txt' || urlPath === '/ncsi.txt' || urlPath === '/redirect') {
    res.writeHead(302, {
      'Location': `http://192.168.0.2:${PORT}/portal`,
      'Cache-Control': 'no-cache, no-store',
    });
    res.end();
    return;
  }

  // Firefox
  if (urlPath === '/canonical.html' || urlPath === '/success.txt') {
    res.writeHead(302, {
      'Location': `http://192.168.0.2:${PORT}/portal`,
      'Cache-Control': 'no-cache, no-store',
    });
    res.end();
    return;
  }

  // Samsung
  if (urlPath === '/check_network_status.txt') {
    res.writeHead(302, {
      'Location': `http://192.168.0.2:${PORT}/portal`,
      'Cache-Control': 'no-cache, no-store',
    });
    res.end();
    return;
  }

  // ----- Portal Page -----
  if (urlPath === '/portal' || urlPath === '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    });
    res.end(getPortalHTML());
    return;
  }

  // ----- Registration API -----
  if (req.method === 'POST' && urlPath === '/api/register') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { name, phone, email, source, device } = data;

        if (!name || !phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'name and phone are required' }));
          return;
        }

        console.log(`📝 Nuevo lead WiFi: ${name} | ${phone} | ${email || 'sin email'}`);

        // Save to Supabase if configured
        if (supabase) {
          const { error } = await supabase
            .from('wifi_leads')
            .upsert({
              name,
              phone: phone.replace(/[\s\-()]/g, ''),
              email: email || null,
              source: source || 'captive_portal',
              device_info: device || null,
              registered_at: new Date().toISOString(),
            }, { onConflict: 'phone' });

          if (error) {
            console.error('❌ Supabase error:', error);
            // Don't block the user — still give them internet
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'registered' }));
      } catch (err) {
        console.error('❌ Parse error:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid request body' }));
      }
    });
    return;
  }

  // ----- Health Check -----
  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    }));
    return;
  }

  // ----- Any other request → redirect to portal -----
  res.writeHead(302, { 'Location': `http://192.168.0.2:${PORT}/portal` });
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  🏥 AutaMedica Captive Portal                   ║
║  📡 Listening on http://0.0.0.0:${PORT}            ║
║  🌐 Portal URL: http://192.168.0.2:${PORT}/portal  ║
║  💾 Supabase: ${supabase ? '✅ Connected' : '⚠️  Not configured'}               ║
╚══════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => { console.log('\n🛑 Portal shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n🛑 Portal shutting down...'); process.exit(0); });
