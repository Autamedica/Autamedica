import { GoogleGenerativeAI } from '@google/generative-ai';

export interface TriageAIOutput {
  chiefComplaint: string;
  clinicalNarrative: string;
  severity: 'Leve' | 'Moderada' | 'Alta' | 'No determinable';
  safetyFlags: string[];
  coveredAreas: string[];
  missingAreas: string[];
  recommendations: string;
}

export async function processTriageWithAI(
  answers: Record<string, string>,
  apiKey: string,
): Promise<TriageAIOutput> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
  });

  const prompt = `Eres un asistente clínico. Analiza las siguientes respuestas de un paciente que completó 
un triaje de salud por WhatsApp. Devuelve SOLO un JSON válido con esta estructura:

{
  "chiefComplaint": "motivo principal en lenguaje médico (1 frase)",
  "clinicalNarrative": "narrativa clínica estructurada (2-3 frases)",
  "severity": "Leve|Moderada|Alta|No determinable",
  "safetyFlags": ["señal de alerta o array vacío"],
  "coveredAreas": ["áreas cubiertas en el triaje"],
  "missingAreas": ["áreas que faltaría explorar"],
  "recommendations": "recomendación breve y empática (1 frase)"
}

DATOS DEL PACIENTE:
- Edad: ${answers.age || '?'}
- Motivo de consulta: ${answers.main_concern || '?'}
- Síntomas: ${answers.current_symptoms || '?'}
- Medicación: ${answers.medications || '?'}
- Sueño: ${answers.sleep_quality || '?'}
- Ánimo: ${answers.mood || '?'}
- Dolor: ${answers.pain_level || '?'}

IMPORTANTE: Si dolor es BASTANTE o MUCHO, severity >= Moderada.
Si menciona "pecho", "falta de aire", "desmayo" → safetyFlags.
Responde SOLO el JSON, sin markdown.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  
  // Extraer JSON
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Gemini no devolvió JSON: ' + text.substring(0, 200));
  }
  
  const parsed = JSON.parse(text.substring(start, end + 1));
  return {
    chiefComplaint: parsed.chiefComplaint || answers.main_concern || '',
    clinicalNarrative: parsed.clinicalNarrative || '',
    severity: parsed.severity || 'No determinable',
    safetyFlags: parsed.safetyFlags || [],
    coveredAreas: parsed.coveredAreas || [],
    missingAreas: parsed.missingAreas || [],
    recommendations: parsed.recommendations || '',
  };
}
