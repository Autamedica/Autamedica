import { existsSync, watch, readFileSync, readdirSync, statSync } from "node:fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ensureEnv } from "@autamedica/shared";
import { DEFAULT_OPENCLAW_CONFIG, sendMessageWithFallback } from "@autamedica/scheduling";
// @ts-expect-error The worker runtime resolves jsPDF from the workspace install.
import { jsPDF } from "/mnt/data/Autamedica/node_modules/.pnpm/jspdf@4.2.1/node_modules/jspdf/dist/jspdf.node.js";
import type { Database } from "@autamedica/types";

type SupabaseClient = ReturnType<typeof createClient<Database>>;

type AnamnesisExtraction = {
  paciente?: { edad?: string | number | null; genero?: string | null };
  motivoConsulta?: string;
  enfermedadActual?: {
    sintomaPrincipal?: string;
    cronologia?: string;
    intensidad?: string;
    factoresAgravantes?: string;
    factoresAtenuantes?: string;
    sintomasAcompanantes?: string[];
  };
  antecedentesPersonales?: {
    enfermedadesPrevias?: string[];
    medicacionActual?: string[];
    alergias?: string;
  };
  signosAlarma?: string[];
  datosFaltantes?: string[];
  resumenOrdenado?: string;
  impresionGeneral?: string;
};

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

function requireEnv(name: string): string {
  return ensureEnv(name);
}

const processed = new Set<string>();
let supabaseClient: SupabaseClient | null = null;

function optionalEnv(...names: string[]): string | null {
  for (const name of names) {
    try {
      return ensureEnv(name);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

const MEDIA_DIR = optionalEnv("OPENCLAW_MEDIA_DIR") || "/home/edu/.openclaw/media/inbound";

function getSupabase(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  const url = requireEnv("SUPABASE_URL");
  const key = optionalEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");
  if (!key) throw new Error("Falta variable de entorno SUPABASE_SERVICE_ROLE_KEY");
  supabaseClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

async function transcribe(fp: string, mediaType?: string | null): Promise<string> {
  const bytes = readFileSync(fp);
  const genAI = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY"));
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent([
    { text: "Transcribi este audio en espanol. Solo texto." },
    { inlineData: { mimeType: mediaType || "audio/ogg", data: bytes.toString("base64") } }
  ]);
  return result.response.text().trim();
}

async function generateAnamnesis(transcript: string): Promise<AnamnesisExtraction> {
  const prompt = "Eres un medico especialista en anamnesis y recoleccion de datos clinicos con 20 anios de experiencia. Tu UNICA funcion es escuchar el relato del paciente y ordenarlo clinicamente de forma impecable. NO diagnosticas, NO sugeris estudios, NO recomendas tratamientos. Solo recolectas, ordenas y presentas los datos.\n" +
    "Genera este JSON:\n" +
    "{\n" +
    "  \"paciente\": { \"edad\": numero o null, \"genero\": \"M/F\" si es deducible },\n" +
    "  \"motivoConsulta\": \"transcripcion textual de la queja principal del paciente, entre comillas, seguido de una reformulacion clinica ordenada\",\n" +
    "  \"enfermedadActual\": {\n" +
    "    \"sintomaPrincipal\": \"sintoma cardinal identificado\",\n" +
    "    \"cronologia\": \"inicio, evolucion, patron temporal, factores desencadenantes\",\n" +
    "    \"intensidad\": \"como lo describe el paciente\",\n" +
    "    \"factoresAgravantes\": \"que lo empeora segun el relato\",\n" +
    "    \"factoresAtenuantes\": \"que lo alivia segun el relato\",\n" +
    "    \"sintomasAcompanantes\": [\"listado completo de todos los sintomas mencionados\"]\n" +
    "  },\n" +
    "  \"antecedentesPersonales\": {\n" +
    "    \"enfermedadesPrevias\": [\"listado\"],\n" +
    "    \"medicacionActual\": [\"medicamento, dosis y frecuencia si se mencionan\"],\n" +
    "    \"alergias\": \"texto textual del paciente o 'No referidas'\",\n" +
    "    \"habitos\": \"tabaco, alcohol, ejercicio, sueño, alimentacion — solo lo mencionado\"\n" +
    "  },\n" +
    "  \"signosAlarma\": [\"mencionar SOLO signos de alarma objetivos presentes en el relato: dolor subito intenso, perdida de conocimiento, sangrado, etc. No inferir ni agregar.\"],\n" +
    "  \"datosFaltantes\": [\"datos clinicos relevantes que el paciente NO menciono y serian utiles para completar la historia clinica\"],\n" +
    "  \"resumenOrdenado\": \"parrafo de 4-6 lineas que reorganiza TODA la informacion del paciente en formato de historia clinica: 1) Filiacion y motivo, 2) Enfermedad actual ordenada cronologicamente, 3) Antecedentes relevantes, 4) Sintesis final. NO incluir diagnostico, NO sugerir estudios, NO recomendar tratamiento. Solo ordenar lo que el paciente dijo.\"\n" +
    "}\n" +
    "IMPORTANTE: Solo JSON valido. NO markdown. NO diagnosticos. NO planes terapeuticos.\n" +
    "Transcripcion del audio del paciente: " + JSON.stringify(transcript);
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + requireEnv("DEEPSEEK_API_KEY") },
    body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 2000 }),
  });
  const data = await res.json() as DeepSeekResponse;
  const text = data?.choices?.[0]?.message?.content?.trim() || "{}";
  return JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)) as AnamnesisExtraction;
}

function esc(t: unknown): string { return String(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/[^\u0020-\u007E]/g, (c: string) => "&#" + c.codePointAt(0) + ";"); }
function li(items: string[]): string { return !items?.length ? "" : "<ul>" + items.map(i => "<li>" + esc(i) + "</li>").join("") + "</ul>"; }

function buildHtml(a: AnamnesisExtraction, id: string): string {
  const ea = a.enfermedadActual || {}, ap = a.antecedentesPersonales || {};
  const p = a.paciente || {};
  const edad = /^\d+$/.test(String(p.edad||"").trim()) ? p.edad + " anios" : (p.edad || "no referida");
  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Pre-Anamnesis - AutaMedica</title>" +
"<style>body{font-family:Arial;max-width:700px;margin:40px auto;color:#1a1a1a;line-height:1.6}h1{color:#0d6e6e;border-bottom:2px solid #0d6e6e;padding-bottom:8px}h2{color:#333;margin-top:24px}.tag{background:#e8f5f5;padding:4px 8px;border-radius:4px}.alert{background:#fff3cd;padding:10px;border-left:4px solid #ffc107;margin:12px 0}.missing{background:#f8f9fa;padding:10px;border-left:4px solid #6c757d;margin:12px 0}ul{margin:4px 0;padding-left:20px}li{margin:2px 0}.footer{margin-top:40px;padding-top:16px;border-top:1px solid #ccc;font-size:.85em;color:#888}</style></head><body>" +
"<h1>Pre-Anamnesis &mdash; AutaMedica</h1><p><span class=\"tag\">ID: "+id+"</span></p>" +
"<p><strong>Paciente:</strong> "+esc(edad)+" | "+esc(p.genero||"no especificado")+"</p>" +
"<h2>Motivo de Consulta</h2><p>"+esc(a.motivoConsulta||"No especificado")+"</p>" +
"<h2>Enfermedad Actual</h2>" +
"<p><strong>Sintoma:</strong> "+esc(ea.sintomaPrincipal||"-")+"</p>" +
"<p><strong>Cronologia:</strong> "+esc(ea.cronologia||"-")+"</p>" +
"<p><strong>Intensidad:</strong> "+esc(ea.intensidad||"-")+"</p>" +
"<p><strong>Agravantes:</strong> "+esc(ea.factoresAgravantes||"-")+"</p>" +
"<p><strong>Atenuantes:</strong> "+esc(ea.factoresAtenuantes||"-")+"</p>" +
(ea.sintomasAcompanantes?.length ? "<p><strong>Sintomas acompanantes:</strong></p>"+li(ea.sintomasAcompanantes) : "") +
"<h2>Antecedentes</h2>" +
"<p><strong>Enfermedades:</strong> "+(ap.enfermedadesPrevias?.length?li(ap.enfermedadesPrevias):"No referidas")+"</p>" +
"<p><strong>Medicacion:</strong> "+(ap.medicacionActual?.length?li(ap.medicacionActual):"No referida")+"</p>" +
"<p><strong>Alergias:</strong> "+esc(ap.alergias||"No referidas")+"</p>" +
(a.signosAlarma?.length ? "<div class=\"alert\"><strong>Signos de Alarma</strong>"+li(a.signosAlarma)+"</div>" : "") +
(a.datosFaltantes?.length ? "<div class=\"missing\"><strong>Datos para completar</strong>"+li(a.datosFaltantes)+"</div>" : "") +
"<h2>Impresion General</h2><p>"+esc(a.impresionGeneral||"No disponible")+"</p>" +
"<div class=\"footer\"><p><strong>Importante:</strong> Pre-anamnesis generada a partir de audio. Debe ser completada por un profesional. No constituye diagnostico.</p><p>&copy; AutaMedica</p></div></body></html>";
}


function generatePdf(a: AnamnesisExtraction, id: string): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, ML = 20, MR = 20, CW = PW - ML - MR, LH = 6;
  let y = 20, pageNum = 1;
  const ea = a.enfermedadActual || {}, ap = a.antecedentesPersonales || {};
  const t = (x: unknown) => String(x||"").replace(/&#(\d+);/g, (_:string,n:string) => String.fromCodePoint(parseInt(n)));

  const addPage = () => {
    // Page footer before new page
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(pageNum + "", PW / 2, 285, { align: "center" });
    doc.addPage();
    pageNum++;
    y = 20;
    // Repeat header
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, PW, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("AutaMedica — Pre-Anamnesis", ML, 12);
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
  };
  const checkBreak = (n: number) => { if (y + n > 275) addPage(); };

  // ─── Header #0ea5e9 ───
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, PW, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont("helvetica", "bold");
  doc.text("AutaMedica", ML, 16);
  doc.setFontSize(11); doc.setFont("helvetica", "normal");
  doc.text("Pre-Anamnesis — Audio del Paciente", ML, 25);
  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString("es-AR", { year: "numeric", month: "long", day: "numeric" }), ML, 33);
  doc.setFontSize(7);
  doc.text("ID " + id.slice(-8), PW - MR, 33, { align: "right" });
  y = 48;

  // ─── Coverage indicators ───
  const covered = (a.signosAlarma?.length ? 1 : 0) + (a.motivoConsulta ? 1 : 0) + ((ap.enfermedadesPrevias||[]).length ? 1 : 0) + ((ap.medicacionActual||[]).length ? 1 : 0);
  const total = 4;
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Cobertura de datos", ML, y);
  doc.setFont("helvetica", "normal");
  doc.text(covered + "/" + total + " areas cubiertas", ML + 3, y + LH);
  y += LH + 4;

  // Data points: + for covered, ! for missing
  const points = [
    { label: "Motivo de consulta", ok: !!a.motivoConsulta },
    { label: "Enfermedades previas", ok: !!(ap.enfermedadesPrevias||[]).length },
    { label: "Medicación actual", ok: !!(ap.medicacionActual||[]).length },
    { label: "Signos de alarma identificados", ok: !!(a.signosAlarma||[]).length },
  ];
  for (const pt of points) {
    if (y > 272) addPage();
    if (pt.ok) {
      doc.setTextColor(22, 163, 74);
      doc.text("+ " + pt.label, ML + 3, y);
    } else {
      doc.setTextColor(180, 120, 0);
      doc.text("! " + pt.label, ML + 3, y);
    }
    y += LH;
  }
  y += 4;

  // ─── Missing info ───
  if ((a.datosFaltantes||[]).length) {
    doc.setTextColor(180, 120, 0);
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text("Información pendiente para tu médico:", ML, y);
    y += LH;
    doc.setFont("helvetica", "normal");
    for (const item of (a.datosFaltantes || []).slice(0, 8)) {
      if (y > 272) addPage();
      doc.text("- " + t(item), ML + 3, y);
      y += LH;
    }
    y += 4;
  }

  // ─── Separator ───
  doc.setDrawColor(229, 229, 229);
  doc.line(ML, y, PW - MR, y);
  y += 8;

  // ─── Section helper ───
  const section = (title: string, text: string, isAlert?: boolean) => {
    if (!text || text.length < 3) return;
    checkBreak(30);
    doc.setFillColor(isAlert ? 255 : 245, isAlert ? 250 : 245, isAlert ? 235 : 245);
    doc.rect(ML, y - 4, CW, 8, "F");
    if (isAlert) {
      doc.setDrawColor(180, 120, 0); doc.setLineWidth(0.5);
      doc.line(ML, y - 4, ML, y + 8);
    }
    doc.setTextColor(isAlert ? 180 : 22, isAlert ? 120 : 163, isAlert ? 0 : 74);
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(title, ML + 2, y + 1);
    y += 10;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, CW - 4);
    for (const l of lines) {
      checkBreak(LH);
      doc.text(l, ML + 2, y);
      y += LH;
    }
    y += 6;
  };

  // ─── Clinical Sections ───
  section("MOTIVO DE CONSULTA", t(a.motivoConsulta));
  section("ENFERMEDAD ACTUAL",
    "Síntoma principal: " + t(ea.sintomaPrincipal) + "\n" +
    "Cronología: " + t(ea.cronologia) + "\n" +
    "Intensidad: " + t(ea.intensidad) + "\n" +
    "Agravantes: " + t(ea.factoresAgravantes) + "\n" +
    "Atenuantes: " + t(ea.factoresAtenuantes) +
    (ea.sintomasAcompanantes?.length ? "\nSíntomas asociados: " + ea.sintomasAcompanantes.map((x:string) => t(x)).join(", ") : "")
  );
  section("ANTECEDENTES PERSONALES",
    "Enfermedades previas: " + ((ap.enfermedadesPrevias||[]).length ? (ap.enfermedadesPrevias || []).map((x:string) => t(x)).join(", ") : "No referidas") + "\n" +
    "Medicación actual: " + ((ap.medicacionActual||[]).length ? (ap.medicacionActual || []).map((x:string) => t(x)).join(", ") : "No referida") + "\n" +
    "Alergias: " + t(ap.alergias||"No referidas")
  );
  if ((a.signosAlarma||[]).length) section("BANDERAS DE SEGURIDAD", (a.signosAlarma || []).map((x:string) => "! " + t(x)).join("\n"), true);
  section("RESUMEN CLÍNICO ORDENADO", t(a.resumenOrdenado));
  section("IMPRESIÓN GENERAL", t(a.impresionGeneral));

  // ─── Footer ───
  checkBreak(25);
  doc.setDrawColor(200, 200, 200);
  doc.line(ML, y, PW - MR, y);
  y += 6;
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(6.5); doc.setFont("helvetica", "italic");
  const disc1 = "Documento confidencial — Ley 26.529 de Derechos del Paciente";
  for (const l of doc.splitTextToSize(disc1, CW)) { doc.text(l, ML, y); y += 3.5; }
  const disc2 = "AutaMedica IA — En fase de validación clínica ampliada";
  doc.text(disc2, ML, y); y += 3.5;
  const disc3 = "Pre-anamnesis generada a partir de audio. Documento de asistencia al profesional — no reemplaza el criterio clinico del medico tratante.";
  for (const l of doc.splitTextToSize(disc3, CW)) { doc.text(l, ML, y); y += 3.5; }

  // Page number at bottom
  doc.setFontSize(7);
  doc.text(pageNum + "", PW / 2, 285, { align: "center" });

  return doc.output("arraybuffer");
}

async function upload(id: string, html: string): Promise<string> {
  const supabase = getSupabase();
  const bytes = new TextEncoder().encode(html);
  const { error } = await supabase.storage
    .from("public_assets")
    .upload("preanamnesis/"+id+".html", bytes, { contentType: "text/html; charset=utf-8", upsert: true });
  if (error) throw new Error("upload html preanamnesis: " + error.message);
  return supabase.storage.from("public_assets").getPublicUrl("preanamnesis/"+id+".html").data.publicUrl;
}

async function sendMsg(phone: string, url: string, a: AnamnesisExtraction, preId: string): Promise<void> {
  const hasAlarm = (a.signosAlarma||[]).length > 0;
  const alarmNote = hasAlarm ? "\n\n⚠️ Se detectaron signos que requieren atencion medica." : "";
  const pagarLink = "https://www.autamedica.com/api/preanamnesis/pagar?id=" + encodeURIComponent(preId);
  const msg = "🩺 *Tu pre-anamnesis en PDF esta lista*" + alarmNote + "\n\n" +
    "📄 Informe gratis: " + url + "\n\n" +
    "El PDF es gratuito y ya queda disponible para que lo guardes o lo compartas con un profesional.\n\n" +
    "*Consulta medica opcional*\n" +
    "👨‍⚕️ Consulta por videollamada — 30 min\n" +
    "💊 Incluye receta electronica si corresponde\n" +
    "💰 *ARS 15.000*\n\n" +
    "👉 Si queres que un medico lo revise ahora, paga y agenda aca:\n" +
    pagarLink + "\n\n" +
    (hasAlarm ? "⚠️ No demores la consulta.\n\n" : "") +
    "_AutaMedica — Sin salir de casa._ 🏥";
  const account = optionalEnv("OPENCLAW_ACCOUNT") || "autamedica";
  const result = await sendMessageWithFallback(
    { ...DEFAULT_OPENCLAW_CONFIG, accountId: account },
    { to: phone, message: msg, channel: "whatsapp" },
  );

  if (!result.ok) {
    console.error("[AUDIO] envio WhatsApp fallido:", result.error, result.raw ?? "");
  }
}


function validateAnamnesis(a: AnamnesisExtraction): string[] {
  const errors: string[] = [];
  if (!a.motivoConsulta || a.motivoConsulta.length < 5) errors.push("motivoConsulta muy corto o vacio");
  if (!a.resumenOrdenado || a.resumenOrdenado.length < 40) errors.push("resumenOrdenado muy corto o vacio");
  if (a.signosAlarma && a.signosAlarma.length > 10) errors.push("demasiados signos de alarma (posible alucinacion)");
  if (a.datosFaltantes && a.datosFaltantes.length > 15) errors.push("demasiados datos faltantes");
  return errors;
}

function validateTranscript(t: string): string | null {
  if (!t || t.length < 10) return "transcripcion muy corta";
  if (t.length > 5000) return "transcripcion demasiado larga";
  if (/^[^a-záéíóúñ]+$/i.test(t)) return "transcripcion sin texto reconocible";
  return null;
}

export interface ProcessAudioResult {
  id: string;
  htmlUrl: string;
  pdfUrl: string;
  storagePath: string;
  transcript: string;
  extraction: Record<string, unknown>;
}

function buildPublicPdfUrl(id: string, fallbackUrl: string): string {
  const baseUrl = optionalEnv("AUTAMEDICA_PUBLIC_BASE_URL", "PUBLIC_BASE_URL", "SITE_URL") ?? "https://www.autamedica.com";
  try {
    return new URL(`/api/preanamnesis/pdf/${encodeURIComponent(id)}`, baseUrl).toString();
  } catch {
    return fallbackUrl;
  }
}

async function persistPreanamnesisSession(input: {
  id: string;
  phone: string;
  pdfUrl: string;
  storagePath: string;
  transcript: string;
  extraction: Record<string, unknown>;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabase() as any;
  const { error } = await supabase
    .from("preanamnesis_sessions")
    .upsert({
      id: input.id,
      patient_phone: input.phone,
      pdf_url: input.pdfUrl,
      storage_bucket: "public_assets",
      storage_path: input.storagePath,
      transcript: input.transcript,
      extraction_json: input.extraction,
      source: "whatsapp_audio",
      status: "generated",
    }, { onConflict: "id" });

  if (error) throw new Error("persist preanamnesis_sessions: " + error.message);
}

export async function processAudioForPhone(params: {
  filePath: string;
  phone: string;
  mediaType?: string | null;
  sourceMessageId?: string | null;
}): Promise<ProcessAudioResult> {
  const fp = params.filePath;
  if (processed.has(fp)) throw new Error("audio ya procesado");
  try { if (Date.now() - statSync(fp).mtimeMs > 24 * 60 * 60_000) throw new Error("audio demasiado antiguo"); } catch (err) {
    if (err instanceof Error && err.message === "audio demasiado antiguo") throw err;
  }
  console.log("[AUDIO]", path.basename(fp));
  const t = await transcribe(fp, params.mediaType);
  const tErr = validateTranscript(t);
  if (tErr) { console.log("[AUDIO] TRANSCRIPCION INVALIDA:", tErr); throw new Error(tErr); }
  console.log("[AUDIO]", t.substring(0,100));
  const a = await generateAnamnesis(t);
  const vErrors = validateAnamnesis(a);
  if (vErrors.length) { console.log("[AUDIO] VALIDACION:", vErrors.join("; ")); }
  const id = "pre-" + Date.now() + "-" + randomBytes(16).toString("hex");
  const html = buildHtml(a, id);
  const htmlUrl = await upload(id, html);
  console.log("[AUDIO] HTML:", htmlUrl);
  const pdfBytes = generatePdf(a, id);
  const supabase = getSupabase();
  const storagePath = "preanamnesis/"+id+".pdf";
  const { error: pdfUploadError } = await supabase.storage
    .from("public_assets")
    .upload("preanamnesis/"+id+".pdf", pdfBytes, { contentType: "application/pdf", upsert: true });
  if (pdfUploadError) throw new Error("upload pdf preanamnesis: " + pdfUploadError.message);
  const pdfUrl = supabase.storage.from("public_assets").getPublicUrl("preanamnesis/"+id+".pdf").data.publicUrl;
  console.log("[AUDIO] PDF:", pdfUrl);
  const appPdfUrl = buildPublicPdfUrl(id, pdfUrl);
  await persistPreanamnesisSession({
    id,
    phone: params.phone,
    pdfUrl: appPdfUrl,
    storagePath,
    transcript: t,
    extraction: a as Record<string, unknown>,
  });
  await sendMsg(params.phone, appPdfUrl, a, id);
  processed.add(fp);
  return {
    id,
    htmlUrl,
    pdfUrl: appPdfUrl,
    storagePath,
    transcript: t,
    extraction: a as Record<string, unknown>,
  };
}

async function processAudio(fp: string): Promise<void> {
  // Leer telefono del metadata JSON (escrito por IAsmin plugin v6)
  let phone = optionalEnv("AUDIO_WATCHER_NOTIFY_PHONE") || '';
  try {
    const metaPath = fp.replace(/.ogg$/, '.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as { phone?: unknown };
      if (typeof meta.phone === 'string') phone = meta.phone;
      console.log('[AUDIO] phone from metadata: ' + phone);
    }
  } catch {
    console.log('[AUDIO] metadata no disponible; usando AUDIO_WATCHER_NOTIFY_PHONE si existe');
  }
  if (phone) {
    await processAudioForPhone({ filePath: fp, phone: phone });
  } else {
    console.log('[AUDIO] No phone (ni metadata ni AUDIO_WATCHER_NOTIFY_PHONE)');
  }
}

export function startAudioWatcher(): void {
  console.log("[AUDIO] Monitoreando...");
  for (const f of readdirSync(MEDIA_DIR)) { if (f.endsWith(".ogg")) processed.add(MEDIA_DIR+"/"+f); }
  watch(MEDIA_DIR, (_, f) => { if (f?.endsWith(".ogg")) setTimeout(() => processAudio(MEDIA_DIR+"/"+f), 2000); });
  console.log("[AUDIO] Listo");
}

if (import.meta.main) {
  startAudioWatcher();
}
