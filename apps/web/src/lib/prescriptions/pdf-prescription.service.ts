import { getServerEnvOrDefault } from '@autamedica/shared';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { getRuntimeEnvValue } from '@/lib/runtime-env';
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
    // The accepted Farmalink PAN and entity are separate from the patient CUIL.
    affiliateCredential?: string;
    insuranceEntityCode?: number;
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
  existingCuir?: string;
  /** Explicitly unsigned TEST PDF: no RCTA/CUIR claim, no QR and no clinical signing. */
  homologationTest?: boolean;
  homologationMode?: 'S' | 'N';
  externalPrescription?: {
    provider: 'farmalink' | string;
    number: string;
    barcodeTitle?: string;
    displayLabel?: string;
    legend?: string;
  };
  careGuide?: {
    tips?: string | null;
    forgotten?: string | null;
    warnings?: string | null;
    lifestyle?: string | null;
  };
  template?: 'neutral' | 'female' | 'empathetic';
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

type PdfImageFormat = 'PNG' | 'JPEG' | 'WEBP';

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

function sanitizePdfText(text?: string | null): string | undefined {
  if (text === undefined || text === null) return undefined;
  const normalized = text
    .replace(/[\u201c\u201d\u201e\u201f\u00ab\u00bb]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00a0/g, ' ');

  return normalized
    .split('')
    .filter((char) => char.charCodeAt(0) <= 255)
    .join('');
}

function detectImageFormat(buffer: ArrayBuffer, contentType: string): PdfImageFormat | null {
  const normalizedContentType = contentType.toLowerCase();
  if (normalizedContentType.includes('png')) return 'PNG';
  if (normalizedContentType.includes('jpeg') || normalizedContentType.includes('jpg')) return 'JPEG';
  if (normalizedContentType.includes('webp')) return 'WEBP';

  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'PNG';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'JPEG';
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'WEBP';
  }

  return null;
}

function mimeForPdfImageFormat(format: PdfImageFormat): string {
  if (format === 'JPEG') return 'image/jpeg';
  if (format === 'WEBP') return 'image/webp';
  return 'image/png';
}

async function loadLogoImage(): Promise<{ dataUrl: string; format: PdfImageFormat } | null> {
  const appUrl =
    getRuntimeEnvValue('PUBLIC_APP_URL') ??
    import.meta.env?.PUBLIC_APP_URL ??
    'https://www.autamedica.com';
  const logoUrl = new URL('/logo.png', appUrl).toString();

  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const format = detectImageFormat(buffer, response.headers.get('content-type') ?? '');
    if (!format) return null;

    const base64 = arrayBufferToBase64(buffer);
    return { dataUrl: `data:${mimeForPdfImageFormat(format)};base64,${base64}`, format };
  } catch {
    return null;
  }
}

function safeAddImage(
  doc: jsPDF,
  imageData: string,
  format: PdfImageFormat,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  try {
    doc.addImage(imageData, format, x, y, width, height);
    return true;
  } catch {
    return false;
  }
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

const OFFICIAL_RENAPDIS_RL_NUMBER = 'RL-2026-47574120-APN-SSVEIYES#MS';

function buildCode128BValues(value: string): number[] {
  const sanitized = value.replace(/[^\x20-\x7e]/g, '').slice(0, 48);
  const dataValues = Array.from(sanitized).map((char) => char.charCodeAt(0) - 32);
  const checksum = dataValues.reduce((sum, code, index) => sum + code * (index + 1), 104) % 103;
  return [104, ...dataValues, checksum, 106];
}

function drawQrCodeVector(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  size: number,
): void {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const numModules = qr.modules.size;
    const moduleSize = size / numModules;

    // Draw white background
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, size, size, 'F');

    // Draw black modules
    doc.setFillColor(0, 0, 0);
    const marginOffset = 0.005; // tiny overlap to prevent thin white lines in some PDF viewers
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
  } catch (error) {
    console.error('[drawQrCodeVector] Failed to generate QR code vector:', error);
    throw error;
  }
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
  originalInput: PrescriptionPdfInput,
): Promise<PrescriptionArtifacts> {
  const input: PrescriptionPdfInput = {
    ...originalInput,
    medication: {
      ...originalInput.medication,
      genericName: sanitizePdfText(originalInput.medication.genericName),
      commercialName: sanitizePdfText(originalInput.medication.commercialName),
      instructions: sanitizePdfText(originalInput.medication.instructions),
    },
    diagnosis: sanitizePdfText(originalInput.diagnosis),
    notes: sanitizePdfText(originalInput.notes),
    patient: {
      ...originalInput.patient,
      name: sanitizePdfText(originalInput.patient.name),
      insurancePlan: sanitizePdfText(originalInput.patient.insurancePlan),
      affiliateCredential: sanitizePdfText(originalInput.patient.affiliateCredential),
      address: sanitizePdfText(originalInput.patient.address),
    },
    prescriber: {
      ...originalInput.prescriber,
      name: sanitizePdfText(originalInput.prescriber.name),
      profession: sanitizePdfText(originalInput.prescriber.profession),
      specialty: sanitizePdfText(originalInput.prescriber.specialty),
      professionalAddress: sanitizePdfText(originalInput.prescriber.professionalAddress),
    },
    careGuide: originalInput.careGuide ? {
      tips: sanitizePdfText(originalInput.careGuide.tips),
      forgotten: sanitizePdfText(originalInput.careGuide.forgotten),
      warnings: sanitizePdfText(originalInput.careGuide.warnings),
      lifestyle: sanitizePdfText(originalInput.careGuide.lifestyle),
    } : undefined,
  };

  const isHomologationTest = input.homologationTest === true;
  if (isHomologationTest && input.homologationMode !== 'S' && input.homologationMode !== 'N') {
    throw new Error('farmalink_homologation_mode_required');
  }
  if (isHomologationTest && input.homologationMode === 'S' && input.medication.commercialName) {
    throw new Error('farmalink_generic_pdf_must_not_show_brand');
  }
  if (isHomologationTest && input.homologationMode === 'N' && !input.medication.commercialName) {
    throw new Error('farmalink_brand_pdf_requires_commercial_name');
  }
  if (isHomologationTest && !/^[0-9]+$/.test(input.externalPrescription?.number ?? '')) {
    throw new Error('farmalink_homologation_requires_confirmed_numeric_vendor_id');
  }
  const registration = isHomologationTest
    ? { cuir: 'NO ASIGNADO - TEST' }
    : input.existingCuir
    ? { cuir: input.existingCuir }
    : await rctaService.registerPrescription(
      input.prescriber.license,
      input.patient.dni || 'unknown',
      input.medication.genericName,
      {
        jurisdiction: input.prescriber.licenseJurisdiction ?? input.prescriber.license.split('-')[0],
        groupId: input.prescriptionId,
        expendioType: '02', // Bajo receta de medicamentos por defecto
      }
    );

  const cuir = registration.cuir;
  const qrContent = isHomologationTest ? '' : `https://www.autamedica.com/verify/${cuir}`;
  const expiresAt = input.expiresAt || calculateExpiry(input.issuedAt, input.medication.genericName);
  const barcodeValue = input.externalPrescription?.number || cuir;
  const barcodeTitle = input.externalPrescription?.barcodeTitle || 'CÓDIGO DE BARRAS';
  const barcodeDisplayLabel = input.externalPrescription?.displayLabel
    || (input.externalPrescription ? 'RECETA EXTERNA' : 'CUIR');
  const barcodeLegend = input.externalPrescription?.legend
    || (input.externalPrescription
      ? 'Número de receta para validación online en farmacia'
      : 'Identificador verificable de receta electrónica');

  // Generate QR (Bypassed toDataURL to prevent canvas Edge Worker crash - we draw natively with drawQrCodeVector)
  const qrDataUrl = '';

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginLeft = 20;
  const contentWidth = pageWidth - 40;
  let y = 20;

  // 1. Resolver el template estético de la receta
  const template = input.template ?? 'neutral';

  // Configuración de Paletas de Color según Template
  let headerBgColor: [number, number, number] = [15, 23, 42];        // #0f172a (Dark Slate)
  let headerAccentColor: [number, number, number] = [56, 189, 248];   // sky-400 (celeste)
  
  let careHeaderBgColor: [number, number, number] = [13, 148, 136];   // teal-600
  let careHeaderTextColor: [number, number, number] = [204, 251, 241]; // teal-100
  let careWelcomeTextColor: [number, number, number] = [13, 148, 136]; // teal-600
  
  let careBannerBgColor: [number, number, number] = [240, 253, 250];  // teal-50
  let careBannerTextColor: [number, number, number] = [15, 118, 110]; // teal-700
  let careBorderLeftColor: [number, number, number] = [13, 148, 136]; // teal-600

  // Colores de tarjetas generales
  let patientBgColor: [number, number, number] = [248, 250, 252];     // slate-50
  let borderColor: [number, number, number] = [241, 245, 249];        // slate-100
  let labelTextColor: [number, number, number] = [100, 116, 139];     // slate-500
  let darkTextColor: [number, number, number] = [15, 23, 42];         // slate-900
  let mediumTextColor: [number, number, number] = [51, 65, 85];        // slate-700
  let infoTextColor: [number, number, number] = [71, 85, 105];         // slate-600

  if (template === 'empathetic') {
    // Empático / Cercano: Tonos de azul médico y verde clínico cálido
    headerBgColor = [2, 132, 199];          // sky-700 (Azul cálido)
    headerAccentColor = [254, 243, 199];    // amber-100 para contraste
    
    careHeaderBgColor = [8, 145, 178];      // cyan-700
    careHeaderTextColor = [224, 242, 254];  // cyan-100
    careWelcomeTextColor = [8, 145, 178];   // cyan-700
    
    careBannerBgColor = [240, 253, 250];    // teal-50
    careBannerTextColor = [15, 118, 110];   // teal-700
    careBorderLeftColor = [8, 145, 178];    // cyan-700
  } else if (template === 'female') {
    // Cálido / Femenino: Verde azulado médico / Teal clínico premium (#0d9488) con toques rosa pastel sutiles
    headerBgColor = [13, 148, 136];         // #0d9488 (Teal clínico)
    headerAccentColor = [253, 242, 248];    // pink-50
    
    careHeaderBgColor = [13, 148, 136];     // #0d9488 (Teal clínico)
    careHeaderTextColor = [253, 242, 248];  // pink-50
    careWelcomeTextColor = [13, 148, 136];  // #0d9488
    
    careBannerBgColor = [253, 242, 248];    // pink-50
    careBannerTextColor = [157, 23, 77];    // pink-800
    careBorderLeftColor = [13, 148, 136];   // #0d9488

    // Tarjetas blancas refinadas con acentos rosa pastel suave
    patientBgColor = [255, 255, 255];       // Fondo blanco puro
    borderColor = [249, 168, 212];          // #f9a8d4 (Borde rosa pastel suave)
    labelTextColor = [13, 148, 136];        // Teal clínico
    darkTextColor = [15, 23, 42];           // Negro puro
    mediumTextColor = [13, 148, 136];       // Teal clínico para specs
    infoTextColor = [71, 85, 105];          // Slate-600
  }

  // Header (Dynamic Theme Background)
  doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]); 
  doc.rect(0, 0, pageWidth, 45, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RECETA MÉDICA ELECTRÓNICA', marginLeft, 18);

  const logoImage = await loadLogoImage();
  if (logoImage) {
    safeAddImage(doc, logoImage.dataUrl, logoImage.format, marginLeft + 115, 10, 9, 9);
  }

  if (!isHomologationTest) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Sistema Nacional de Trazabilidad de Actos (RCTA)', marginLeft, 26);
    doc.setTextColor(headerAccentColor[0], headerAccentColor[1], headerAccentColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`CUIR: ${cuir}`, marginLeft, 33);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.text(`Emitida: ${formatDate(input.issuedAt)}  |  Vence: ${formatDate(expiresAt)}`, marginLeft, 39);

  // QR in header (pharmacy verification)
  if (!isHomologationTest) drawQrCodeVector(doc, qrContent, pageWidth - 50, 8, 30);

  // Never print an internal generic-mode debug flag on a pharmacy-facing PDF.
  y = 55;
  doc.setTextColor(30, 41, 59);

  // Patient info (Compliance Block)
  const patientBlockHeight = input.patient.address || input.patient.insurancePlan || input.patient.affiliateCredential ? 40 : 32;
  doc.setFillColor(patientBgColor[0], patientBgColor[1], patientBgColor[2]); 
  doc.rect(marginLeft, y, contentWidth, patientBlockHeight, 'F');

  if (template === 'female') {
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.3);
    doc.rect(marginLeft, y, contentWidth, patientBlockHeight, 'S');
    // Franja vertical de acento a la izquierda (ancho 3mm)
    doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]); // Teal médico
    doc.rect(marginLeft, y, 3, patientBlockHeight, 'F');
  }

  const textOffset = template === 'female' ? 6 : 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text('DATOS DEL PACIENTE', marginLeft + textOffset, y + 6);
  
  doc.setFontSize(11);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text(input.patient.name, marginLeft + textOffset, y + 14);

  const patientSex = formatPatientSex(input.patient.sex);
  const patientMeta = [
    input.patient.dni ? `DNI: ${input.patient.dni}` : null,
    input.patient.cuil ? `CUIL: ${input.patient.cuil}` : null,
    patientSex ? `Sexo: ${patientSex}` : null,
    input.patient.dateOfBirth ? `Fecha de Nacimiento: ${formatDate(input.patient.dateOfBirth)}` : null,
  ].filter(Boolean).join('  |  ');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(patientMeta, marginLeft + textOffset, y + 20);
  
  let extraLine = 0;
  if (input.patient.address) {
    doc.setFontSize(8);
    doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
    doc.text(`Domicilio: ${input.patient.address}`, marginLeft + textOffset, y + 26);
    extraLine += 6;
  }
  if (input.patient.affiliateCredential) {
    // The PAN must match the confirmed altaReceta, not the CUIL or local insurance metadata.
    const affiliation = [
      input.patient.insuranceEntityCode ? `Entidad: ${input.patient.insuranceEntityCode}` : null,
      `Nro. afiliado / Credencial: ${input.patient.affiliateCredential}`,
      input.patient.insurancePlan ? `Plan: ${input.patient.insurancePlan}` : null,
    ].filter(Boolean).join('  |  ');
    doc.setFontSize(8);
    doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
    doc.text(affiliation, marginLeft + textOffset, y + 26 + extraLine, { maxWidth: contentWidth - 8 });
  } else if (input.patient.insurancePlan) {
    doc.setFontSize(8);
    doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
    doc.text(`OOSS / Plan: ${input.patient.insurancePlan}`, marginLeft + textOffset, y + 26 + extraLine);
  }
  y += patientBlockHeight + 8;

  // Medication (IFA Prominence - Critical for Compliance)
  const medBlockHeight = 48;
  doc.setFillColor(patientBgColor[0], patientBgColor[1], patientBgColor[2]); 
  doc.rect(marginLeft, y, contentWidth, medBlockHeight, 'F');

  if (template === 'female') {
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.3);
    doc.rect(marginLeft, y, contentWidth, medBlockHeight, 'S');
    // Franja vertical de acento a la izquierda (ancho 3mm)
    doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]); // Teal médico
    doc.rect(marginLeft, y, 3, medBlockHeight, 'F');
  }

  const medTextOffset = template === 'female' ? 6 : 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text('PRESCRIPCIÓN (IFA)', marginLeft + medTextOffset, y + 6);

  // Generic Name (IFA) - Large and prominent (20pt en template female)
  doc.setFontSize(template === 'female' ? 20 : 16);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(input.medication.genericName.toUpperCase(), marginLeft + medTextOffset, y + 16);

  if (input.medication.commercialName) {
    doc.setFontSize(10);
    doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
    doc.setFont('helvetica', 'normal');
    const commercialDisplayName = input.externalPrescription?.provider === 'farmalink'
      ? input.medication.commercialName
      : `Sugerido: ${input.medication.commercialName}`;
    doc.text(commercialDisplayName, marginLeft + medTextOffset, y + 23);
  }

  doc.setFontSize(10);
  doc.setTextColor(mediumTextColor[0], mediumTextColor[1], mediumTextColor[2]);
  doc.setFont('helvetica', 'bold');
  const medSpecs = [input.medication.dosage, input.medication.presentation]
    .filter(Boolean)
    .join(' — ');
  if (medSpecs) doc.text(medSpecs, marginLeft + medTextOffset, y + 30);
  doc.text(`Cantidad: ${input.medication.quantity} unidades`, marginLeft + medTextOffset, y + 36);

  if (input.medication.instructions) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(input.medication.instructions, marginLeft + medTextOffset, y + 42, {
      maxWidth: contentWidth - (template === 'female' ? 12 : 8),
    });
  }
  y += medBlockHeight + 8;

  // Diagnosis (IFA Prominence - Premium Medical Card)
  const diagnosisHeight = 16;
  doc.setFillColor(patientBgColor[0], patientBgColor[1], patientBgColor[2]); 
  doc.rect(marginLeft, y, contentWidth, diagnosisHeight, 'F');
  
  if (template === 'female') {
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.3);
    doc.rect(marginLeft, y, contentWidth, diagnosisHeight, 'S');
    // Franja vertical de acento a la izquierda (ancho 3mm)
    doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]); // Teal médico
    doc.rect(marginLeft, y, 3, diagnosisHeight, 'F');
  }

  const diagTextOffset = template === 'female' ? 6 : 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text('DIAGNÓSTICO / INDICACIONES', marginLeft + diagTextOffset, y + 5);
  
  doc.setFontSize(10);
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(input.diagnosis || 'Criterio clínico', marginLeft + diagTextOffset, y + 11, { maxWidth: contentWidth - (template === 'female' ? 12 : 8) });
  y += diagnosisHeight + 8;

  // Notes
  if (input.notes) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
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
  
  if (template === 'female') {
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.3);
    doc.rect(marginLeft, barcodeY, contentWidth, 16, 'S');
    // Franja vertical de acento a la izquierda (ancho 3mm)
    doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]); // Teal médico
    doc.rect(marginLeft, barcodeY, 3, 16, 'F');
  } else {
    doc.setDrawColor(226, 232, 240);
    doc.rect(marginLeft, barcodeY, contentWidth, 16);
  }

  const barcodeOffset = template === 'female' ? 6 : 4;
  const submittedCuil = input.externalPrescription?.provider === 'farmalink'
    ? input.patient.cuil?.replace(/\D/g, '')
    : undefined;
  if (input.externalPrescription?.provider === 'farmalink' && submittedCuil?.length === 11) {
    // MSAL requires distinct scannable Code128 codes for Farmalink receipt ID and patient CUIL.
    const leftX = marginLeft + barcodeOffset;
    const rightX = marginLeft + 91;
    doc.setFontSize(6.3);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
    doc.text('RECETA FARMALINK', leftX, barcodeY + 3.8);
    doc.text('CUIL PACIENTE', rightX, barcodeY + 3.8);
    drawCode128Barcode(doc, barcodeValue, leftX + 2, barcodeY + 5.2, 69, 6.5);
    drawCode128Barcode(doc, submittedCuil, rightX + 2, barcodeY + 5.2, 69, 6.5);
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
    doc.text(`${barcodeDisplayLabel}: ${barcodeValue}`, leftX + 2, barcodeY + 14.4);
    doc.text(`CUIL: ${submittedCuil}`, rightX + 2, barcodeY + 14.4);
  } else {
    // Other countries and providers retain their pre-existing single-barcode PDF layout.
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
    doc.text(barcodeTitle, marginLeft + barcodeOffset, barcodeY + 5);
    drawCode128Barcode(doc, barcodeValue, marginLeft + 48, barcodeY + 3, 78, 8);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
    doc.text(`${barcodeDisplayLabel}: ${barcodeValue}`, marginLeft + 48, barcodeY + 14);
    doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
    doc.text(barcodeLegend, marginLeft + 132, barcodeY + 9);
  }
  // Prescriber (Regulatory Info Block - Premium Medical Card)
  y = 210; // Fixed position for footer block
  const prescriberBlockHeight = 30;
  
  doc.setFillColor(patientBgColor[0], patientBgColor[1], patientBgColor[2]);
  doc.rect(marginLeft, y, contentWidth, prescriberBlockHeight, 'F');
  
  if (template === 'female') {
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.3);
    doc.rect(marginLeft, y, contentWidth, prescriberBlockHeight, 'S');
    // Franja vertical de acento a la izquierda (ancho 3mm)
    doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]); // Teal médico
    doc.rect(marginLeft, y, 3, prescriberBlockHeight, 'F');
  } else {
    doc.setDrawColor(226, 232, 240);
    doc.line(marginLeft, y, marginLeft + contentWidth, y);
  }
  
  const presTextOffset = template === 'female' ? 6 : 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(labelTextColor[0], labelTextColor[1], labelTextColor[2]);
  doc.text('PROFESIONAL PRESCRIPTOR', marginLeft + presTextOffset, y + 6);
  
  const doctorY = y + 13;
  if (template === 'female') {
    doc.setFont('times', 'bolditalic');
    doc.setFontSize(14); // Más dibujada, elegante y distinguida
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
  }
  doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
  doc.text(input.prescriber.name, marginLeft + presTextOffset, doctorY);
  doc.setFont('helvetica', 'normal'); // Restaurar tipografía default
  
  const detailsY = doctorY + 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const prescriberInfo = [
    input.prescriber.profession || 'Médico/a',
    input.prescriber.specialty ? `Esp: ${input.prescriber.specialty}` : null,
  ].filter(Boolean).join('  |  ');
  doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
  doc.text(prescriberInfo, marginLeft + presTextOffset, detailsY);

  const licenseY = detailsY + 5;
  doc.setFontSize(8);
  const licenseInfo = [
    `Matrícula: ${input.prescriber.license} (${input.prescriber.licenseJurisdiction || 'MN'})`,
    input.prescriber.refeps ? `REFEPS: ${input.prescriber.refeps}` : null,
    input.prescriber.licenseEntity ? `Entidad: ${input.prescriber.licenseEntity}` : null,
  ].filter(Boolean).join('  —  ');
  doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
  doc.text(licenseInfo, marginLeft + presTextOffset, licenseY);

  if (input.prescriber.professionalAddress) {
    doc.setFontSize(7);
    doc.setTextColor(infoTextColor[0], infoTextColor[1], infoTextColor[2]);
    doc.text(`Domicilio profesional: ${input.prescriber.professionalAddress}`, marginLeft + presTextOffset, licenseY + 4);
  }

  // Firma Digital
  const signatureY = 245;

  if (!isHomologationTest && input.prescriber.signatureImageUrl) {
    // Stamp visual signature image
    try {
      const sigResponse = await fetch(input.prescriber.signatureImageUrl);
      const sigArrayBuf = await sigResponse.arrayBuffer();
      const sigBase64 = arrayBufferToBase64(sigArrayBuf);
      const sigFormat = input.prescriber.signatureImageUrl.includes('.webp') ? 'WEBP' : 'PNG';
      const sigDataUrl = `data:image/${sigFormat.toLowerCase()};base64,${sigBase64}`;
      doc.addImage(sigDataUrl, sigFormat, marginLeft, signatureY, 35, 20);
    } catch {
      // Fallback: draw placeholder if image fetch fails
      doc.setFillColor(patientBgColor[0], patientBgColor[1], patientBgColor[2]);
      doc.rect(marginLeft, signatureY, 35, 20, 'F');
    }
  }

  if (!isHomologationTest && input.prescriber.stampImageUrl) {
    // Stamp professional seal image
    try {
      const stampResponse = await fetch(input.prescriber.stampImageUrl);
      const stampArrayBuf = await stampResponse.arrayBuffer();
      const stampBase64 = arrayBufferToBase64(stampArrayBuf);
      const stampFormat = input.prescriber.stampImageUrl.includes('.webp') ? 'WEBP' : 'PNG';
      const stampDataUrl = `data:image/${stampFormat.toLowerCase()};base64,${stampBase64}`;
      doc.addImage(stampDataUrl, stampFormat, marginLeft + 40, signatureY, 35, 20);
    } catch {
      // Silently skip stamp if fetch fails
    }
  }

  // The homologation PDF reserves the production signature area but leaves it empty.
  // Demo data has no professional signature or CUIR: never synthesize either one.
  const infoBoxX = input.prescriber.stampImageUrl ? marginLeft + 80 : marginLeft + 40;
  const infoBoxWidth = pageWidth - 20 - infoBoxX;
  doc.setFillColor(patientBgColor[0], patientBgColor[1], patientBgColor[2]);
  doc.rect(infoBoxX, signatureY, infoBoxWidth, 25, 'F');
  if (template === 'female') {
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.3);
    doc.rect(infoBoxX, signatureY, infoBoxWidth, 25, 'S');
    doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]);
    doc.rect(infoBoxX, signatureY, 2.5, 25, 'F');
  } else {
    doc.setDrawColor(15, 23, 42);
    doc.rect(infoBoxX, signatureY, infoBoxWidth, 25);
  }

  if (!isHomologationTest) {
    const sigInfoOffset = template === 'female' ? 5 : 3;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
    doc.text('VERIFICACIÓN DE FIRMA', infoBoxX + sigInfoOffset, signatureY + 5);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    const signatureLegend = doc.splitTextToSize(
      'Verificar la firma en el certificado PDF o registro del emisor.',
      infoBoxWidth - 6,
    );
    doc.text(signatureLegend, infoBoxX + 3, signatureY + 10);
    const validatorY = signatureY + 10 + signatureLegend.length * 3.5;
    doc.text(`Validador RCTA: ${cuir}`, infoBoxX + 3, validatorY);
    doc.text(`Fecha de registro: ${formatDate(input.issuedAt)}`, infoBoxX + 3, validatorY + 4);
    doc.text('Hash: verificable vía QR', infoBoxX + 3, validatorY + 8);
  }

  // Footer (Compliance & Privacy)
  const footerY = 276;
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  if (isHomologationTest) {
    // Keep the official ReNaPDiS statement without a test/debug banner.
    // The homologation document has no CUIR, QR or signature in its reserved areas.
    const testRenapdisLegajo =
      getRuntimeEnvValue('RENAPDIS_RL_NUMBER') ??
      getServerEnvOrDefault('RENAPDIS_RL_NUMBER', OFFICIAL_RENAPDIS_RL_NUMBER) ?? OFFICIAL_RENAPDIS_RL_NUMBER;
    doc.text('Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos', marginLeft, footerY + 6);
    doc.text(`del Ministerio de Salud de la Nación - ${testRenapdisLegajo}.`, marginLeft, footerY + 10);
  } else {
  doc.text(
    `Esta prescripción tiene validez de documento público electrónico según Ley 27.553.`,
    marginLeft, footerY
  );
  doc.text(
    `AutaMedica garantiza el cumplimiento de la Ley 25.326 de Protección de Datos Personales.`,
    marginLeft, footerY + 4
  );

  const renapdisLegajo =
    getRuntimeEnvValue('RENAPDIS_RL_NUMBER') ??
    getServerEnvOrDefault('RENAPDIS_RL_NUMBER', OFFICIAL_RENAPDIS_RL_NUMBER) ?? OFFICIAL_RENAPDIS_RL_NUMBER;
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

  }
  // ==========================================
  // PÁGINA 2: GUÍA DE ACOMPAÑAMIENTO AL PACIENTE
  // ==========================================
  
  if (!isHomologationTest) {
  const careTips = input.careGuide?.tips || 
    `Hola ${input.patient.name}, recordá tomar este medicamento respetando los intervalos de horas indicados por tu médico. Acompañalo con un vaso de agua y consultá las indicaciones de alimentación.`;
  const careForgotten = input.careGuide?.forgotten || 
    'Si omitís una dosis, tomala apenas lo recuerdes, a menos que ya falte poco para la siguiente toma. En ese caso, salteá la dosis olvidada. ¡Nunca tomes una dosis doble para compensar!';
  const careWarnings = input.careGuide?.warnings || 
    'Prestá atención a cómo responde tu cuerpo. Si presentás sarpullido severo, dificultad al respirar o inflamación, suspendé el tratamiento de inmediato y acudí a urgencias.';
  const careLifestyle = input.careGuide?.lifestyle || 
    `Para acompañar tu tratamiento ${input.diagnosis ? `de ${input.diagnosis}` : ''}, te sugerimos priorizar el descanso, mantener una excelente hidratación y llevar una alimentación liviana.`;

  // Agregamos una nueva página
  doc.addPage();

  // Cabecera premium con color de fondo dinámico según el template
  doc.setFillColor(careHeaderBgColor[0], careHeaderBgColor[1], careHeaderBgColor[2]);
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('GUÍA DE ACOMPAÑAMIENTO AL PACIENTE', marginLeft, 16);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(careHeaderTextColor[0], careHeaderTextColor[1], careHeaderTextColor[2]);
  doc.text('Diseñada con precisión médica y soporte inteligente para ayudarte a cumplir tu tratamiento de forma segura.', marginLeft, 24);
  doc.text(`Paciente: ${input.patient.name}  |  Medicamento: ${input.medication.genericName}`, marginLeft, 30);

  // QR para escaneo rápido
  drawQrCodeVector(doc, qrContent, pageWidth - 45, 6, 28);

  let py = 50;

  // Tarjeta de Fármaco e Información General con colores dinámicos
  const bannerHeight = input.diagnosis ? 28 : 22;
  doc.setFillColor(careBannerBgColor[0], careBannerBgColor[1], careBannerBgColor[2]);
  doc.rect(marginLeft, py, contentWidth, bannerHeight, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(careBannerTextColor[0], careBannerTextColor[1], careBannerTextColor[2]);
  doc.text(`${input.medication.genericName} ${input.medication.dosage}`, marginLeft + 6, py + 8);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Esquema prescrito: ${input.medication.instructions}`, marginLeft + 6, py + 14);
  if (input.diagnosis) {
    doc.text(`Diagnóstico asociado: ${input.diagnosis}`, marginLeft + 6, py + 20);
  }

  py += input.diagnosis ? 36 : 30;

  // Función helper para dibujar cada bloque de cuidado (sin emojis para evitar problemas de codificación)
  const drawCareBlock = (
    title: string,
    content: string,
    bgColor: [number, number, number],
    borderColor: [number, number, number],
    textColor: [number, number, number]
  ) => {
    doc.setFillColor(...bgColor);
    doc.rect(marginLeft, py, contentWidth, 28, 'F');
    
    // Si el borde de acento izquierdo no es por defecto, usamos el color dinámico de acento del template
    const borderAccent = borderColor === careBorderLeftColor ? careBorderLeftColor : borderColor;
    doc.setDrawColor(borderAccent[0], borderAccent[1], borderAccent[2]);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, py, marginLeft, py + 28); // Línea lateral de acento

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textColor);
    doc.text(title, marginLeft + 6, py + 6);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85); // slate-700
    const lines = doc.splitTextToSize(content, contentWidth - 12);
    doc.text(lines, marginLeft + 6, py + 12);

    py += 34;
  };

  // Bloque 1: Consejos de toma (Usa acento dinámico)
  drawCareBlock(
    'CÓMO TOMAR TU MEDICACIÓN',
    careTips,
    [248, 250, 252], // slate-50
    careBorderLeftColor, // Usa acento dinámico de color
    [15, 23, 42]     // slate-900
  );

  // Bloque 2: Qué hacer ante olvidos
  drawCareBlock(
    'QUÉ HACER SI TE OLVIDÁS DE UNA TOMA',
    careForgotten,
    [254, 243, 199], // amber-100
    [251, 191, 36],  // amber-400
    [180, 83, 9]     // amber-700
  );

  // Bloque 3: Efectos esperados y alertas
  drawCareBlock(
    'SÍNTOMAS COMUNES Y ALERTAS DE URGENCIA',
    careWarnings,
    [254, 242, 242], // red-50
    [248, 113, 113], // red-400
    [185, 28, 28]    // red-700
  );

  // Bloque 4: Recomendaciones y bienestar (Usa acento dinámico)
  drawCareBlock(
    'BIENESTAR Y RECOMENDACIONES CLÍNICAS',
    careLifestyle,
    [240, 253, 244], // green-50
    careBorderLeftColor, // Usa acento dinámico de color
    [21, 128, 61]    // green-700
  );

  // Mensaje final cálido del equipo médico
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(careWelcomeTextColor[0], careWelcomeTextColor[1], careWelcomeTextColor[2]);
  doc.text('Tu médico de cabecera y el equipo de AutaMedica te desean una pronta y excelente recuperación.', marginLeft, py + 4);

  }
  const pdfBuffer = new Uint8Array(doc.output('arraybuffer'));
  const pdfFilename = isHomologationTest
    ? `farmalink-test-${input.externalPrescription?.number}.pdf`
    : `receta-ar-${cuir}.pdf`;

  return { cuir, pdfBuffer, pdfFilename, qrDataUrl, qrContent };
}
