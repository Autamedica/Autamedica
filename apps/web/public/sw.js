const CACHE_NAME = 'autamedica-static-v1';
const DYNAMIC_CACHE_NAME = 'autamedica-dynamic-v1';

// Recursos esenciales a pre-cachear durante la instalación
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/logo.png',
  '/images/brand/logo_bioceramic.png',
  '/font-demo.html',
  '/robots.txt'
];

// Instalar el Service Worker y almacenar activos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-cacheando recursos estáticos esenciales');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activar y limpiar cachés viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antiguo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Escuchar skipWaiting desde el prompt de UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Interceptar peticiones y aplicar estrategias de caché inteligente
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Ignorar llamadas a Supabase, Edge Functions directas, extensiones de navegador y analíticas de terceros
  if (
    request.method !== 'GET' ||
    !(url.protocol === 'http:' || url.protocol === 'https:') ||
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/api/auth') ||
    url.pathname.includes('/realtime/') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('googleadservices.com') ||
    url.hostname.includes('doubleclick.net') ||
    url.hostname.includes('google.com')
  ) {
    return;
  }

  // 2. Estrategia: Cache First para activos estáticos locales y fuentes de Google Fonts
  const isStaticAsset = 
    STATIC_ASSETS.includes(url.pathname) ||
    url.pathname.match(/\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|svg|ico|css|js|webp)$/) ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Descargar, almacenar en caché estático y retornar
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        }).catch(() => {
          // Fallback silencioso si la descarga falla
          return new Response('Recurso no disponible offline', { status: 408, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  // 3. Estrategia: Network First, Fallback to Cache para páginas HTML dinámicas (Portales) y llamadas API locales
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Guardar la última respuesta exitosa en el caché dinámico
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // En caso de estar sin conexión, servir desde el caché dinámico
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // Si solicita una página HTML de navegación y no está cacheada, dar una respuesta offline amigable
          if (request.headers.get('accept').includes('text/html')) {
            return new Response(
              `<!DOCTYPE html>
              <html lang="es">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sin Conexión | AutaMedica</title>
                <style>
                  body {
                    background-color: #0B0F19;
                    color: #F3F4F6;
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                    box-sizing: border-box;
                    text-align: center;
                  }
                  .card {
                    max-width: 420px;
                    background: rgba(17, 24, 39, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    padding: 40px 30px;
                    border-radius: 24px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    backdrop-filter: blur(12px);
                  }
                  .icon {
                    width: 64px;
                    height: 64px;
                    background: rgba(239, 68, 68, 0.1);
                    color: #EF4444;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 24px;
                    font-size: 28px;
                    font-weight: bold;
                  }
                  h1 {
                    font-size: 22px;
                    margin: 0 0 12px;
                    font-weight: 700;
                    letter-spacing: -0.025em;
                  }
                  p {
                    color: #9CA3AF;
                    font-size: 14px;
                    line-height: 1.6;
                    margin: 0 0 24px;
                  }
                  button {
                    background: #0284c7;
                    color: #FFFFFF;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s;
                  }
                  button:hover {
                    background: #0369a1;
                  }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="icon">⚡</div>
                  <h1>Sin conexión a internet</h1>
                  <p>No se pudo conectar al servidor de AutaMedica. Por favor, verificá tu conexión a datos móviles o Wi-Fi para ingresar al sistema clínico.</p>
                  <button onclick="window.location.reload()">Reintentar Conexión</button>
                </div>
              </body>
              </html>`,
              {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
              }
            );
          }
        });
      })
  );
});
