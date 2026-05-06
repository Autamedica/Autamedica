import type { APIRoute } from 'astro';
import { jsPDF } from 'jspdf';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDQ2OCwiZXhwIjoyMDg3OTY2NDY4fQ.1mkkee3DSFOnuN7sI_D4buAxC_wNOcFGga_fhvs9zAo';

export const GET: APIRoute = async ({ params }) => {
  const id = params.id?.replace('.pdf', '') || '';
  if (!id || id.includes('..')) return new Response('Not found', { status: 404 });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase.storage.from('public_assets').download(`preanamnesis/${id}.html`);
    if (error || !data) return new Response('Not found', { status: 404 });

    const html = await data.text();
    const pdf = generatePdf(html, id);
    return new Response(pdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="pre-anamnesis-${id}.pdf"` },
    });
  } catch {
    return new Response('Error generating PDF', { status: 500 });
  }
};

function generatePdf(html: string, id: string): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const M = 20, W = 170;
  let y = 20;

  // Header verde
  doc.setFillColor(16, 95, 67);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('AutaMedica', M, 15);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text('Pre-Anamnesis — Audio del Paciente', M, 23);
  doc.setFontSize(7); doc.text('ID: ' + id.slice(0, 12), 190, 30, { align: 'right' });
  y = 45;

  const extract = (re: RegExp): string => {
    const m = html.match(re);
    if (!m) return '';
    return m[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, (e: string) => {
      const map: Record<string,string> = { '&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú','&ntilde;':'ñ','&mdash;':'—','&copy;':'©','&amp;':'&' };
      return map[e] || e;
    }).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(parseInt(n))).trim();
  };

  const section = (title: string, text: string, alert?: boolean) => {
    if (!text || text.length < 3) return;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFillColor(alert ? 255 : 245, alert ? 243 : 245, alert ? 205 : 245);
    doc.rect(M - 2, y - 4, W + 4, 8, 'F');
    if (alert) { doc.setDrawColor(255, 193, 7); doc.setLineWidth(0.5); doc.line(M - 2, y - 4, M - 2, y + 8); }
    doc.setTextColor(alert ? 150 : 13, alert ? 100 : 110, alert ? 0 : 110);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text(title, M, y);
    y += 8;
    doc.setTextColor(60, 60, 60); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, W);
    for (const l of lines) { if (y > 270) { doc.addPage(); y = 20; } doc.text(l, M, y); y += 4.5; }
    y += 6;
  };

  // Patient info
  const pInfo = extract(/<strong>Paciente:<\/strong>\s*(.*?)</);
  if (pInfo) { doc.setTextColor(60, 60, 60); doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('DATOS DEL PACIENTE', M, y); y += 6; doc.setFont('helvetica', 'normal'); doc.text(pInfo, M, y); y += 10; }

  // Sections
  section('MOTIVO DE CONSULTA', extract(/<h2>Motivo de Consulta<\/h2>\s*<p>(.*?)<\/p>/s));
  section('ENFERMEDAD ACTUAL', extract(/<h2>Enfermedad Actual<\/h2>([\s\S]*?)(?=<h2>|$)/));
  section('ANTECEDENTES PERSONALES', extract(/<h2>Antecedentes Personales<\/h2>([\s\S]*?)(?=<h2>|<div|$)/));
  
  const alertText = extract(/<div class="alert">[\s\S]*?<strong>[^<]*<\/strong>(.*?)<\/div>/);
  if (alertText) section('SIGNOS DE ALARMA', alertText, true);
  
  const missingText = extract(/<div class="missing">[\s\S]*?<strong>[^<]*<\/strong>(.*?)<\/div>/);
  if (missingText) section('DATOS PARA COMPLETAR', missingText);
  
  section('IMPRESION GENERAL', extract(/<h2>Impresion General<\/h2>\s*<p>(.*?)<\/p>/s));

  // Footer
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setDrawColor(200, 200, 200); doc.line(M, y, 190, y); y += 6;
  doc.setTextColor(130, 130, 130); doc.setFontSize(6.5); doc.setFont('helvetica', 'italic');
  const disc = 'Pre-anamnesis generada a partir de audio del paciente. Debe ser completada por un profesional. No constituye diagnostico ni reemplaza la consulta medica. © AutaMedica';
  for (const l of doc.splitTextToSize(disc, W)) { doc.text(l, M, y); y += 3.5; }

  return doc.output('arraybuffer');
}
