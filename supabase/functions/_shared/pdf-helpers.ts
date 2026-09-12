import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface PrescriptionItem {
  name: string;
  generic_name?: string;
  dosage: string;
  frequency: string;
  duration?: string;
  instructions?: string;
}

export interface PrescriptionPdfData {
  cuir: string;
  issuedAt: string;
  expiresAt: string;
  doctor: {
    name: string;
    licenseNumber: string;
    licenseJurisdiction?: string;
    refepsId?: string;
    specialty?: string;
  };
  patient: {
    name: string;
    dni?: string;
    cuil?: string;
    insurancePlan?: string;
    address?: string;
  };
  items: PrescriptionItem[];
  diagnosis?: string;
  notes?: string;
}

export interface MedicalOrderPractice {
  name: string;
}

export interface MedicalOrderPdfData {
  cuir: string;
  issuedAt: string;
  studyType: string;
  doctor: {
    name: string;
    licenseNumber: string;
    licenseJurisdiction?: string;
    refepsId?: string;
    specialty?: string;
  };
  patient: {
    name: string;
    dni?: string;
    cuil?: string;
    insurancePlan?: string;
    address?: string;
  };
  practices: MedicalOrderPractice[];
  diagnosis?: string;
  notes?: string;
}

export function sanitizePdfText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/[\u201c\u201d\u201e\u201f\u00ab\u00bb]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    .split('')
    .filter((char) => char.charCodeAt(0) <= 255)
    .join('');
}

export function formatDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export async function sha256Hex(buffer: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function drawQrCodeVector(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  size: number,
): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const numModules = qr.modules.size;
  const moduleSize = size / numModules;

  // Background white box
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, 'F');

  // QR black pixels
  doc.setFillColor(15, 23, 42);
  const marginOffset = 0.005;
  for (let row = 0; row < numModules; row++) {
    for (let col = 0; col < numModules; col++) {
      if (qr.modules.data[row * numModules + col]) {
        doc.rect(
          x + col * moduleSize - marginOffset,
          y + row * moduleSize - marginOffset,
          moduleSize + 2 * marginOffset,
          moduleSize + 2 * marginOffset,
          'F',
        );
      }
    }
  }
}

export function generatePrescriptionPdfBytes(data: PrescriptionPdfData): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginLeft = 18;
  const contentWidth = pageWidth - marginLeft * 2;

  // Header Colors
  const headerBg: [number, number, number] = [15, 23, 42]; // Slate-900
  const accentTeal: [number, number, number] = [13, 148, 136]; // Teal-600
  const boxBg: [number, number, number] = [248, 250, 252]; // Slate-50
  const borderGray: [number, number, number] = [226, 232, 240]; // Slate-200
  const darkText: [number, number, number] = [15, 23, 42];
  const mutedText: [number, number, number] = [100, 116, 139];

  // Header Banner
  doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RECETA MÉDICA DIGITAL', marginLeft, 16);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('Sistema Nacional de Trazabilidad y Receta Electrónica (Ley 27.553)', marginLeft, 22);

  doc.setTextColor(accentTeal[0], accentTeal[1], accentTeal[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`CUIR: ${data.cuir}`, marginLeft, 29);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Emisión: ${formatDate(data.issuedAt)}   |   Vencimiento: ${formatDate(data.expiresAt)}`, marginLeft, 35);

  // QR Code top right in header
  const qrUrl = `https://autamedica.com/verify/${encodeURIComponent(data.cuir)}`;
  drawQrCodeVector(doc, qrUrl, pageWidth - marginLeft - 26, 8, 26);

  let y = 48;

  // Doctor Block
  doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.roundedRect(marginLeft, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('PROFESIONAL PRESCRIPTOR', marginLeft + 4, y + 5);

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(sanitizePdfText(data.doctor.name), marginLeft + 4, y + 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  const docMeta = [
    `Matrícula: ${sanitizePdfText(data.doctor.licenseNumber)}${data.doctor.licenseJurisdiction ? ` (${sanitizePdfText(data.doctor.licenseJurisdiction)})` : ''}`,
    data.doctor.refepsId ? `REFEPS: ${sanitizePdfText(data.doctor.refepsId)}` : '',
    data.doctor.specialty ? `Especialidad: ${sanitizePdfText(data.doctor.specialty)}` : '',
  ].filter(Boolean).join('   |   ');
  doc.text(docMeta, marginLeft + 4, y + 18);

  y += 28;

  // Patient Block
  doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
  doc.roundedRect(marginLeft, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('DATOS DEL PACIENTE', marginLeft + 4, y + 5);

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(sanitizePdfText(data.patient.name), marginLeft + 4, y + 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const patMeta = [
    data.patient.dni ? `DNI: ${sanitizePdfText(data.patient.dni)}` : '',
    data.patient.cuil ? `CUIL: ${sanitizePdfText(data.patient.cuil)}` : '',
    data.patient.insurancePlan ? `Cobertura: ${sanitizePdfText(data.patient.insurancePlan)}` : '',
    data.patient.address ? `Domicilio: ${sanitizePdfText(data.patient.address)}` : '',
  ].filter(Boolean).join('   |   ');
  doc.text(patMeta, marginLeft + 4, y + 18);

  y += 28;

  // Diagnosis Block (if provided)
  if (data.diagnosis) {
    doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
    doc.roundedRect(marginLeft, y, contentWidth, 14, 2, 2, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    doc.text('DIAGNÓSTICO', marginLeft + 4, y + 4.5);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text(sanitizePdfText(data.diagnosis), marginLeft + 4, y + 10, { maxWidth: contentWidth - 8 });
    y += 18;
  }

  // Medications Section Header
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('TRATAMIENTO FARMACOLÓGICO / MEDICAMENTOS PRESCRIPTOS', marginLeft, y + 3);
  y += 6;

  // Medication Items
  data.items.forEach((item, index) => {
    const itemHeight = item.instructions || item.duration ? 24 : 18;
    doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
    doc.roundedRect(marginLeft, y, contentWidth, itemHeight, 2, 2, 'FD');

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    const medTitle = `${index + 1}. ${sanitizePdfText(item.name || item.generic_name || 'Medicamento')} ${sanitizePdfText(item.dosage)}`;
    doc.text(medTitle, marginLeft + 4, y + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const medDetails = [
      item.generic_name ? `DCI/Genérico: ${sanitizePdfText(item.generic_name)}` : '',
      `Frecuencia: ${sanitizePdfText(item.frequency)}`,
      item.duration ? `Duración: ${sanitizePdfText(item.duration)}` : '',
    ].filter(Boolean).join('   |   ');
    doc.text(medDetails, marginLeft + 4, y + 11);

    if (item.instructions) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(71, 85, 105);
      doc.text(`Indicaciones: ${sanitizePdfText(item.instructions)}`, marginLeft + 4, y + 16, { maxWidth: contentWidth - 8 });
    }

    y += itemHeight + 4;
  });

  // Notes Block (if provided)
  if (data.notes) {
    doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
    doc.roundedRect(marginLeft, y, contentWidth, 16, 2, 2, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    doc.text('OBSERVACIONES / INDICACIONES ADICIONALES', marginLeft + 4, y + 4.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text(sanitizePdfText(data.notes), marginLeft + 4, y + 10, { maxWidth: contentWidth - 8 });
    y += 20;
  }

  // Footer Legal Notice
  const footerY = 270;
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.line(marginLeft, footerY, marginLeft + contentWidth, footerY);

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text(
    'Documento médico digital firmado electrónicamente conforme a la Ley Nacional 27.553 y Res. 2214/2025.',
    marginLeft,
    footerY + 4,
  );
  doc.text(
    `Verificación de autenticidad en ${qrUrl} o escaneando el código QR. AutaMedica Healthcare OS.`,
    marginLeft,
    footerY + 8,
  );

  return new Uint8Array(doc.output('arraybuffer'));
}

export function generateMedicalOrderPdfBytes(data: MedicalOrderPdfData): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginLeft = 18;
  const contentWidth = pageWidth - marginLeft * 2;

  // Header Colors
  const headerBg: [number, number, number] = [15, 23, 42]; // Slate-900
  const accentTeal: [number, number, number] = [13, 148, 136]; // Teal-600
  const boxBg: [number, number, number] = [248, 250, 252]; // Slate-50
  const borderGray: [number, number, number] = [226, 232, 240]; // Slate-200
  const darkText: [number, number, number] = [15, 23, 42];
  const mutedText: [number, number, number] = [100, 116, 139];

  // Header Banner
  doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ORDEN MÉDICA / ESTUDIO COMPLEMENTARIO', marginLeft, 16);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Tipo de Solicitud: ${sanitizePdfText(data.studyType.toUpperCase())}`, marginLeft, 22);

  doc.setTextColor(accentTeal[0], accentTeal[1], accentTeal[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`CUIR: ${data.cuir}`, marginLeft, 29);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Fecha de Emisión: ${formatDate(data.issuedAt)}`, marginLeft, 35);

  // QR Code top right in header
  const qrUrl = `https://autamedica.com/orders/${encodeURIComponent(data.cuir)}`;
  drawQrCodeVector(doc, qrUrl, pageWidth - marginLeft - 26, 8, 26);

  let y = 48;

  // Doctor Block
  doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.roundedRect(marginLeft, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('PROFESIONAL SOLICITANTE', marginLeft + 4, y + 5);

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(sanitizePdfText(data.doctor.name), marginLeft + 4, y + 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  const docMeta = [
    `Matrícula: ${sanitizePdfText(data.doctor.licenseNumber)}${data.doctor.licenseJurisdiction ? ` (${sanitizePdfText(data.doctor.licenseJurisdiction)})` : ''}`,
    data.doctor.refepsId ? `REFEPS: ${sanitizePdfText(data.doctor.refepsId)}` : '',
    data.doctor.specialty ? `Especialidad: ${sanitizePdfText(data.doctor.specialty)}` : '',
  ].filter(Boolean).join('   |   ');
  doc.text(docMeta, marginLeft + 4, y + 18);

  y += 28;

  // Patient Block
  doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
  doc.roundedRect(marginLeft, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('DATOS DEL PACIENTE', marginLeft + 4, y + 5);

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(sanitizePdfText(data.patient.name), marginLeft + 4, y + 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const patMeta = [
    data.patient.dni ? `DNI: ${sanitizePdfText(data.patient.dni)}` : '',
    data.patient.cuil ? `CUIL: ${sanitizePdfText(data.patient.cuil)}` : '',
    data.patient.insurancePlan ? `Cobertura: ${sanitizePdfText(data.patient.insurancePlan)}` : '',
    data.patient.address ? `Domicilio: ${sanitizePdfText(data.patient.address)}` : '',
  ].filter(Boolean).join('   |   ');
  doc.text(patMeta, marginLeft + 4, y + 18);

  y += 28;

  // Diagnosis Block
  doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
  doc.roundedRect(marginLeft, y, contentWidth, 16, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('DIAGNÓSTICO PRESUNTIVO (CIE-10 / CLÍNICO)', marginLeft + 4, y + 5);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(sanitizePdfText(data.diagnosis || 'Control clínico general'), marginLeft + 4, y + 11, { maxWidth: contentWidth - 8 });

  y += 20;

  // Requested Practices Section Header
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('PRÁCTICAS / ESTUDIOS SOLICITADOS', marginLeft, y + 3);
  y += 6;

  // Practices List Box
  const practicesHeight = Math.max(22, 10 + data.practices.length * 7);
  doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
  doc.roundedRect(marginLeft, y, contentWidth, practicesHeight, 2, 2, 'FD');

  data.practices.forEach((practice, index) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text(`•   ${sanitizePdfText(practice.name)}`, marginLeft + 6, y + 7 + index * 7, { maxWidth: contentWidth - 12 });
  });

  y += practicesHeight + 6;

  // Preparation / Notes Block (if provided)
  if (data.notes) {
    doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
    doc.roundedRect(marginLeft, y, contentWidth, 18, 2, 2, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    doc.text('INDICACIONES DE PREPARACIÓN / INSTRUCCIONES AL PACIENTE', marginLeft + 4, y + 5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text(sanitizePdfText(data.notes), marginLeft + 4, y + 11, { maxWidth: contentWidth - 8 });
    y += 22;
  }

  // Footer Legal Notice
  const footerY = 270;
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.line(marginLeft, footerY, marginLeft + contentWidth, footerY);

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text(
    'Solicitud médica digital firmada electrónicamente por profesional habilitado. Válida para su presentación en centros de diagnóstico.',
    marginLeft,
    footerY + 4,
  );
  doc.text(
    `Verificación de autenticidad en ${qrUrl} o escaneando el código QR. AutaMedica Healthcare OS.`,
    marginLeft,
    footerY + 8,
  );

  return new Uint8Array(doc.output('arraybuffer'));
}
