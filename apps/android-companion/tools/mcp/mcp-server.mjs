#!/usr/bin/env node
import readline from "node:readline";

const BASE = process.env.AUTAMEDICA_ANDROID_URL || "http://127.0.0.1:18765";
const TOKEN = process.env.AUTAMEDICA_ANDROID_TOKEN || "";
const PROTOCOL = "2024-11-05";

if (!TOKEN) {
  process.stderr.write("AUTAMEDICA_ANDROID_TOKEN is required.\n");
  process.exit(2);
}

const tools = [
  { name: "android_status", description: "Comprueba si Autamedica Android Companion está activo en este Xiaomi.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_get_ui_tree", description: "Lee el árbol de accesibilidad de la ventana Android activa. Los campos de contraseña se ocultan.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_screenshot", description: "Captura la pantalla Android activa y devuelve una imagen PNG.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_open_app", description: "Abre una aplicación instalada usando su package name.", inputSchema: { type: "object", properties: { package: { type: "string" } }, required: ["package"], additionalProperties: false } },
  { name: "android_tap", description: "Toca una coordenada de pantalla Android.", inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false } },
  { name: "android_click_element", description: "Pulsa un nodo por su path devuelto en android_get_ui_tree.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } },
  { name: "android_type", description: "Escribe en el campo de texto que tenga el foco Android.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } },
  { name: "android_swipe", description: "Ejecuta un gesto de desplazamiento.", inputSchema: { type: "object", properties: { x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" }, duration_ms: { type: "integer", minimum: 50, maximum: 5000 } }, required: ["x1", "y1", "x2", "y2"], additionalProperties: false } },
  { name: "android_back", description: "Ejecuta la acción global Atrás.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_home", description: "Vuelve a la pantalla de inicio Android.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "android_open_url", description: "Abre un enlace http, https o whatsapp en Android.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } },
  { name: "android_wait_for_text", description: "Espera hasta que un texto aparezca en el árbol de accesibilidad.", inputSchema: { type: "object", properties: { text: { type: "string" }, timeout_ms: { type: "integer", minimum: 500, maximum: 15000 } }, required: ["text"], additionalProperties: false } }
];

async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: { Authorization: "Bearer " + TOKEN, ...(options.headers || {}) },
    signal: AbortSignal.timeout(15000)
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

async function callTool(name, args) {
  switch (name) {
    case "android_status":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/health")).json()) }];
    case "android_get_ui_tree":
      return [{ type: "text", text: JSON.stringify(await (await request("/v1/ui")).json()) }];
    case "android_screenshot": {
      const response = await request("/v1/screenshot");
      const data = Buffer.from(await response.arrayBuffer()).toString("base64");
      return [{ type: "image", data, mimeType: "image/png" }];
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
        const serialized = JSON.stringify(tree).toLocaleLowerCase();
        if (serialized.includes(needle)) return [{ type: "text", text: "Texto encontrado: " + args.text }];
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      throw new Error("No apareció el texto dentro del tiempo indicado: " + args.text);
    }
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
        serverInfo: { name: "autamedica-android", version: "0.1.0" }
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
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(error.message || error) }], isError: true } });
      }
    } else if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    }
  } catch (error) {
    if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(error.message || error) } });
  }
}
