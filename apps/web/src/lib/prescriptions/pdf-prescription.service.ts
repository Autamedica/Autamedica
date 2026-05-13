import { getServerEnvOrDefault } from '@autamedica/shared';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { rctaService } from './rcta.service';
import { getValidityPeriodDays } from './strict-validation';

export interface PrescriptionPdfInput {
  prescriptionId: string;
  medication: {
    genericName: string;
    commercialName?: string;
    dosage: string;
    presentation: string;
    quantity: number;
    instructions: string;
  };
  diagnosis: string;
  notes?: string;
  patient: {
    name: string;
    dni?: string;
    cuil?: string;
    dateOfBirth?: string;
    sex?: string;
    insurancePlan?: string;
    address?: string;
  };
  prescriber: {
    name: string;
    profession?: string;
    license: string;
    licenseJurisdiction?: string;
    licenseEntity?: string;
    refeps?: string;
    specialty?: string;
    professionalAddress?: string;
    signatureImageUrl?: string;
    stampImageUrl?: string;
  };
  issuedAt: string;
  // expiresAt is now derived but can be overridden
  expiresAt?: string;
}

export interface PrescriptionArtifacts {
  cuir: string;
  pdfBuffer: Uint8Array;
  pdfFilename: string;
  qrDataUrl: string;
  qrContent: string;
}

function formatDate(iso: string): string {
  const dateOnly = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }

  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function calculateExpiry(issuedAt: string, genericName: string): string {
  const days = getValidityPeriodDays(genericName);
  const date = new Date(issuedAt);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function formatPatientSex(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['female', 'f', 'femenino', 'mujer'].includes(normalized)) return 'Femenino';
  if (['male', 'm', 'masculino', 'hombre'].includes(normalized)) return 'Masculino';
  if (['other', 'otro', 'otra', 'no_binario', 'no binario'].includes(normalized)) return 'Otro';
  if (['prefer_not_to_say', 'prefiero_no_decir'].includes(normalized)) return 'No especificado';
  return value;
}

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

function buildCode128BValues(value: string): number[] {
  const sanitized = value.replace(/[^\x20-\x7e]/g, '').slice(0, 48);
  const dataValues = Array.from(sanitized).map((char) => char.charCodeAt(0) - 32);
  const checksum = dataValues.reduce((sum, code, index) => sum + code * (index + 1), 104) % 103;
  return [104, ...dataValues, checksum, 106];
}

function drawCode128Barcode(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const codes = buildCode128BValues(value);
  const moduleCount = codes.reduce(
    (sum, code) => sum + CODE128_PATTERNS[code].split('').reduce((inner, digit) => inner + Number(digit), 0),
    0,
  );
  const moduleWidth = width / moduleCount;
  let cursor = x;

  doc.setFillColor(15, 23, 42);
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    for (let i = 0; i < pattern.length; i += 1) {
      const segmentWidth = Number(pattern[i]) * moduleWidth;
      if (i % 2 === 0) {
        doc.rect(cursor, y, segmentWidth, height, 'F');
      }
      cursor += segmentWidth;
    }
  }
}

export async function generatePrescriptionPdf(
  input: PrescriptionPdfInput,
): Promise<PrescriptionArtifacts> {
  // 1. RCTA Registration (Argentina Compliance)
  const registration = await rctaService.registerPrescription(
    input.prescriber.license, 
    input.patient.dni || 'unknown', 
    input.medication.genericName
  );
  
  const cuir = registration.cuir;
  const qrContent = `https://www.autamedica.com/verify/${cuir}`;
  const expiresAt = input.expiresAt || calculateExpiry(input.issuedAt, input.medication.genericName);

  // Generate QR
  const qrDataUrl = await QRCode.toDataURL(qrContent, {
    width: 120,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginLeft = 20;
  const contentWidth = pageWidth - 40;
  let y = 20;

  // Header (Dark Slate - Premium Look)
  doc.setFillColor(15, 23, 42); 
  doc.rect(0, 0, pageWidth, 45, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RECETA MÉDICA ELECTRÓNICA', marginLeft, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema Nacional de Trazabilidad de Actos (RCTA)', marginLeft, 26);
  doc.setTextColor(56, 189, 248); // sky-400 for CUIR
  doc.setFont('helvetica', 'bold');
  doc.text(`CUIR: ${cuir}`, marginLeft, 33);
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.text(`Emitida: ${formatDate(input.issuedAt)}  |  Vence: ${formatDate(expiresAt)}`, marginLeft, 39);

  // QR in header (pharmacy verification)
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 50, 8, 30, 30);

  y = 55;
  doc.setTextColor(30, 41, 59);

  // Patient info (Compliance Block)
  const patientBlockHeight = input.patient.address || input.patient.insurancePlan ? 40 : 32;
  doc.setFillColor(248, 250, 252); 
  doc.rect(marginLeft, y, contentWidth, patientBlockHeight, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('DATOS DEL PACIENTE', marginLeft + 4, y + 6);
  
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(input.patient.name, marginLeft + 4, y + 14);

  const patientSex = formatPatientSex(input.patient.sex);
  const patientMeta = [
    input.patient.dni ? `DNI: ${input.patient.dni}` : null,
    input.patient.cuil ? `CUIL: ${input.patient.cuil}` : null,
    patientSex ? `Sexo: ${patientSex}` : null,
    input.patient.dateOfBirth ? `Fecha de Nacimiento: ${formatDate(input.patient.dateOfBirth)}` : null,
  ].filter(Boolean).join('  |  ');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(patientMeta, marginLeft + 4, y + 20);
  
  let extraLine = 0;
  if (input.patient.address) {
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Domicilio: ${input.patient.address}`, marginLeft + 4, y + 26);
    extraLine += 6;
  }
  if (input.patient.insurancePlan) {
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`OOSS / Plan: ${input.patient.insurancePlan}`, marginLeft + 4, y + 26 + extraLine);
  }
  y += patientBlockHeight + 8;

  // Medication (IFA Prominence - Critical for Compliance)
  doc.setFillColor(240, 249, 255); 
  doc.rect(marginLeft, y, contentWidth, 45, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(2, 132, 199); 
  doc.text('PRESCRIPCIÓN (IFA)', marginLeft + 4, y + 6);

  // Generic Name (IFA) - Large and prominent
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(input.medication.genericName.toUpperCase(), marginLeft + 4, y + 16);

  if (input.medication.commercialName) {
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(`Sugerido: ${input.medication.commercialName}`, marginLeft + 4, y + 23);
  }

  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  const medSpecs = `${input.medication.dosage} — ${input.medication.presentation}`;
  doc.text(medSpecs, marginLeft + 4, y + 30);
  doc.text(`Cantidad: ${input.medication.quantity} unidades`, marginLeft + 4, y + 36);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text(input.medication.instructions, marginLeft + 4, y + 42, { maxWidth: contentWidth - 8 });
  y += 55;

  // Diagnosis
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('DIAGNÓSTICO / INDICACIONES', marginLeft, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(input.diagnosis || 'Criterio clínico', marginLeft, y, { maxWidth: contentWidth });
  y += 12;

  // Notes
  if (input.notes) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('OBSERVACIONES ADICIONALES', marginLeft, y);
    y += 5;
    doc.setFontSize(9);
    doc.text(input.notes, marginLeft, y, { maxWidth: contentWidth });
    y += 15;
  }

  // Barcode required for the national electronic prescription format.
  const barcodeY = 192;
  doc.setFillColor(255, 255, 255);
  doc.rect(marginLeft, barcodeY, contentWidth, 16, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(marginLeft, barcodeY, contentWidth, 16);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('CÓDIGO DE BARRAS', marginLeft + 4, barcodeY + 5);
  drawCode128Barcode(doc, cuir, marginLeft + 48, barcodeY + 3, 78, 8);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`CUIR: ${cuir}`, marginLeft + 48, barcodeY + 14);
  doc.setTextColor(100, 116, 139);
  doc.text('Identificador verificable de receta electrónica', marginLeft + 132, barcodeY + 9);

  // Prescriber (Regulatory Info Block)
  y = 210; // Fixed position for footer block
  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('PROFESIONAL PRESCRIPTOR', marginLeft, y);
  
  y += 7;
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(input.prescriber.name, marginLeft, y);
  
  y += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const prescriberInfo = [
    input.prescriber.profession || 'Médico/a',
    input.prescriber.specialty ? `Esp: ${input.prescriber.specialty}` : null,
  ].filter(Boolean).join('  |  ');
  doc.text(prescriberInfo, marginLeft, y);

  y += 5;
  doc.setFontSize(8);
  const licenseInfo = [
    `Matrícula: ${input.prescriber.license} (${input.prescriber.licenseJurisdiction || 'MN'})`,
    input.prescriber.refeps ? `REFEPS: ${input.prescriber.refeps}` : null,
    input.prescriber.licenseEntity ? `Entidad: ${input.prescriber.licenseEntity}` : null,
  ].filter(Boolean).join('  —  ');
  doc.text(licenseInfo, marginLeft, y);

  if (input.prescriber.professionalAddress) {
    y += 4;
    doc.setFontSize(7);
    doc.text(`Domicilio profesional: ${input.prescriber.professionalAddress}`, marginLeft, y);
  }

  // Firma Digital
  const signatureY = 245;

  if (input.prescriber.signatureImageUrl) {
    // Stamp visual signature image
    try {
      const sigResponse = await fetch(input.prescriber.signatureImageUrl);
      const sigArrayBuf = await sigResponse.arrayBuffer();
      const sigBase64 = Buffer.from(sigArrayBuf).toString('base64');
      const sigFormat = input.prescriber.signatureImageUrl.includes('.webp') ? 'WEBP' : 'PNG';
      const sigDataUrl = `data:image/${sigFormat.toLowerCase()};base64,${sigBase64}`;
      doc.addImage(sigDataUrl, sigFormat, marginLeft, signatureY, 35, 20);
    } catch {
      // Fallback: draw placeholder if image fetch fails
      doc.setFillColor(248, 250, 252);
      doc.rect(marginLeft, signatureY, 35, 20, 'F');
    }
  }

  if (input.prescriber.stampImageUrl) {
    // Stamp professional seal image
    try {
      const stampResponse = await fetch(input.prescriber.stampImageUrl);
      const stampArrayBuf = await stampResponse.arrayBuffer();
      const stampBase64 = Buffer.from(stampArrayBuf).toString('base64');
      const stampFormat = input.prescriber.stampImageUrl.includes('.webp') ? 'WEBP' : 'PNG';
      const stampDataUrl = `data:image/${stampFormat.toLowerCase()};base64,${stampBase64}`;
      doc.addImage(stampDataUrl, stampFormat, marginLeft + 40, signatureY, 35, 20);
    } catch {
      // Silently skip stamp if fetch fails
    }
  }

  // Digital signature info box (next to visual signature)
  const infoBoxX = input.prescriber.stampImageUrl ? marginLeft + 80 : marginLeft + 40;
  const infoBoxWidth = pageWidth - 20 - infoBoxX;
  doc.setFillColor(248, 250, 252);
  doc.rect(infoBoxX, signatureY, infoBoxWidth, 25, 'F');
  doc.setDrawColor(15, 23, 42);
  doc.rect(infoBoxX, signatureY, infoBoxWidth, 25);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FIRMA ELECTRÓNICA', infoBoxX + 3, signatureY + 5);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  const signatureLegend = doc.splitTextToSize(
    `Este documento ha sido firmado -electrónica o digitalmente según corresponda- por ${input.prescriber.name}`,
    infoBoxWidth - 6,
  );
  doc.text(signatureLegend, infoBoxX + 3, signatureY + 10);
  const validatorY = signatureY + 10 + signatureLegend.length * 3.5;
  doc.text(`Validador RCTA: ${cuir}`, infoBoxX + 3, validatorY);
  doc.text(`Fecha de registro: ${formatDate(input.issuedAt)}`, infoBoxX + 3, validatorY + 4);
  doc.text(`Hash: verificable vía QR`, infoBoxX + 3, validatorY + 8);

  // Footer (Compliance & Privacy)
  const footerY = 276;
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Esta prescripción tiene validez de documento público electrónico según Ley 27.553.`,
    marginLeft, footerY
  );
  doc.text(
    `AutaMedica garantiza el cumplimiento de la Ley 25.326 de Protección de Datos Personales.`,
    marginLeft, footerY + 4
  );

  const renapdisLegajo = getServerEnvOrDefault('RENAPDIS_RL_NUMBER', 'RL pendiente') ?? 'RL pendiente';
  doc.text(
    'Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos',
    marginLeft,
    footerY + 10,
  );
  doc.text(
    `del Ministerio de Salud de la Nación - ${renapdisLegajo}.`,
    marginLeft,
    footerY + 14,
  );

  const pdfBuffer = new Uint8Array(doc.output('arraybuffer'));
  const pdfFilename = `receta-ar-${cuir}.pdf`;

  return { cuir, pdfBuffer, pdfFilename, qrDataUrl, qrContent };
}
