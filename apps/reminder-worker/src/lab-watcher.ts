import { readFileSync, statSync } from "node:fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ensureEnv } from "@autamedica/shared";
import { DEFAULT_OPENCLAW_CONFIG, sendMessageWithFallback } from "@autamedica/scheduling";
import type { Database } from "@autamedica/types";

type SupabaseClient = ReturnType<typeof createClient<Database>>;

const processed = new Set<string>();
let supabaseClient: SupabaseClient | null = null;

function requireEnv(name: string): string {
  return ensureEnv(name);
}

function optionalEnv(...names: string[]): string | null {
  for (const name of names) {
    try {
      return ensureEnv(name);
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

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

interface LabExtraction {
  study_name: string;
  study_date: string | null;
  parameters: Array<{
    analyte: string;
    value: number | null;
    raw_value: string;
    unit: string;
    reference_range: string;
    status: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL';
  }>;
  red_flags: Array<{
    analyte: string;
    reason: string;
  }>;
  clinical_summary: string;
}

export interface ProcessLabImageResult {
  id: string;
  patient_id: string;
  study_name: string;
  study_date: string | null;
  storagePath: string;
  extraction: LabExtraction;
}

export async function processLabImageForPatient(params: {
  filePath: string;
  phone: string;
  mediaType?: string | null;
  sourceMessageId?: string | null;
}): Promise<ProcessLabImageResult> {
  const fp = params.filePath;
  if (processed.has(fp)) throw new Error("Imagen de laboratorio ya procesada");

  try {
    if (Date.now() - statSync(fp).mtimeMs > 24 * 60 * 60_000) {
      throw new Error("Imagen demasiado antigua");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Imagen demasiado antigua") throw err;
  }

  console.log("[LAB-WATCHER] Iniciando procesamiento visual de:", path.basename(fp));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabase() as any;

  // 1. Resolver el paciente por número de teléfono
  const rawPhone = params.phone;
  let patient: { id: string; first_name: string; last_name: string } | null = null;

  // Intentar coincidencia exacta primero
  const { data: exactPatient } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .eq('phone', rawPhone)
    .maybeSingle();

  patient = exactPatient;

  // Si no se encuentra, normalizar formato para números de Argentina (muy común tener discrepancia de 549 vs 54)
  if (!patient) {
    const cleanPhone = rawPhone.replace(/^\+/, '');
    let alternativePhone = rawPhone;
    if (cleanPhone.startsWith('549')) {
      alternativePhone = '54' + cleanPhone.slice(3);
    } else if (cleanPhone.startsWith('54') && !cleanPhone.startsWith('549')) {
      alternativePhone = '549' + cleanPhone.slice(2);
    }

    const { data: altPatient } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .or(`phone.eq.${rawPhone},phone.eq.${alternativePhone},phone.eq.+${cleanPhone},phone.eq.${cleanPhone}`)
      .maybeSingle();

    patient = altPatient;
  }

  if (!patient) {
    throw new Error(`No se encontró ningún paciente registrado con el teléfono ${rawPhone}`);
  }

  console.log(`[LAB-WATCHER] Paciente identificado: ${patient.first_name} ${patient.last_name} (ID: ${patient.id})`);

  // 2. Extraer datos estructurados usando Gemini Vision
  const bytes = readFileSync(fp);
  const genAI = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY"));
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const prompt = `Actúa como un patólogo y analista clínico senior de alta precisión. Analiza la imagen del informe de laboratorio proporcionado. 
Tu tarea es digitalizar el informe con precisión absoluta. Si hay valores escritos a mano, analízalos cuidadosamente.

Debes devolver un objeto JSON que respete estrictamente la siguiente estructura:

{
  "study_name": "Nombre completo del estudio",
  "study_date": "YYYY-MM-DD (si está disponible, sino null)",
  "parameters": [
    {
      "analyte": "Nombre del analito (ej: Glucemia, Colesterol Total)",
      "value": 120.5, // Valor numérico flotante. Si no es numérico, colocar null.
      "raw_value": "120.5", // Valor tal cual aparece en el informe en texto.
      "unit": "mg/dL", // Unidad de medida (ej: mg/dL, g/L, UI/L)
      "reference_range": "70 - 110", // Rango de referencia completo tal cual figura
      "status": "HIGH" // 'NORMAL', 'LOW', 'HIGH', 'CRITICAL'
    }
  ],
  "red_flags": [
    {
      "analyte": "Glucemia",
      "reason": "Valor de 120.5 mg/dL supera el límite superior de referencia (110 mg/dL)"
    }
  ],
  "clinical_summary": "Un resumen ejecutivo muy breve y empático, redactado en español, explicando el estudio de manera sencilla para el paciente."
}`;

  console.log("[LAB-WATCHER] Invocando API de Gemini Vision...");
  const response = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: params.mediaType || "image/jpeg", data: bytes.toString("base64") } }
  ]);

  const rawJsonText = response.response.text().trim();
  let extraction: LabExtraction;
  try {
    extraction = JSON.parse(rawJsonText) as LabExtraction;
  } catch (err) {
    console.error("[LAB-WATCHER] Error al parsear JSON devuelto por Gemini:", rawJsonText);
    throw new Error("La respuesta visual de Gemini no pudo ser parseada como JSON.");
  }

  // 3. Subir la imagen de laboratorio al bucket public_assets de Supabase
  const id = "lab-" + Date.now() + "-" + randomBytes(16).toString("hex");
  const ext = params.mediaType === "image/png" ? "png" : "jpeg";
  const storagePath = `laboratory-studies/${id}.${ext}`;

  console.log(`[LAB-WATCHER] Subiendo imagen a Supabase Storage: ${storagePath}`);
  const { error: storageError } = await supabase.storage
    .from("public_assets")
    .upload(storagePath, bytes, {
      contentType: params.mediaType || "image/jpeg",
      upsert: true
    });

  if (storageError) {
    throw new Error(`Error al subir imagen a Supabase Storage: ${storageError.message}`);
  }

  // 4. Persistir registro en la base de datos
  console.log("[LAB-WATCHER] Persistiendo registro en clinical_ai_lab_analyses...");
  const { error: dbError } = await supabase
    .from("clinical_ai_lab_analyses")
    .insert({
      id,
      patient_profile_id: patient.id,
      inbound_message_id: params.sourceMessageId || null,
      storage_path: storagePath,
      media_type: params.mediaType || "image/jpeg",
      status: "COMPLETED",
      study_name: extraction.study_name,
      study_date: extraction.study_date,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extracted_data_json: extraction.parameters as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      red_flags_detected: extraction.red_flags as any,
      clinical_summary: extraction.clinical_summary,
    });

  if (dbError) {
    throw new Error(`Error al insertar registro en clinical_ai_lab_analyses: ${dbError.message}`);
  }

  // 5. Enviar mensaje de confirmación al paciente
  const account = optionalEnv("OPENCLAW_ACCOUNT") || "autamedica";
  const patientMsg = `🩺 *Tu estudio de laboratorio ha sido digitalizado* 

📊 *Estudio:* ${extraction.study_name}
📝 *Resumen:* ${extraction.clinical_summary}

${extraction.red_flags.length > 0 
  ? `⚠️ *Valores fuera de rango detectados:* \n` + extraction.red_flags.map(rf => `• *${rf.analyte}*: ${rf.reason}`).join("\n") + `\n\n_Te recomendamos agendar una consulta médica para revisar estos resultados de forma detallada._`
  : `✅ Todos los valores analizados parecen estar dentro de los límites normales.`}

_AutaMedica — Cuidamos tu salud de forma inteligente._ 🏥`;

  console.log(`[LAB-WATCHER] Enviando confirmación al paciente (${rawPhone})...`);
  const patientSendResult = await sendMessageWithFallback(
    { ...DEFAULT_OPENCLAW_CONFIG, accountId: account },
    { to: rawPhone, message: patientMsg, channel: "whatsapp" }
  );

  if (!patientSendResult.ok) {
    console.error("[LAB-WATCHER] No se pudo enviar confirmación al paciente:", patientSendResult.error);
  }

  // 6. Si hay alertas críticas (red_flags), notificar de inmediato al médico de cabecera si existe
  if (extraction.red_flags.length > 0) {
    console.log("[LAB-WATCHER] Banderas rojas detectadas. Buscando médicos asignados...");
    const { data: careTeam, error: careTeamError } = await supabase
      .from('patient_care_team')
      .select(`
        doctor_id,
        doctors (
          id,
          first_name,
          last_name,
          phone
        )
      `)
      .eq('patient_id', patient.id);

    if (careTeamError) {
      console.error("[LAB-WATCHER] Error al buscar médicos en el equipo de cuidado:", careTeamError.message);
    } else if (careTeam && careTeam.length > 0) {
      for (const entry of careTeam) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (entry as any).doctors;
        if (doc?.phone) {
          const docMsg = `🚨 *ALERTA CLÍNICA: Valores Críticos de Laboratorio*

👨‍ Paciente: *${patient.first_name} ${patient.last_name}*
📊 Estudio: *${extraction.study_name}*

⚠️ *Banderas Rojas:*
${extraction.red_flags.map(rf => `• *${rf.analyte}*: ${rf.reason}`).join("\n")}

👉 Ingresa al Portal de AutaMedica para ver el informe estructurado completo y la imagen original.`;

          console.log(`[LAB-WATCHER] Notificando al médico asignado ${doc.first_name} ${doc.last_name} (${doc.phone})...`);
          const docSendResult = await sendMessageWithFallback(
            { ...DEFAULT_OPENCLAW_CONFIG, accountId: account },
            { to: doc.phone, message: docMsg, channel: "whatsapp" }
          );

          if (!docSendResult.ok) {
            console.error(`[LAB-WATCHER] Fallo al notificar al médico ${doc.phone}:`, docSendResult.error);
          }
        }
      }
    }
  }

  processed.add(fp);
  console.log(`[LAB-WATCHER] Procesamiento de laboratorio finalizado exitosamente. ID: ${id}`);

  return {
    id,
    patient_id: patient.id,
    study_name: extraction.study_name,
    study_date: extraction.study_date,
    storagePath,
    extraction,
  };
}
