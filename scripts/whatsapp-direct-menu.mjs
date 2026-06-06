#!/usr/bin/env node
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";

const require = createRequire(import.meta.url);
const pino = require("/opt/openclaw/.openclaw/npm/node_modules/pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  downloadMediaMessage,
} = await import("/opt/openclaw/.openclaw/npm/node_modules/@whiskeysockets/baileys/lib/index.js");

const AUTH_DIR = process.env.AUTH_DIR || "/opt/openclaw/.openclaw/credentials/whatsapp/autamedica";
const STATE_FILE = process.env.STATE_FILE || "/opt/autamedica/whatsapp-direct-menu-state.json";
const MEDIA_DIR = process.env.MEDIA_DIR || "/opt/autamedica/media/inbound";
const ACCOUNT_LABEL = process.env.ACCOUNT_LABEL || "AutaMedica";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_AUTH_PROFILES =
  process.env.GEMINI_AUTH_PROFILES || "/opt/openclaw/agents/autamedica/agent/auth-profiles.json";
const LOCK_FILE = "/tmp/whatsapp-direct-menu.lock";
const DIRECT_API_HOST = process.env.WHATSAPP_DIRECT_API_HOST || "127.0.0.1";
const DIRECT_API_PORT = Number(process.env.WHATSAPP_DIRECT_API_PORT || "18792");
const DIRECT_API_TOKEN = process.env.WHATSAPP_DIRECT_API_TOKEN || "";
const DIRECT_API_MAX_BODY_BYTES = Number(process.env.WHATSAPP_DIRECT_API_MAX_BODY_BYTES || "32768");

let activeSocket = null;

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  if (!DIRECT_API_TOKEN) return false;
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expected = Buffer.from(DIRECT_API_TOKEN);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeRecipient(value) {
  return String(value || "").replace(/@s\.whatsapp\.net$/i, "").replace(/^whatsapp:/i, "").replace(/[^\d]/g, "");
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > DIRECT_API_MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const directApi = http.createServer((req, res) => {
  Promise.resolve().then(async () => {
    if (req.method === "GET" && req.url === "/health") {
      const ok = Boolean(activeSocket && DIRECT_API_TOKEN);
      return json(res, ok ? 200 : 503, {
        ok,
        service: "whatsapp-direct-menu",
        connected: Boolean(activeSocket),
        configured: Boolean(DIRECT_API_TOKEN),
      });
    }
    if (req.method !== "POST" || req.url !== "/send") return json(res, 404, { ok: false, error: "not_found" });
    if (!authorized(req)) return json(res, 401, { ok: false, error: "unauthorized" });
    if (!activeSocket) return json(res, 503, { ok: false, error: "whatsapp_disconnected" });

    let body;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { ok: false, error: "invalid_json" });
    }

    const to = normalizeRecipient(body.to);
    const message = String(body.message || "").trim();
    if (to.length < 8) return json(res, 400, { ok: false, error: "invalid_recipient" });
    if (!message || message.length > 4000) return json(res, 400, { ok: false, error: "invalid_message" });

    const result = await activeSocket.sendMessage(`${to}@s.whatsapp.net`, { text: message });
    console.log(`[direct-menu] transactional send to ${to} id=${result?.key?.id || "unknown"}`);
    return json(res, 200, { ok: true, to, messageId: result?.key?.id || null });
  }).catch((error) => {
    console.error("[direct-menu] direct API failed", error?.stack || error);
    json(res, 502, { ok: false, error: "send_failed" });
  });
});

directApi.listen(DIRECT_API_PORT, DIRECT_API_HOST, () => {
  console.log(`[direct-menu] direct API listening on http://${DIRECT_API_HOST}:${DIRECT_API_PORT}`);
});

const templates = {
  menu:
    "Hola, soy IAsmin, asistente de AutaMedica.\n\n" +
    "Puedo ayudarte con:\n" +
    "1. CONSULTA\n" +
    "2. Te acompañamos\n" +
    "3. RECETA\n" +
    "4. Hablar con personal\n\n" +
    "Responde con el número de la opción o escribí MENU para volver a este inicio.",
  consulta:
    "Para ayudarte con una consulta necesito saber qué querés hacer:\n\n" +
    "1. Agendar una consulta\n" +
    "2. Ver una consulta ya agendada\n" +
    "3. Confirmar una consulta pagada\n" +
    "4. Hablar con personal\n\n" +
    "Responde con el número de la opción.",
  acompanamos:
    "Te acompañamos antes de la consulta.\n\n" +
    "Podés enviarme un audio contando qué te pasa y preparo una pre-anamnesis en PDF para que la revise un profesional.\n\n" +
    "También podés elegir:\n" +
    "1. Quiero preparar mi consulta\n" +
    "2. Ya completé mis datos y quiero verificar\n" +
    "3. Tengo un problema para cargar información\n" +
    "4. Hablar con personal\n\n" +
    "Respondé con el número de la opción o enviá el audio.",
  receta:
    "Puedo ayudarte con una receta.\n\n" +
    "Para buscarla necesito uno de estos datos:\n" +
    "- código de receta\n" +
    "- DNI del paciente\n" +
    "- fecha aproximada de emisión\n\n" +
    "Si no tenés esos datos, respondé PERSONAL.",
  personal:
    "Listo. Paso tu caso para revisión del equipo de AutaMedica.\n\n" +
    "Para que puedan ubicarlo, enviá en un solo mensaje:\n" +
    "- nombre y apellido\n" +
    "- DNI si corresponde\n" +
    "- motivo breve\n" +
    "- email o teléfono de contacto\n\n" +
    "Horario de respuesta: lunes a viernes de 9 a 18 hs.\n\n" +
    "Para volver al inicio, respondé MENU.",
  urgencia:
    "Si hay riesgo inmediato o síntomas graves, llamá a emergencias o acercate a una guardia.\n\n" +
    "AutaMedica por WhatsApp no reemplaza la atención de emergencia.\n\n" +
    "Cuando estés fuera de peligro, podés responder MENU para continuar.",
  audioReceived:
    "Recibí tu audio. Estoy preparando la pre-anamnesis en PDF. Puede tardar unos segundos.",
  audioFailed:
    "No pude procesar ese audio. Probá enviarlo otra vez, con voz clara y menos ruido de fondo.\n\n" +
    "Si preferís, respondé PERSONAL y lo revisa el equipo.",
};

async function acquireLock() {
  try {
    const activePid = await fs.readFile(LOCK_FILE, "utf8").catch(() => null);
    if (activePid) {
      const pid = parseInt(activePid, 10);
      try {
        process.kill(pid, 0); // Check if process is alive
        console.error(`[direct-menu] Error: Another process with PID ${pid} is already running. Aborting.`);
        process.exit(0);
      } catch (err) {
        // Process is dead, we can overwrite lock
      }
    }
    await fs.writeFile(LOCK_FILE, process.pid.toString(), "utf8");

    // Clean lock on exit
    const cleanLock = () => {
      try {
        require("node:fs").unlinkSync(LOCK_FILE);
      } catch (e) {}
    };
    process.on("exit", cleanLock);
    process.on("SIGINT", () => { cleanLock(); process.exit(0); });
    process.on("SIGTERM", () => { cleanLock(); process.exit(0); });
    process.on("uncaughtException", (err) => {
      console.error("[direct-menu] Uncaught exception", err);
      cleanLock();
      process.exit(1);
    });
  } catch (err) {
    console.error("[direct-menu] Lockfile verification failed", err);
  }
}

function normalize(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function classify(text) {
  const n = normalize(text);
  if (!n) return null;
  if (
    /dolor intenso|falta de aire|perdida de conciencia|sangrado|emergencia|urgencia|autolesion|me quiero matar|suicid/i.test(
      n,
    )
  ) {
    return "urgencia";
  }
  if (["menu", "inicio", "opciones", "ayuda", "hola", "buen dia", "buenas", "buenas tardes", "buenas noches"].includes(n)) {
    return "menu";
  }
  if (n === "1" || n === "consulta" || n.includes("turno") || n.includes("cita")) return "consulta";
  if (n === "2" || n === "te acompanamos" || n.includes("acompan") || n.includes("anamnesis") || n.includes("preparar")) {
    return "acompanamos";
  }
  if (n === "3" || n === "receta" || n.includes("receta") || n.includes("pdf")) return "receta";
  if (n === "4" || n === "personal" || n === "humano" || n.includes("hablar con personal") || n.includes("administracion") || n.includes("soporte")) {
    return "personal";
  }
  return null;
}

function unwrapMessage(message) {
  let current = message || {};
  for (let i = 0; i < 5; i += 1) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else break;
  }
  return current || {};
}

function extractText(message) {
  const m = unwrapMessage(message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ""
  );
}

// Support audio check from document or native voice note
function getAudioPayload(message) {
  const m = unwrapMessage(message);
  if (m.audioMessage) return m.audioMessage;
  if (m.documentMessage?.mimetype?.startsWith("audio/")) return m.documentMessage;
  return null;
}

async function loadProcessed() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return new Set(JSON.parse(raw).processed || []);
  } catch {
    return new Set();
  }
}

async function saveProcessed(processed) {
  await fs.writeFile(STATE_FILE, JSON.stringify({ processed: [...processed].slice(-2000) }, null, 2));
}

async function loadGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const raw = JSON.parse(await fs.readFile(GEMINI_AUTH_PROFILES, "utf8"));
  const key = raw?.profiles?.["google:default"]?.key;
  if (!key) throw new Error("missing Gemini key profile google:default");
  return key;
}

function textFromGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("\n").trim();
}

function parseJsonBlock(text) {
  const clean = String(text || "").replace(/^```json/i, "").replace(/^```/, "").replace(/```$/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { transcripcion: clean, resumenOrdenado: clean };
  }
  return JSON.parse(clean.slice(start, end + 1));
}

async function analyzeAudio(buffer, mimeType) {
  const key = await loadGeminiKey();
  const prompt =
    "Sos un asistente clinico de pre-anamnesis. Escucha el audio del paciente y ordena el relato sin diagnosticar, sin indicar tratamientos y sin sugerir estudios.\n" +
    "Respondé solo JSON válido con esta forma:\n" +
    "{\n" +
    '  "transcripcion": "texto completo transcripto",\n' +
    '  "motivoConsulta": "queja principal",\n' +
    '  "enfermedadActual": {"sintomaPrincipal":"","cronologia":"","intensidad":"","factoresAgravantes":"","factoresAtenuantes":"","sintomasAcompanantes":[]},\n' +
    '  "antecedentesPersonales": {"enfermedadesPrevias":[],"medicacionActual":[],"alergias":"No referidas"},\n' +
    '  "signosAlarma": [],\n' +
    '  "datosFaltantes": [],\n' +
    '  "resumenOrdenado": "resumen clinico ordenado de 4 a 8 lineas",\n' +
    '  "impresionGeneral": "sintesis descriptiva, no diagnostica"\n' +
    "}";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || "audio/ogg", data: buffer.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2200 },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`gemini_http_${response.status}:${body.slice(0, 300)}`);
  }

  const data = await response.json();
  return parseJsonBlock(textFromGeminiResponse(data));
}

function asciiForPdf(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text, width = 86) {
  const words = asciiForPdf(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

// Basic pdf character escaping
function pdfEscape(text) {
  return asciiForPdf(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function addSection(lines, title, value) {
  lines.push("");
  lines.push(title.toUpperCase());
  lines.push(...wrapText(value));
}

function joinList(value) {
  if (!Array.isArray(value) || value.length === 0) return "No referido";
  return value.map((item) => String(item)).join("; ");
}

function buildPdfReport(report) {
  const ea = report.enfermedadActual || {};
  const ap = report.antecedentesPersonales || {};
  const lines = [
    "AutaMedica - Pre-Anamnesis por audio",
    `Fecha: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`,
    "Documento de apoyo para revision profesional. No constituye diagnostico.",
  ];

  addSection(lines, "Motivo de consulta", report.motivoConsulta || "No especificado");
  addSection(
    lines,
    "Enfermedad actual",
    [
      `Sintoma principal: ${ea.sintomaPrincipal || "-"}`,
      `Cronologia: ${ea.cronologia || "-"}`,
      `Intensidad: ${ea.intensidad || "-"}`,
      `Agravantes: ${ea.factoresAgravantes || "-"}`,
      `Atenuantes: ${ea.factoresAtenuantes || "-"}`,
      `Sintomas acompanantes: ${joinList(ea.sintomasAcompanantes)}`,
    ].join("\n"),
  );
  addSection(
    lines,
    "Antecedentes",
    [
      `Enfermedades previas: ${joinList(ap.enfermedadesPrevias)}`,
      `Medicacion actual: ${joinList(ap.medicacionActual)}`,
      `Alergias: ${ap.alergias || "No referidas"}`,
    ].join("\n"),
  );
  addSection(lines, "Signos de alarma referidos", joinList(report.signosAlarma));
  addSection(lines, "Datos faltantes", joinList(report.datosFaltantes));
  addSection(lines, "Resumen ordenado", report.resumenOrdenado || "No disponible");
  addSection(lines, "Impresion general", report.impresionGeneral || "No disponible");
  addSection(lines, "Transcripcion", report.transcripcion || "No disponible");

  const lineHeight = 15;
  const maxLinesPerPage = 48;
  const pages = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) {
    pages.push(lines.slice(i, i + maxLinesPerPage));
  }

  const objects = [null, "<< /Type /Catalog /Pages 2 0 R >>", null];
  const pageObjectIds = [];
  const fontResource = "<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>";

  for (const pageLines of pages) {
    const commands = ["BT", "/F1 10 Tf", "50 790 Td"];
    for (const line of pageLines) {
      const size = line === line.toUpperCase() && line.length < 80 ? 12 : 10;
      commands.push(`/F1 ${size} Tf`);
      commands.push(`(${pdfEscape(line)}) Tj`);
      commands.push(`0 -${lineHeight} Td`);
    }
    commands.push("ET");
    const stream = commands.join("\n");
    const contentId = objects.push(`<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream`) - 1;
    const pageId =
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources ${fontResource} /Contents ${contentId} 0 R >>`,
      ) - 1;
    pageObjectIds.push(pageId);
  }

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "binary");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

async function downloadAudio(sock, msg, audioPayload) {
  const buffer = await downloadMediaMessage(
    msg,
    "buffer",
    {},
    { logger: pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage },
  );
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const safeId = String(msg.key?.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "");
  const extension = audioPayload?.mimetype?.includes("mpeg") ? "mp3" : "ogg";
  const filePath = path.join(MEDIA_DIR, `${safeId}.${extension}`);
  await fs.writeFile(filePath, buffer);
  return { buffer, filePath };
}

async function handleAudio(sock, msg, jid, audioPayload) {
  const mimeType = audioPayload?.mimetype || "audio/ogg";
  await sock.readMessages([msg.key]);
  await sock.sendMessage(jid, { text: templates.audioReceived });
  const { buffer, filePath } = await downloadAudio(sock, msg, audioPayload);
  console.log(`[direct-menu] audio saved ${filePath} ${buffer.length} bytes mime=${mimeType}`);
  const report = await analyzeAudio(buffer, mimeType);
  const pdf = buildPdfReport(report);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await sock.sendMessage(jid, {
    document: pdf,
    mimetype: "application/pdf",
    fileName: `preanamnesis-${stamp}.pdf`,
    caption:
      "Tu pre-anamnesis en PDF está lista.\n\n" +
      "Es un documento de apoyo para que lo revise un profesional. No reemplaza una consulta médica.",
  });
  console.log(`[direct-menu] sent audio pdf to ${jid}`);
}

const processed = await loadProcessed();
let reconnectAttempts = 0;
let reconnecting = false;

async function start() {
  reconnecting = false;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.macOS(ACCOUNT_LABEL),
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      activeSocket = sock;
      reconnectAttempts = 0; // Reset counter on successful connection
      console.log("[direct-menu] connected as " + (sock.user?.id || "unknown"));
    }
    if (connection === "close" && !reconnecting) {
      if (activeSocket === sock) activeSocket = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("[direct-menu] connection closed code=" + code);
      if (code === DisconnectReason.loggedOut) {
        console.error("[direct-menu] logged out; relink WhatsApp is required");
        process.exit(2);
      }

      reconnecting = true;
      reconnectAttempts++;

      // Exponential backoff: 5s, 10s, 20s, up to 60s
      const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), 60000);
      console.log(`[direct-menu] Attempting to reconnect (Attempt ${reconnectAttempts}) in ${delay / 1000}s...`);

      setTimeout(
        () => {
          console.log(`[direct-menu] Reconnecting now...`);
          start().catch((err) => {
            console.error("[direct-menu] reconnect failed, scheduling next attempt", err);
            reconnecting = false;
            // Trigger close artificially to invoke connection.update retry logic
            sock.ev.emit("connection.update", {
              connection: "close",
              lastDisconnect: { error: { output: { statusCode: 500 } } },
            });
          });
        },
        delay,
      );
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages || []) {
      const id = msg.key?.id;
      const jid = msg.key?.remoteJid;
      try {
        if (!id || !jid || processed.has(id)) continue;
        if (msg.key?.fromMe) continue;
        if (jid.endsWith("@g.us") || jid === "status@broadcast") continue;

        const audioPayload = getAudioPayload(msg.message);
        if (audioPayload) {
          processed.add(id);
          await saveProcessed(processed);
          console.log(`[direct-menu] inbound ${jid} <audio>`);
          await handleAudio(sock, msg, jid, audioPayload);
          continue;
        }

        const text = extractText(msg.message);
        const kind = classify(text);
        console.log("[direct-menu] inbound " + jid + " " + JSON.stringify(text) + " -> " + (kind || "llm_skip"));
        if (!kind) continue;
        processed.add(id);
        await saveProcessed(processed);
        await sock.readMessages([msg.key]);
        await sock.sendMessage(jid, { text: templates[kind] });
        console.log("[direct-menu] sent " + kind + " to " + jid);
      } catch (err) {
        console.error("[direct-menu] message handling failed", err?.stack || err);
        if (jid) {
          try {
            await sock.sendMessage(jid, { text: templates.audioFailed });
          } catch (sendErr) {
            console.error("[direct-menu] failed to send error message", sendErr?.stack || sendErr);
          }
        }
      }
    }
  });
}

acquireLock().then(() => {
  start().catch((err) => {
    console.error("[direct-menu] fatal", err?.stack || err);
    process.exit(1);
  });
});
