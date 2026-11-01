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
  hideDiagnosis?: boolean;
  countryCode?: 'AR' | 'BR';
  cid10Code?: string | null;
  cidPatientRequested?: boolean;
  cidConsentRecordedAt?: string | null;
  treatment?: string | null;
  observations?: string | null;
  daysOfRest: number;
  startDate: string;
  endDate?: string | null;
  createdAt: string;
  electronicSignature?: {
    signature: Uint8Array;
    stamp: Uint8Array;
    confirmedAt: string;
  };
}

const TYPES_BR: Record<string, string> = {
  reposo_laboral: 'Afastamento laboral',
  reposo_escolar: 'Afastamento escolar',
  aptitud_fisica: 'Aptidão física',
  constancia_atencion: 'Declaração de comparecimento',
  tratamiento: 'Tratamento',
  otro: 'Atestado médico',
};

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
  mode: 'draft' | 'signing-source' | 'electronic' = 'draft',
): Uint8Array {
  if (mode === 'electronic' && !input.electronicSignature) {
    throw new Error('certificate_electronic_confirmation_required');
  }
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
  doc.text((input.countryCode === 'BR' ? 'ATESTADO MÉDICO - ' : 'CERTIFICADO MÉDICO — ') + (input.countryCode === 'BR' ? TYPES_BR[input.type] ?? 'Geral' : TYPES[input.type] ?? 'General'), left, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Referencia interna: ${clean(input.reference)}`, left, y);
  y += 7;
  doc.text(`Fecha de registro: ${date(input.createdAt)}`, left, y);
  if (mode !== 'draft') {
    drawQr(doc, `https://autamedica.com/verify/${encodeURIComponent(input.reference)}`);
  }

  y = 76;
  const ensureSpace = (height: number) => {
    if (y + height > 256) {
      doc.addPage();
      y = 25;
    }
  };

  const field = (title: string, text: string) => {
    ensureSpace(14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(title.toUpperCase(), left, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(clean(text) || 'No informado', width) as string[];
    for (const line of lines) {
      ensureSpace(6);
      doc.text(line, left, y);
      y += 5.8;
    }
    y += 9;
  };

  const isBrazil = input.countryCode === 'BR';
  field('Paciente', input.patientName);
  field('Documento', input.patientDni ?? (isBrazil ? 'Não informado' : 'No registrado'));
  field(isBrazil ? 'Médico' : 'Profesional', input.doctorName);
  field(isBrazil ? 'CRM / UF' : 'Matrícula / jurisdicción', `${input.doctorLicense} ${input.jurisdiction ?? ''}`);
  // Brazilian certificates must not disclose the narrative diagnosis by default.
  // A patient-authorized CID is the sole diagnosis data added to the employer-facing PDF.
  if (isBrazil) {
    if (input.cid10Code && input.cidPatientRequested && input.cidConsentRecordedAt) {
      field('CID-10 (a pedido do paciente)', input.cid10Code);
      field('Concordância expressa', 'CID incluído por solicitação e concordância expressa do(a) paciente, registrada na ficha clínica.');
    }
  } else if (!input.hideDiagnosis) {
    field('Diagnóstico', input.diagnosis ?? '');
  }
  if (input.treatment && !isBrazil) field('Tratamiento indicado', input.treatment);
  field(isBrazil ? 'Afastamento indicado' : 'Reposo indicado',
    isBrazil
      ? `${input.daysOfRest} dia(s). De ${date(input.startDate)}${input.endDate ? ' até ' + date(input.endDate) : ''}`
      : `${input.daysOfRest} día(s). Desde ${date(input.startDate)}${input.endDate ? ' hasta ' + date(input.endDate) : ''}`);
  if (input.observations && !isBrazil) field('Observaciones', input.observations);

  if (mode === 'electronic' && input.electronicSignature) {
    ensureSpace(62);
    const evidence = input.electronicSignature;
    const drawAsset = (bytes: Uint8Array, x: number) => {
      const image = doc.getImageProperties(bytes);
      const scale = Math.min(68 / image.width, 30 / image.height);
      doc.addImage(bytes, image.fileType, x, y, image.width * scale, image.height * scale);
    };
    drawAsset(evidence.signature, left);
    drawAsset(evidence.stamp, 110);
    y += 36;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.text(clean(input.doctorName), left, y);
    y += 6;
    doc.text(`Firma electrónica confirmada: ${clean(evidence.confirmedAt)}`, left, y);
  }

  for (let pageNumber = 1; pageNumber <= doc.getNumberOfPages(); pageNumber++) {
    doc.setPage(pageNumber);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(mode === 'electronic'
      ? 'Firma electrónica con imágenes de firma y sello autorizadas por el profesional.'
      : 'La validez requiere una firma auténtica y verificable.', left, 267);
    if (mode === 'draft') {
      doc.setTextColor(185, 28, 28);
      doc.setFontSize(25);
      doc.setFont('helvetica', 'bold');
      doc.text('BORRADOR - SIN FIRMA', 105, 282, { align: 'center' });
    } else if (mode === 'signing-source') {
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Original pendiente de firma por el proveedor autorizado.', left, 278);
    } else {
      doc.text('La verificación QR acredita el registro de emisión en AutaMedica. No es firma digital certificada.', left, 278);
    }
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

