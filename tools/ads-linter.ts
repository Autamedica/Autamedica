import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config({ path: './apps/web/.env' });

const apiKey = process.env.GEMINI_API_KEY || '';

async function validateAd(headline: string, description: string) {
  if (!apiKey || !apiKey.startsWith('AIza')) {
    console.error('API Key not found');
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = 'Experto Google Ads. Analiza este anuncio: Título: "' + headline + '", Descripción: "' + description + '". REGLA: No usar la palabra Receta, Medicamento o Farmacia. Respuesta: 1. Estado (APROBABLE/RECHAZO), 2. Motivo, 3. Sugerencia segura.';

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    console.log('\n--- ANÁLISIS DE POLÍTICA (GEMINI) ---\n');
    console.log(response.text());
    console.log('\n------------------------------------');
  } catch (error) {
    // Si falla, intentamos con gemini-pro que es mas estándar
    try {
        const modelPro = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const resultPro = await modelPro.generateContent(prompt);
        console.log('\n--- ANÁLISIS DE POLÍTICA (GEMINI PRO) ---\n');
        console.log(resultPro.response.text());
        console.log('\n------------------------------------');
    } catch (errPro) {
        console.error('Error final al conectar con la IA:', errPro);
    }
  }
}

const args = process.argv.slice(2);
if (args.length >= 2) {
  validateAd(args[0], args[1]);
}
