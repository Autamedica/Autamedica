import { getServerEnvOrDefault } from '@autamedica/shared';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { getRuntimeEnvValue } from '@/lib/runtime-env';

export interface MedicalOrderPdfInput {
  orderId: string;
  studyType: 'laboratory' | 'imaging' | 'cardiology' | 'other';
  practices: Array<{ name: string }>;
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
  existingCuir?: string;
}

export interface MedicalOrderArtifacts {
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function loadLogoDataUrl(): Promise<string | null> {
  const appUrl =
    getRuntimeEnvValue('PUBLIC_APP_URL') ??
    import.meta.env.PUBLIC_APP_URL ??
    'https://www.autamedica.com';
  const logoUrl = new URL('/logo.png', appUrl).toString();

  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? 'image/png';
    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function formatPatientSex(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['female', 'f', 'femenino', 'mujer'].includes(normalized)) return 'Femenino';
  if (['male', 'm', 'masculino', 'hombre'].includes(normalized)) return 'Masculino';
  if (['other', 'otro', 'otra', 'no_binario', 'no binario'].includes(normalized)) return 'Otro';
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

const OFFICIAL_RENAPDIS_RL_NUMBER = 'RL-2026-47574120-APN-SSVEIYES#MS';

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

export async function generateMedicalOrderPdf(
  input: MedicalOrderPdfInput,
): Promise<MedicalOrderArtifacts> {
  const cuir = input.existingCuir || `O-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const qrContent = `https://www.autamedica.com/verify-order/${cuir}`;
  const barcodeValue = cuir;
  const barcodeTitle = 'CÓDIGO DE SOLICITUD';
  const barcodeDisplayLabel = 'CUIR';
  const barcodeLegend = 'Identificador único de orden médica / examen complementario';

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

  // Colors Settings (Matching AutaMedica premium identity)
  const headerBgColor: [number, number, number] = [15, 23, 42];        // #0f172a (Dark Slate)
  const headerAccentColor: [number, number, number] = [13, 148, 136];   // #0d9488 (Teal accent)
  const blockBgColor: [number, number, number] = [248, 250, 252];       // slate-50
  const labelTextColor: [number, number, number] = [100, 116, 139];     // slate-500
  const darkTextColor: [number, number, number] = [15, 23, 42];         // slate-900
  const mediumTextColor: [number, number, number] = [51, 65, 85];        // slate-700
  const infoTextColor: [number, number, number] = [71, 85, 105];         // slate-600

  // Header Background
  doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]);
  doc.rect(0, 0, pageWidth, 45, 'F');

  // Header Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('SOLICITUD DE ESTUDIO MÉDICO', marginLeft, 18);

  // Logo
  const logoDataUrl = await loadLogoDataUrl();
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginLeft + 115, 10, 9, 9);
  }

  // Header Subtitle & Metadata
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Exámenes Complementarios y Prácticas Diagnósticas', marginLeft, 26);
  doc.setTextColor(headerAccentColor[0], headerAccentColor[1], headerAccentColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`CUIR: ${cuir}`, marginLeft, 33);
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de Emisión: ${formatDate(input.issuedAt)}`, marginLeft, 39);

  // QR in header
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 50, 8, 30, 30);

  y = 55;
  doc.setTextColor(30, 41, 59);

  // Patient info Block
  const patientBlockHeight = input.patient.address || input.patient.insurancePlan ? 40 : 32;
  doc.setFillColor(blockBgColor[0], blockBgColor[1], blockBgColor[2]);
  doc.rect(marginLeft, y, contentWidth, patientBlockHeight, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text('DATOS DEL PACIENTE', marginLeft + 4, y + 6);
  
  doc.setFontSize(11);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
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
    doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
    doc.text(`Domicilio: ${input.patient.address}`, marginLeft + 4, y + 26);
    extraLine += 6;
  }
  if (input.patient.insurancePlan) {
    doc.setFontSize(8);
    doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
    doc.text(`OOSS / Plan: ${input.patient.insurancePlan}`, marginLeft + 4, y + 26 + extraLine);
  }
  y += patientBlockHeight + 8;

  // Exámenes Solicitados Block
  const studyTypeLabel = {
    laboratory: 'Laboratorio / Bioquímica',
    imaging: 'Imágenes / Radiología / Ecografía / Resonancia',
    cardiology: 'Prácticas Cardiológicas',
    other: 'Otras Prácticas Médicas Especiales',
  }[input.studyType];

  const practicesCount = input.practices.length;
  const medBlockHeight = Math.max(40, 20 + practicesCount * 6);
  doc.setFillColor(blockBgColor[0], blockBgColor[1], blockBgColor[2]);
  doc.rect(marginLeft, y, contentWidth, medBlockHeight, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text('ESTUDIOS / PRÁCTICAS SOLICITADAS', marginLeft + 4, y + 6);

  doc.setFontSize(10);
  doc.setTextColor(headerAccentColor[0], headerAccentColor[1], headerAccentColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(studyTypeLabel, marginLeft + 4, y + 13);

  // List of practices
  doc.setFontSize(9.5);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.setFont('helvetica', 'normal');
  input.practices.forEach((practice, index) => {
    doc.text(`•  ${practice.name}`, marginLeft + 6, y + 20 + index * 6, { maxWidth: contentWidth - 12 });
  });

  y += medBlockHeight + 8;

  // Diagnosis Block
  const diagnosisHeight = 16;
  doc.setFillColor(blockBgColor[0], blockBgColor[1], blockBgColor[2]);
  doc.rect(marginLeft, y, contentWidth, diagnosisHeight, 'F');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text('DIAGNÓSTICO PRESUNTIVO (CIE-10 / CLÍNICO)', marginLeft + 4, y + 5);
  
  doc.setFontSize(10);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(input.diagnosis || 'Control clínico / Sin diagnóstico específico', marginLeft + 4, y + 11, { maxWidth: contentWidth - 8 });
  y += diagnosisHeight + 8;

  // Notes / Indications Block
  if (input.notes) {
    const notesHeight = Math.max(16, 12 + Math.ceil(input.notes.length / 80) * 5);
    doc.setFillColor(blockBgColor[0], blockBgColor[1], blockBgColor[2]);
    doc.rect(marginLeft, y, contentWidth, notesHeight, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
    doc.text('INDICACIONES DE PREPARACIÓN / INSTRUCCIONES', marginLeft + 4, y + 5);

    doc.setFontSize(9);
    doc.setTextColor(mediumTextColor[0], mediumTextColor[1], mediumTextColor[2]);
    doc.setFont('helvetica', 'italic');
    doc.text(input.notes, marginLeft + 4, y + 11, { maxWidth: contentWidth - 8 });
    y += notesHeight + 8;
  }

  // Barcode Section
  const barcodeY = 192;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.rect(marginLeft, barcodeY, contentWidth, 16);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text(barcodeTitle, marginLeft + 4, barcodeY + 5);
  drawCode128Barcode(doc, barcodeValue, marginLeft + 48, barcodeY + 3, 78, 8);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text(`${barcodeDisplayLabel}: ${barcodeValue}`, marginLeft + 48, barcodeY + 14);
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text(barcodeLegend, marginLeft + 132, barcodeY + 9);

  // Prescriber Block
  y = 210; 
  const prescriberBlockHeight = 30;
  
  doc.setFillColor(blockBgColor[0], blockBgColor[1], blockBgColor[2]);
  doc.rect(marginLeft, y, contentWidth, prescriberBlockHeight, 'F');
  
  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text('PROFESIONAL SOLICITANTE', marginLeft + 4, y + 6);
  
  const doctorY = y + 13;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text(input.prescriber.name, marginLeft + 4, doctorY);
  doc.setFont('helvetica', 'normal');
  
  const detailsY = doctorY + 5;
  doc.setFontSize(9);
  const prescriberInfo = [
    input.prescriber.profession || 'Médico/a',
    input.prescriber.specialty ? `Esp: ${input.prescriber.specialty}` : null,
  ].filter(Boolean).join('  |  ');
  doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
  doc.text(prescriberInfo, marginLeft + 4, detailsY);

  const licenseY = detailsY + 5;
  doc.setFontSize(8);
  const licenseInfo = [
    `Matrícula: ${input.prescriber.license} (${input.prescriber.licenseJurisdiction || 'MN'})`,
    input.prescriber.refeps ? `REFEPS: ${input.prescriber.refeps}` : null,
    input.prescriber.licenseEntity ? `Entidad: ${input.prescriber.licenseEntity}` : null,
  ].filter(Boolean).join('  —  ');
  doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
  doc.text(licenseInfo, marginLeft + 4, licenseY);

  if (input.prescriber.professionalAddress) {
    doc.setFontSize(7);
    doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
    doc.text(`Domicilio profesional: ${input.prescriber.professionalAddress}`, marginLeft + 4, licenseY + 4);
  }

  // Signature Block
  const signatureY = 245;

  if (input.prescriber.signatureImageUrl) {
    try {
      const sigResponse = await fetch(input.prescriber.signatureImageUrl);
      const sigArrayBuf = await sigResponse.arrayBuffer();
      const sigBase64 = Buffer.from(sigArrayBuf).toString('base64');
      const sigFormat = input.prescriber.signatureImageUrl.includes('.webp') ? 'WEBP' : 'PNG';
      const sigDataUrl = `data:image/${sigFormat.toLowerCase()};base64,${sigBase64}`;
      doc.addImage(sigDataUrl, sigFormat, marginLeft, signatureY, 35, 20);
    } catch {
      doc.setFillColor(blockBgColor[0], blockBgColor[1], blockBgColor[2]);
      doc.rect(marginLeft, signatureY, 35, 20, 'F');
    }
  }

  if (input.prescriber.stampImageUrl) {
    try {
      const stampResponse = await fetch(input.prescriber.stampImageUrl);
      const stampArrayBuf = await stampResponse.arrayBuffer();
      const stampBase64 = Buffer.from(stampArrayBuf).toString('base64');
      const stampFormat = input.prescriber.stampImageUrl.includes('.webp') ? 'WEBP' : 'PNG';
      const stampDataUrl = `data:image/${stampFormat.toLowerCase()};base64,${stampBase64}`;
      doc.addImage(stampDataUrl, stampFormat, marginLeft + 40, signatureY, 35, 20);
    } catch {
      // Silently ignore stamp error
    }
  }

  // Digital Signature details box
  const infoBoxX = input.prescriber.stampImageUrl ? marginLeft + 80 : marginLeft + 40;
  const infoBoxWidth = pageWidth - 20 - infoBoxX;
  doc.setFillColor(blockBgColor[0], blockBgColor[1], blockBgColor[2]);
  doc.rect(infoBoxX, signatureY, infoBoxWidth, 25, 'F');
  
  doc.setDrawColor(15, 23, 42);
  doc.rect(infoBoxX, signatureY, infoBoxWidth, 25);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text('FIRMA ELECTRÓNICA', infoBoxX + 3, signatureY + 5);
  
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  const signatureLegend = doc.splitTextToSize(
    `Este documento de solicitud de estudios complementarios ha sido firmado -electrónica o digitalmente- por el Dr./Dra. ${input.prescriber.name}`,
    infoBoxWidth - 6,
  );
  doc.text(signatureLegend, infoBoxX + 3, signatureY + 10);
  const validatorY = signatureY + 10 + signatureLegend.length * 3.5;
  doc.text(`Validador RCTA: ${cuir}`, infoBoxX + 3, validatorY);
  doc.text(`Fecha de registro: ${formatDate(input.issuedAt)}`, infoBoxX + 3, validatorY + 4);
  doc.text(`Hash de verificación: Verificable vía código QR`, infoBoxX + 3, validatorY + 8);

  // Footers
  const footerY = 276;
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Esta orden médica de prácticas tiene validez de documento público electrónico según Ley 27.553.`,
    marginLeft, footerY
  );
  doc.text(
    `AutaMedica garantiza la confidencialidad y el cumplimiento estricto de la Ley 25.326 de Datos Personales.`,
    marginLeft, footerY + 4
  );

  const renapdisLegajo =
    getRuntimeEnvValue('RENAPDIS_RL_NUMBER') ??
    getServerEnvOrDefault('RENAPDIS_RL_NUMBER', OFFICIAL_RENAPDIS_RL_NUMBER) ?? OFFICIAL_RENAPDIS_RL_NUMBER;
  doc.text(
    'Esta orden fue emitida a través de un sistema de recetarios electrónicos aprobado y validado',
    marginLeft,
    footerY + 10,
  );
  doc.text(
    `por el Ministerio de Salud de la Nación - Legajo de Habilitación ${renapdisLegajo}.`,
    marginLeft,
    footerY + 14,
  );

  const pdfBuffer = new Uint8Array(doc.output('arraybuffer'));
  const pdfFilename = `orden-estudio-ar-${cuir}.pdf`;

  return { cuir, pdfBuffer, pdfFilename, qrDataUrl, qrContent };
}
