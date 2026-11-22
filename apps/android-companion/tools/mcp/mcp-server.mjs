#!/usr/bin/env node
import readline from "node:readline";
import { chromium } from "playwright-core";

const DEFAULT_CANDIDATE_BASES = [
  process.env.AUTAMEDICA_ANDROID_URL,
  "http://127.0.0.1:18775",
  "http://127.0.0.1:18765"
].filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i);
const EXPLICIT_CDP = process.env.AUTAMEDICA_CDP_URL || "";
const TOKEN = process.env.AUTAMEDICA_ANDROID_TOKEN || "";
const PROTOCOL = "2024-11-05";

let activeBase = DEFAULT_CANDIDATE_BASES[0] || "http://127.0.0.1:18775";

function pairedCdpUrl(baseUrl) {
  if (EXPLICIT_CDP && baseUrl === process.env.AUTAMEDICA_ANDROID_URL) return EXPLICIT_CDP;
  try {
    const u = new URL(baseUrl);
    const port = Number(u.port || 18765);
    u.port = String(port + 1);
    return u.toString().replace(/\/$/, "");
  } catch {
    return EXPLICIT_CDP || "http://127.0.0.1:18766";
  }
}

if (!TOKEN || TOKEN.length < 64) {
  process.stderr.write("AUTAMEDICA_ANDROID_TOKEN (256-bit token) is required.\n");
  process.exit(2);
}

let browser = null;
let connecting = null;
let activePage = null;
const networkEvents = [];
const attachedPages = new WeakSet();

const tools = [
  { name: "android_status", description: "Estado de Autamedica Companion, accesibilidad y puertos locales.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_get_ui_tree", description: "Lee el árbol de accesibilidad Android profundo (hasta 24 niveles / 1200 nodos); contraseñas ocultas.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_get_ui_compact", description: "Devuelve snapshot transaccional (snapshotId, generation, package) con elementos semánticos (ref, path, text, hint, checked, editable, bounds) podando contenedores vacíos hasta profundidad 28.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_set_text", description: "Inyecta texto directo en un nodo Android por path o ref+snapshot_id (ACTION_SET_TEXT) sin abrir el teclado (~15 ms), con guardia opcional expected_package.", inputSchema: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" }, snapshot_id: { type: "string" }, expected_package: { type: "string" }, strict_generation: { type: "boolean" }, text: { type: "string" } }, required: ["text"], additionalProperties: false } },
  { name: "android_screenshot", description: "Captura la pantalla completa del Xiaomi.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_open_app", description: "Abre una aplicación Android por package name.", inputSchema: { type: "object", properties: { package: { type: "string" } }, required: ["package"], additionalProperties: false } },
  { name: "android_tap", description: "Toca una coordenada de pantalla Android (con guardia opcional expected_package).", inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, expected_package: { type: "string" } }, required: ["x", "y"], additionalProperties: false } },
  { name: "android_click_element", description: "Pulsa un nodo Android por path o por ref+snapshot_id con guardia transaccional expected_package.", inputSchema: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" }, snapshot_id: { type: "string" }, expected_package: { type: "string" }, strict_generation: { type: "boolean" } }, additionalProperties: false } },
  { name: "android_click_text", description: "Busca y pulsa un elemento Android por texto, descripción o view_id con espera reactiva y guardia expected_package.", inputSchema: { type: "object", properties: { text: { type: "string" }, view_id: { type: "string" }, expected_package: { type: "string" }, timeout_ms: { type: "integer", minimum: 0, maximum: 15000 } }, additionalProperties: false } },
  { name: "android_scroll", description: "Hace scroll semántico (forward/backward/down/up/left/right) en un contenedor específico por path/ref o en el contenedor principal.", inputSchema: { type: "object", properties: { direction: { type: "string", enum: ["forward", "backward", "down", "up", "left", "right"] }, path: { type: "string" }, ref: { type: "string" }, snapshot_id: { type: "string" }, expected_package: { type: "string" } }, additionalProperties: false } },
  { name: "android_scroll_until", description: "Hace scroll nativo en bucle dentro del dispositivo hasta encontrar text o view_id en una sola llamada HTTP (opcionalmente hace click atómico).", inputSchema: { type: "object", properties: { text: { type: "string" }, view_id: { type: "string" }, path: { type: "string" }, ref: { type: "string" }, snapshot_id: { type: "string" }, direction: { type: "string", enum: ["forward", "backward", "down", "up", "left", "right"] }, max_scrolls: { type: "integer", minimum: 1, maximum: 25 }, delay_ms: { type: "integer", minimum: 50, maximum: 2000 }, click: { type: "boolean" }, expected_package: { type: "string" } }, additionalProperties: false } },
  { name: "android_ime_action", description: "Ejecuta ACTION_IME_ENTER (Enviar/Buscar/Listo) sobre el campo enfocado o un nodo por path/ref sin abrir teclado.", inputSchema: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" }, snapshot_id: { type: "string" }, expected_package: { type: "string" }, strict_generation: { type: "boolean" } }, additionalProperties: false } },
  { name: "android_long_press", description: "Ejecuta pulsación prolongada (ACTION_LONG_CLICK o gesto) sobre path/ref o coordenadas (x, y).", inputSchema: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" }, snapshot_id: { type: "string" }, x: { type: "number" }, y: { type: "number" }, duration_ms: { type: "integer", minimum: 400, maximum: 3000 }, expected_package: { type: "string" } }, additionalProperties: false } },
  { name: "android_double_tap", description: "Ejecuta doble toque sobre path/ref o coordenadas (x, y).", inputSchema: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" }, snapshot_id: { type: "string" }, x: { type: "number" }, y: { type: "number" }, interval_ms: { type: "integer", minimum: 40, maximum: 250 }, expected_package: { type: "string" } }, additionalProperties: false } },
  { name: "android_assert_package", description: "Verifica que la app en primer plano coincida con package (esperando reactivamente si timeout_ms > 0).", inputSchema: { type: "object", properties: { package: { type: "string" }, timeout_ms: { type: "integer", minimum: 0, maximum: 15000 } }, required: ["package"], additionalProperties: false } },
  { name: "android_events_recent", description: "Lee eventos recientes del Event Bus reactivo (window_state_changed, window_content_changed, view_scrolled, toast, notification_posted).", inputSchema: { type: "object", properties: { since_seq: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 250 }, types: { type: "string" }, package: { type: "string" } }, additionalProperties: false } },
  { name: "android_events_wait", description: "Espera reactivamente (sin polling) a que ocurra un evento de accesibilidad o notificación en el Event Bus.", inputSchema: { type: "object", properties: { since_seq: { type: "integer", minimum: 0 }, types: { type: "array", items: { type: "string" } }, package: { type: "string" }, text: { type: "string" }, timeout_ms: { type: "integer", minimum: 100, maximum: 30000 } }, additionalProperties: false } },
  { name: "android_get_clipboard", description: "Lee el texto actual del portapapeles de Android.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_set_clipboard", description: "Copia un texto al portapapeles de Android.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } },
  { name: "android_paste", description: "Pega texto en el campo Android enfocado usando el portapapeles.", inputSchema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false } },
  { name: "android_recent_notifications", description: "Devuelve las notificaciones recientes capturadas por NotificationListenerService.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_type", description: "Escribe en el campo Android que tenga el foco.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } },
  { name: "android_swipe", description: "Ejecuta un gesto Android.", inputSchema: { type: "object", properties: { x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" }, duration_ms: { type: "integer", minimum: 50, maximum: 5000 } }, required: ["x1", "y1", "x2", "y2"], additionalProperties: false } },
  { name: "android_back", description: "Ejecuta Atrás en Android (con guardia opcional expected_package para evitar cerrar otra app o Termux).", inputSchema: { type: "object", properties: { expected_package: { type: "string" } }, additionalProperties: false } },
  { name: "android_home", description: "Vuelve al inicio de Android (con guardia opcional expected_package).", inputSchema: { type: "object", properties: { expected_package: { type: "string" } }, additionalProperties: false } },
  { name: "android_recents", description: "Abre apps recientes en Android.", inputSchema: { type: "object", properties: { expected_package: { type: "string" } }, additionalProperties: false } },
  { name: "android_notifications", description: "Despliega la barra de notificaciones en Android.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_runtime", description: "Inicia o detiene el Foreground Service de Autamedica Companion (PARTIAL_WAKE_LOCK para automatización con pantalla apagada en MIUI).", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["start", "stop"] } }, required: ["action"], additionalProperties: false } },
  { name: "android_list_packages", description: "Lista las aplicaciones instaladas y lanzables en Android.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_device_info", description: "Devuelve batería, carga, screen_off_timeout, stay_on_while_plugged_in y resolución de pantalla.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_batch", description: "Ejecuta hasta 60 acciones Android en una sola llamada HTTP (open, assert_package, wait_for_text, tap, click, click_text, set_text, scroll, scroll_until, ime_action, long_press, double_tap, paste, type, swipe, back, home, recents, sleep, ui, ui_compact) con guardia transaccional expected_package y snapshot_id.", inputSchema: { type: "object", properties: { steps: { type: "array", items: { type: "object" } }, expected_package: { type: "string" }, snapshot_id: { type: "string" }, strict_generation: { type: "boolean" } }, required: ["steps"], additionalProperties: false } },
  { name: "android_open_url", description: "Abre un enlace web o esquema de aplicación en Android.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } },

  { name: "browser_status", description: "Comprueba conexión CDP, motor Chromium/WebView, pestañas, URL y título.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser_navigate", description: "Abre el navegador Companion y navega a cualquier sitio HTTP/HTTPS con Internet.", inputSchema: { type: "object", properties: { url: { type: "string" }, wait_until: { type: "string", enum: ["load", "domcontentloaded", "networkidle", "commit"] } }, required: ["url"], additionalProperties: false } },
  { name: "browser_state", description: "Devuelve estado rápido del WebView (ready, url, title, progress, canGoBack, canGoForward) vía Tier-1 HTTP sin requerir Playwright.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser_wait", description: "Espera en el dispositivo a que cargue el documento o aparezca un selector CSS o texto en el WebView (Tier-1 HTTP).", inputSchema: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" }, timeout_ms: { type: "integer", minimum: 200, maximum: 20000 } }, additionalProperties: false } },
  { name: "browser_back", description: "Navega hacia atrás en el historial del WebView Companion.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser_forward", description: "Navega hacia adelante en el historial del WebView Companion.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser_snapshot", description: "Extrae en una sola llamada los controles DOM interactivos visibles (ref, selector, label, value, checked) del WebView.", inputSchema: { type: "object", properties: { include_hidden: { type: "boolean" } }, additionalProperties: false } },
  { name: "web_fetch_clean", description: "Tier 0 sin navegador: descarga una URL por HTTP y devuelve texto semántico/JSON y enlaces en milisegundos.", inputSchema: { type: "object", properties: { url: { type: "string" }, max_chars: { type: "integer", minimum: 500, maximum: 50000 } }, required: ["url"], additionalProperties: false } },
  { name: "browser_click", description: "Playwright locator(selector).click() con auto-wait y comprobación de visibilidad.", inputSchema: { type: "object", properties: { selector: { type: "string" }, timeout_ms: { type: "integer", minimum: 500, maximum: 60000 } }, required: ["selector"], additionalProperties: false } },
  { name: "browser_fill", description: "Playwright locator(selector).fill(value), con eventos input/change.", inputSchema: { type: "object", properties: { selector: { type: "string" }, value: { type: "string" }, timeout_ms: { type: "integer", minimum: 500, maximum: 60000 } }, required: ["selector", "value"], additionalProperties: false } },
  { name: "browser_get_text", description: "Obtiene el texto renderizado de la página o de un selector CSS.", inputSchema: { type: "object", properties: { selector: { type: "string" } }, additionalProperties: false } },
  { name: "browser_get_url", description: "Devuelve la URL y el título de la pestaña activa.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser_evaluate", description: "Ejecuta JavaScript en el contexto de la página mediante Playwright.", inputSchema: { type: "object", properties: { script: { type: "string" } }, required: ["script"], additionalProperties: false } },
  { name: "browser_screenshot", description: "Captura la página Chromium (viewport o página completa) con Playwright.", inputSchema: { type: "object", properties: { full_page: { type: "boolean" } }, additionalProperties: false } },
  { name: "browser_wait_for_selector", description: "Espera que un selector CSS alcance el estado visible, attached o hidden.", inputSchema: { type: "object", properties: { selector: { type: "string" }, state: { type: "string", enum: ["attached", "detached", "visible", "hidden"] }, timeout_ms: { type: "integer", minimum: 500, maximum: 60000 } }, required: ["selector"], additionalProperties: false } },
  { name: "browser_list_tabs", description: "Lista las páginas/tabs Chromium visibles para la sesión CDP.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser_network_log", description: "Devuelve eventos de solicitudes, respuestas y fallos HTTP observados desde el inicio de la captura.", inputSchema: { type: "object", properties: { clear: { type: "boolean" }, limit: { type: "integer", minimum: 1, maximum: 200 } }, additionalProperties: false } },
  { name: "browser_reload", description: "Recarga la página actual mediante Playwright.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser_cdp_send", description: "Envía cualquier método CDP directamente al target Chromium activo, sin una lista blanca de comandos. Ejemplos: Network.enable, Page.getLayoutMetrics, Runtime.evaluate, Fetch.enable.", inputSchema: { type: "object", properties: { method: { type: "string" }, params: { type: "object" } }, required: ["method"], additionalProperties: false } },
  { name: "browser_session_state", description: "Informa dominios y nombres de cookies persistidas, claves de localStorage y URL restaurable. Nunca devuelve valores de cookies.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "vault_list_keys", description: "Lista nombres de claves guardadas en la bóveda cifrada Android Keystore.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "vault_store_secret", description: "Guarda una clave o secreto en la bóveda AES-256-GCM protegida por Android Keystore.", inputSchema: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"], additionalProperties: false } },
  { name: "vault_read_secret", description: "Lee un secreto de la bóveda Android cifrada cuando la tarea lo necesita.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } },
  { name: "vault_delete_secret", description: "Elimina un secreto de la bóveda cifrada; el token de conexión está protegido.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } },

  { name: "android_wait_for_text", description: "Espera texto o view_id visible en Android usando el Event Bus reactivo (sin polling) y guardia opcional expected_package.", inputSchema: { type: "object", properties: { text: { type: "string" }, view_id: { type: "string" }, expected_package: { type: "string" }, timeout_ms: { type: "integer", minimum: 200, maximum: 20000 } }, additionalProperties: false } }
];

async function request(path, options = {}) {
  const candidates = [activeBase, ...DEFAULT_CANDIDATE_BASES.filter(b => b !== activeBase)];
  let lastNetworkError = null;
  for (const base of candidates) {
    try {
      const response = await fetch(base + path, {
        ...options,
        headers: { Authorization: "Bearer " + TOKEN, ...(options.headers || {}) },
        signal: AbortSignal.timeout(25000)
      });
      activeBase = base;
      if (!response.ok) {
        const message = await response.text();
        throw new Error("Android Companion HTTP " + response.status + ": " + message.slice(0, 500));
      }
      return response;
    } catch (err) {
      if (String(err?.message || "").startsWith("Android Companion HTTP ")) throw err;
      lastNetworkError = err;
    }
  }
  throw lastNetworkError || new Error("Android Companion no responde en puertos " + candidates.join(", "));
}

async function post(path, args) {
  const response = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  return response.json();
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|auth|code|secret|password|signature|session|key/i.test(key))
        url.searchParams.set(key, "[REDACTED]");
    }
    return url.toString();
  } catch { return String(value).slice(0, 2000); }
}

function recordNetwork(event) {
  networkEvents.push({ at: new Date().toISOString(), ...event });
  if (networkEvents.length > 200) networkEvents.splice(0, networkEvents.length - 200);
}

function attachNetwork(page) {
  if (attachedPages.has(page)) return;
  attachedPages.add(page);
  page.on("request", request => {
    recordNetwork({
      event: "request",
      method: request.method(),
      url: redactUrl(request.url()),
      resourceType: request.resourceType()
    });
  });
  page.on("response", response => {
    recordNetwork({
      event: "response",
      method: response.request().method(),
      url: redactUrl(response.url()),
      status: response.status(),
      ok: response.ok()
    });
  });
  page.on("requestfailed", request => {
    recordNetwork({
      event: "requestfailed",
      method: request.method(),
      url: redactUrl(request.url()),
      error: request.failure()?.errorText || "request failed"
    });
  });
}

async function ensureBrowser(timeoutMs = 20000) {
  if (browser?.isConnected()) return browser;
  if (connecting) return connecting;
  connecting = (async () => {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const cdpEndpoint = pairedCdpUrl(activeBase);
        browser = await chromium.connectOverCDP(cdpEndpoint, {
          headers: { Authorization: "Bearer " + TOKEN },
          timeout: Math.min(10000, Math.max(1500, deadline - Date.now()))
        });
        browser.on("disconnected", () => {
          browser = null;
          connecting = null;
          activePage = null;
        });
        return browser;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }
    throw new Error("CDP no disponible en " + pairedCdpUrl(activeBase) + ". Abrí Autamedica Companion y activá Accesibilidad. Último error: " + String(lastError?.message || lastError));
  })();
  try { return await connecting; }
  finally { connecting = null; }
}

async function ensurePage() {
  const b = await ensureBrowser();
  const contexts = b.contexts();
  if (!contexts.length) throw new Error("Chromium CDP respondió pero todavía no publicó un BrowserContext.");
  const pages = contexts[0].pages();
  if (!pages.length) throw new Error("Chromium está conectado, pero no hay pestañas abiertas. Usá browser_navigate.");
  if (!activePage || activePage.isClosed() || !pages.includes(activePage)) activePage = pages[0];
  attachNetwork(activePage);
  activePage.setDefaultTimeout(15000);
  return activePage;
}

function requireHttpUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Solo se permiten URLs HTTP y HTTPS.");
  return url.toString();
}

async function callTool(name, args) {
  switch (name) {
    case "android_status":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/health")).json()) }];
    case "android_get_ui_tree":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/ui")).json()) }];
    case "android_get_ui_compact":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/ui/compact")).json()) }];
    case "android_set_text":
      return [{ type: "text", text: JSON.stringify(await post("/v1/set_text", args)) }];
    case "browser_state":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/browser/state")).json()) }];
    case "browser_wait":
      return [{ type: "text", text: JSON.stringify(await post("/v1/browser/wait", args)) }];
    case "browser_back":
      return [{ type: "text", text: JSON.stringify(await post("/v1/browser/back", {})) }];
    case "browser_forward":
      return [{ type: "text", text: JSON.stringify(await post("/v1/browser/forward", {})) }];
    case "browser_snapshot": {
      const qs = args.include_hidden ? "?all=1" : "";
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/browser/snapshot" + qs)).json()) }];
    }
    case "web_fetch_clean": {
      const targetUrl = requireHttpUrl(args.url);
      const maxChars = Math.max(500, Math.min(50000, Number(args.max_chars || 16000)));
      const resp = await fetch(targetUrl, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile" } });
      const ctype = resp.headers.get("content-type") || "";
      const raw = await resp.text();
      if (ctype.includes("application/json")) {
        return [{ type: "text", text: raw.slice(0, maxChars) }];
      }
      const clean = raw
        .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, "\n")
        .replace(/<\/?(p|div|li|tr|h[1-6]|br|section|article)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return [{ type: "text", text: JSON.stringify({ url: resp.url, status: resp.status, text: clean.slice(0, maxChars) }) }];
    }
    case "android_screenshot": {
      const response = await request("/v1/screenshot");
      return [{ type: "image", data: Buffer.from(await response.arrayBuffer()).toString("base64"), mimeType: "image/png" }];
    }
    case "android_open_app":
      return [{ type: "text", text: JSON.stringify(await post("/v1/open", args)) }];
    case "android_tap":
      return [{ type: "text", text: JSON.stringify(await post("/v1/tap", args)) }];
    case "android_click_element":
      return [{ type: "text", text: JSON.stringify(await post("/v1/click", args)) }];
    case "android_click_text":
      return [{ type: "text", text: JSON.stringify(await post("/v1/click_text", args)) }];
    case "android_scroll":
      return [{ type: "text", text: JSON.stringify(await post("/v1/scroll", args)) }];
    case "android_scroll_until":
      return [{ type: "text", text: JSON.stringify(await post("/v1/scroll_until", args)) }];
    case "android_ime_action":
      return [{ type: "text", text: JSON.stringify(await post("/v1/ime_action", args)) }];
    case "android_long_press":
      return [{ type: "text", text: JSON.stringify(await post("/v1/long_press", args)) }];
    case "android_double_tap":
      return [{ type: "text", text: JSON.stringify(await post("/v1/double_tap", args)) }];
    case "android_assert_package":
      return [{ type: "text", text: JSON.stringify(await post("/v1/assert_package", args)) }];
    case "android_events_recent": {
      const qs = new URLSearchParams();
      if (args.since_seq !== undefined) qs.set("since_seq", String(args.since_seq));
      if (args.limit !== undefined) qs.set("limit", String(args.limit));
      if (args.types) qs.set("types", String(args.types));
      if (args.package) qs.set("package", String(args.package));
      const suffix = qs.toString() ? "?" + qs.toString() : "";
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/events/recent" + suffix)).json()) }];
    }
    case "android_events_wait":
      return [{ type: "text", text: JSON.stringify(await post("/v1/events/wait", args)) }];
    case "android_get_clipboard":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/clipboard")).json()) }];
    case "android_set_clipboard":
      return [{ type: "text", text: JSON.stringify(await post("/v1/clipboard", args)) }];
    case "android_paste":
      return [{ type: "text", text: JSON.stringify(await post("/v1/paste", args)) }];
    case "android_recent_notifications":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/notifications/recent")).json()) }];
    case "android_type":
      return [{ type: "text", text: JSON.stringify(await post("/v1/type", args)) }];
    case "android_swipe":
      return [{ type: "text", text: JSON.stringify(await post("/v1/swipe", args)) }];
    case "android_back":
      return [{ type: "text", text: JSON.stringify(await post("/v1/back", args)) }];
    case "android_home":
      return [{ type: "text", text: JSON.stringify(await post("/v1/home", args)) }];
    case "android_recents":
      return [{ type: "text", text: JSON.stringify(await post("/v1/recents", args)) }];
    case "android_notifications":
      return [{ type: "text", text: JSON.stringify(await post("/v1/notifications", {})) }];
    case "android_runtime": {
      const endpoint = args.action === "stop" ? "/v1/runtime/stop" : "/v1/runtime/start";
      return [{ type: "text", text: JSON.stringify(await post(endpoint, {})) }];
    }
    case "android_list_packages":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/packages")).json()) }];
    case "android_device_info":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/device")).json()) }];
    case "android_batch":
      return [{ type: "text", text: JSON.stringify(await post("/v1/batch", args)) }];
    case "android_open_url":
      return [{ type: "text", text: JSON.stringify(await post("/v1/url", args)) }];
    case "android_wait_for_text": {
      try {
        return [{ type: "text", text: JSON.stringify(await post("/v1/wait_for_text", args)) }];
      } catch (err) {
        if (!String(err?.message || "").includes("HTTP 404")) throw err;
      }
      const needle = String(args.text || "").toLocaleLowerCase();
      const timeout = Math.max(500, Math.min(15000, Number(args.timeout_ms || 8000)));
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const tree = await (await request("/v1/ui")).json();
        if (JSON.stringify(tree).toLocaleLowerCase().includes(needle))
          return [{ type: "text", text: "Texto encontrado: " + args.text }];
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      throw new Error("No apareció el texto dentro del tiempo indicado: " + args.text);
    }

    case "browser_navigate": {
      const url = requireHttpUrl(args.url);
      const waitUntil = ["load", "domcontentloaded", "networkidle", "commit"].includes(args.wait_until) ? args.wait_until : "domcontentloaded";
      if (!browser?.isConnected()) {
        await post("/v1/browser/navigate", { url });
      }
      try {
        const page = await ensurePage();
        await page.goto(url, { waitUntil, timeout: 60000 });
        return [{ type: "text", text: JSON.stringify({ url: page.url(), title: await page.title(), browser: "Chromium WebView via CDP" }) }];
      } catch {
        const state = await post("/v1/browser/wait", { timeout_ms: 10000 }).catch(() => ({ ok: true, url }));
        return [{ type: "text", text: JSON.stringify({ ...state, browser: "Chromium WebView via Tier-1 HTTP fallback" }) }];
      }
    }
    case "browser_status": {
      const b = await ensureBrowser(5000);
      const pages = b.contexts().flatMap(context => context.pages());
      return [{ type: "text", text: JSON.stringify({
        connected: b.isConnected(),
        engine: "Chromium WebView",
        protocol: "Chrome DevTools Protocol",
        pages: await Promise.all(pages.map(async page => ({ url: redactUrl(page.url()), title: await page.title(), active: page === activePage })))
      }) }];
    }
    case "browser_click": {
      try {
        const page = await ensurePage();
        await page.locator(args.selector).click({ timeout: Number(args.timeout_ms || 15000) });
        return [{ type: "text", text: JSON.stringify({ clicked: args.selector, url: page.url() }) }];
      } catch (cdpErr) {
        const fallback = await post("/v1/browser/click", { selector: args.selector });
        if (fallback.ok) return [{ type: "text", text: JSON.stringify({ clicked: args.selector, mode: "tier1_http" }) }];
        throw cdpErr;
      }
    }
    case "browser_fill": {
      try {
        const page = await ensurePage();
        await page.locator(args.selector).fill(args.value, { timeout: Number(args.timeout_ms || 15000) });
        return [{ type: "text", text: JSON.stringify({ filled: args.selector }) }];
      } catch (cdpErr) {
        const fallback = await post("/v1/browser/fill", { selector: args.selector, value: args.value });
        if (fallback.ok) return [{ type: "text", text: JSON.stringify({ filled: args.selector, mode: "tier1_http" }) }];
        throw cdpErr;
      }
    }
    case "browser_get_text": {
      const page = await ensurePage();
      const selector = args.selector || "body";
      const text = await page.locator(selector).innerText({ timeout: 15000 });
      return [{ type: "text", text: text.slice(0, 30000) }];
    }
    case "browser_get_url": {
      try {
        const page = await ensurePage();
        return [{ type: "text", text: JSON.stringify({ url: redactUrl(page.url()), title: await page.title() }) }];
      } catch {
        const st = await (await request("/v1/browser/state")).json();
        return [{ type: "text", text: JSON.stringify({ url: redactUrl(st.url || ""), title: st.title || "", mode: "tier1_http" }) }];
      }
    }
    case "browser_evaluate": {
      if (String(args.script || "").length > 12000) throw new Error("JavaScript excede 12.000 caracteres.");
      try {
        const page = await ensurePage();
        const value = await page.evaluate(source => (0, eval)(source), args.script);
        return [{ type: "text", text: JSON.stringify(value === undefined ? null : value).slice(0, 30000) }];
      } catch {
        const res = await post("/v1/browser/evaluate", { script: args.script });
        return [{ type: "text", text: String(res.value ?? "null").slice(0, 30000) }];
      }
    }
    case "browser_screenshot": {
      const page = await ensurePage();
      const image = await page.screenshot({ fullPage: Boolean(args.full_page), type: "png", timeout: 30000 });
      return [{ type: "image", data: image.toString("base64"), mimeType: "image/png" }];
    }
    case "browser_wait_for_selector": {
      const page = await ensurePage();
      const state = ["attached", "detached", "visible", "hidden"].includes(args.state) ? args.state : "visible";
      await page.locator(args.selector).waitFor({ state, timeout: Number(args.timeout_ms || 15000) });
      return [{ type: "text", text: JSON.stringify({ selector: args.selector, state, found: true }) }];
    }
    case "browser_list_tabs": {
      const b = await ensureBrowser();
      const pages = b.contexts().flatMap(context => context.pages());
      return [{ type: "text", text: JSON.stringify(await Promise.all(pages.map(async (page, index) => ({
        index, active: page === activePage, url: redactUrl(page.url()), title: await page.title()
      })))) }];
    }
    case "browser_network_log": {
      const limit = Math.max(1, Math.min(200, Number(args.limit || 100)));
      const events = networkEvents.slice(-limit);
      if (args.clear) networkEvents.length = 0;
      return [{ type: "text", text: JSON.stringify(events) }];
    }
    case "browser_reload": {
      try {
        const page = await ensurePage();
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
        return [{ type: "text", text: JSON.stringify({ reloaded: true, url: redactUrl(page.url()) }) }];
      } catch {
        const res = await post("/v1/browser/reload", {});
        return [{ type: "text", text: JSON.stringify({ reloaded: Boolean(res.ok), mode: "tier1_http" }) }];
      }
    }
    case "browser_cdp_send": {
      const page = await ensurePage();
      if (!/^[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/.test(args.method))
        throw new Error("CDP method must use Domain.command notation.");
      const session = await page.context().newCDPSession(page);
      try {
        const result = await session.send(args.method, args.params || {});
        return [{ type: "text", text: JSON.stringify(result).slice(0, 60000) }];
      } finally {
        await session.detach().catch(() => {});
      }
    }
    case "browser_session_state": {
      const page = await ensurePage();
      const context = page.context();
      const cookies = await context.cookies();
      const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
      return [{ type: "text", text: JSON.stringify({
        url: redactUrl(page.url()),
        title: await page.title(),
        cookieCount: cookies.length,
        cookies: cookies.map(cookie => ({ name: cookie.name, domain: cookie.domain, path: cookie.path, expires: cookie.expires, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite, value: "[stored]" })),
        localStorageKeys,
        persistence: "Chromium WebView app-private profile; CookieManager.flush() on page lifecycle"
      }) }];
    }
    case "vault_list_keys": {
      const result = await (await request("/v1/vault/names")).json();
      return [{ type: "text", text: JSON.stringify(result) }];
    }
    case "vault_store_secret":
      return [{ type: "text", text: JSON.stringify(await post("/v1/vault/put", args)) }];
    case "vault_read_secret":
      return [{ type: "text", text: JSON.stringify(await post("/v1/vault/get", args)) }];
    case "vault_delete_secret":
      return [{ type: "text", text: JSON.stringify(await post("/v1/vault/delete", args)) }];
    default:
      throw new Error("Unknown tool: " + name);
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  let message;
  try { message = JSON.parse(line); }
  catch { continue; }
  if (message.method === "notifications/initialized") continue;
  const id = message.id;
  try {
    if (message.method === "initialize") {
      send({ jsonrpc: "2.0", id, result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "autamedica-android", version: "0.5.0" }
      }});
    } else if (message.method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (message.method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools } });
    } else if (message.method === "tools/call") {
      try {
        const content = await callTool(message.params.name, message.params.arguments || {});
        send({ jsonrpc: "2.0", id, result: { content, isError: false } });
      } catch (error) {
        send({ jsonrpc: "2.0", id, result: {
          content: [{ type: "text", text: String(error.message || error) }],
          isError: true
        } });
      }
    } else if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    }
  } catch (error) {
    if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(error.message || error) } });
  }
}
