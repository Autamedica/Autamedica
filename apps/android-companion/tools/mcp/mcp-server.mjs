#!/usr/bin/env node
import readline from "node:readline";
import { chromium } from "playwright-core";

const BASE = process.env.AUTAMEDICA_ANDROID_URL || "http://127.0.0.1:18765";
const CDP = process.env.AUTAMEDICA_CDP_URL || "http://127.0.0.1:18766";
const TOKEN = process.env.AUTAMEDICA_ANDROID_TOKEN || "";
const PROTOCOL = "2024-11-05";

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
  { name: "android_get_ui_tree", description: "Lee el árbol de accesibilidad Android; los campos de contraseña se ocultan.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_screenshot", description: "Captura la pantalla completa del Xiaomi.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_open_app", description: "Abre una aplicación Android por package name.", inputSchema: { type: "object", properties: { package: { type: "string" } }, required: ["package"], additionalProperties: false } },
  { name: "android_tap", description: "Toca una coordenada de pantalla Android.", inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false } },
  { name: "android_click_element", description: "Pulsa un nodo Android por su path del árbol UI.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } },
  { name: "android_type", description: "Escribe en el campo Android que tenga el foco.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } },
  { name: "android_swipe", description: "Ejecuta un gesto Android.", inputSchema: { type: "object", properties: { x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" }, duration_ms: { type: "integer", minimum: 50, maximum: 5000 } }, required: ["x1", "y1", "x2", "y2"], additionalProperties: false } },
  { name: "android_back", description: "Ejecuta Atrás en Android.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_home", description: "Vuelve al inicio de Android.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_open_url", description: "Abre un enlace web o esquema de aplicación en Android.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } },

  { name: "browser_status", description: "Comprueba conexión CDP, motor Chromium/WebView, pestañas, URL y título.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser_navigate", description: "Abre el navegador Companion y navega a cualquier sitio HTTP/HTTPS con Internet.", inputSchema: { type: "object", properties: { url: { type: "string" }, wait_until: { type: "string", enum: ["load", "domcontentloaded", "networkidle", "commit"] } }, required: ["url"], additionalProperties: false } },
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

  { name: "android_wait_for_text", description: "Espera texto visible en el árbol de accesibilidad Android.", inputSchema: { type: "object", properties: { text: { type: "string" }, timeout_ms: { type: "integer", minimum: 500, maximum: 15000 } }, required: ["text"], additionalProperties: false } }
];

async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: { Authorization: "Bearer " + TOKEN, ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error("Android Companion HTTP " + response.status + ": " + message.slice(0, 500));
  }
  return response;
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
        browser = await chromium.connectOverCDP(CDP, {
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
    throw new Error("CDP no disponible en " + CDP + ". Abrí Autamedica Companion y activá Accesibilidad. Último error: " + String(lastError?.message || lastError));
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
    case "android_type":
      return [{ type: "text", text: JSON.stringify(await post("/v1/type", args)) }];
    case "android_swipe":
      return [{ type: "text", text: JSON.stringify(await post("/v1/swipe", args)) }];
    case "android_back":
      return [{ type: "text", text: JSON.stringify(await post("/v1/back", {})) }];
    case "android_home":
      return [{ type: "text", text: JSON.stringify(await post("/v1/home", {})) }];
    case "android_open_url":
      return [{ type: "text", text: JSON.stringify(await post("/v1/url", args)) }];
    case "android_wait_for_text": {
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
      const page = await ensurePage();
      await page.goto(url, { waitUntil, timeout: 60000 });
      return [{ type: "text", text: JSON.stringify({ url: page.url(), title: await page.title(), browser: "Chromium WebView via CDP" }) }];
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
      const page = await ensurePage();
      await page.locator(args.selector).click({ timeout: Number(args.timeout_ms || 15000) });
      return [{ type: "text", text: JSON.stringify({ clicked: args.selector, url: page.url() }) }];
    }
    case "browser_fill": {
      const page = await ensurePage();
      await page.locator(args.selector).fill(args.value, { timeout: Number(args.timeout_ms || 15000) });
      return [{ type: "text", text: JSON.stringify({ filled: args.selector }) }];
    }
    case "browser_get_text": {
      const page = await ensurePage();
      const selector = args.selector || "body";
      const text = await page.locator(selector).innerText({ timeout: 15000 });
      return [{ type: "text", text: text.slice(0, 30000) }];
    }
    case "browser_get_url": {
      const page = await ensurePage();
      return [{ type: "text", text: JSON.stringify({ url: redactUrl(page.url()), title: await page.title() }) }];
    }
    case "browser_evaluate": {
      const page = await ensurePage();
      if (String(args.script || "").length > 12000) throw new Error("JavaScript excede 12.000 caracteres.");
      const value = await page.evaluate(source => (0, eval)(source), args.script);
      return [{ type: "text", text: JSON.stringify(value === undefined ? null : value).slice(0, 30000) }];
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
      const page = await ensurePage();
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
      return [{ type: "text", text: JSON.stringify({ reloaded: true, url: redactUrl(page.url()) }) }];
    }
    case "browser_cdp_send": {
      const page = await ensurePage();
      if (!/^[A-Za-z][A-Za-z0-9_]*\\.[A-Za-z][A-Za-z0-9_]*$/.test(args.method))
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
        serverInfo: { name: "autamedica-android", version: "0.2.0" }
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
