/**
 * Medical certificate PDF — no claims of legal issuance until an external
 * trusted signature provider has signed and verified the final bytes.
 * Browser-side signature images are deliberately not used as evidence.
 */
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface MedicalCertificatePdfInput {
  reference: string;
  type: string;
  patientName: string;
  patientDni?: string | null;
  doctorName: string;
  doctorLicense: string;
  jurisdiction?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  observations?: string | null;
  daysOfRest: number;
  startDate: string;
  endDate?: string | null;
  createdAt: string;
}

const TYPES: Record<string, string> = {
  reposo_laboral: 'Reposo laboral',
  reposo_escolar: 'Reposo escolar',
  aptitud_fisica: 'Aptitud física',
  constancia_atencion: 'Constancia de atención',
  tratamiento: 'Tratamiento',
  otro: 'Certificado médico',
};

function clean(value?: string | null): string {
  return (value ?? '').replace(/[\u2018-\u2019]/g, "'")
    .replace(/[\u201c-\u201d]/g, '"')
    .replace(/[\u2013-\u2014]/g, '-')
    .replace(/[^\x20-\xFF]/g, ' ').trim();
}

function date(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function drawQr(doc: jsPDF, url: string): void {
  const matrix = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
  const left = 160, top = 28, size = 27, step = size / matrix.size;
  doc.setFillColor(255, 255, 255);
  doc.rect(left, top, size, size, 'F');
  doc.setFillColor(0, 0, 0);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.data[y * matrix.size + x]) {
        doc.rect(left + x * step, top + y * step, step + 0.01, step + 0.01, 'F');
      }
    }
  }
}

/**
 * Only "signed-source" PDFs (unsigned bytes destined for trusted remote signing)
 * contain a verification QR. Draft previews have a clear warning and NO QR.
 */
export function generateMedicalCertificatePdf(
  input: MedicalCertificatePdfInput,
  mode: 'draft' | 'signing-source' = 'draft',
): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 18, right = 192, width = right - left;
  let y = 20;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 63, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('AUTAMEDICA', left, y);
  y += 9;
  doc.setFontSize(12);
  doc.text('CERTIFICADO MÉDICO — ' + (TYPES[input.type] ?? 'General'), left, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Referencia interna: ${clean(input.reference)}`, left, y);
  y += 7;
  doc.text(`Fecha de registro: ${date(input.createdAt)}`, left, y);
  if (mode === 'signing-source') {
    drawQr(doc, `https://autamedica.com/verify/${encodeURIComponent(input.reference)}`);
  }

  y = 76;
  const field = (title: string, text: string) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(title.toUpperCase(), left, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(clean(text) || 'No informado', width);
    doc.text(lines, left, y);
    y += lines.length * 5.8 + 9;
  };

  field('Paciente', input.patientName);
  field('Documento', input.patientDni ?? 'No registrado');
  field('Profesional', input.doctorName);
  field('Matrícula / jurisdicción', `${input.doctorLicense} ${input.jurisdiction ?? ''}`);
  field('Diagnóstico', input.diagnosis ?? '');
  if (input.treatment) field('Tratamiento indicado', input.treatment);
  field('Reposo indicado', `${input.daysOfRest} día(s). Desde ${date(input.startDate)}${input.endDate ? ' hasta ' + date(input.endDate) : ''}`);
  if (input.observations) field('Observaciones', input.observations);

  if (y > 245) {
    doc.addPage();
    y = 25;
  }

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('La validez del documento está sujeta a firma y comprobación de autenticidad.', left, Math.min(260, y + 7));

  if (mode === 'draft') {
    doc.setDrawColor(220, 38, 38);
    doc.setTextColor(185, 28, 28);
    doc.setFontSize(27);
    doc.setFont('helvetica', 'bold');
    doc.text('BORRADOR - SIN FIRMA', 105, 274, { align: 'center' });
  } else {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Original sujeto a validación de firma en la plataforma de emisión.', left, 274);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
