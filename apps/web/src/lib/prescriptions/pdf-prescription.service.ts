/**
 * Service: PDF generation for prescriptions.
 * Generates a professional prescription PDF with QR code verification.
 * Uses jsPDF (edge-compatible) + qrcode for QR generation.
 */
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { createHash } from 'node:crypto';

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
  };
  issuedAt: string;
  expiresAt: string;
}

export interface PrescriptionArtifacts {
  cuir: string;
  pdfBuffer: Uint8Array;
  pdfFilename: string;
  qrDataUrl: string;
  qrContent: string;
}

function generateCuir(prescriptionId: string, issuedAt: string): string {
  const hash = createHash('sha256')
    .update(`${prescriptionId}:${issuedAt}`)
    .digest('hex')
    .substring(0, 12)
    .toUpperCase();
  return `AM-${hash}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export async function generatePrescriptionPdf(
  input: PrescriptionPdfInput,
): Promise<PrescriptionArtifacts> {
  const cuir = generateCuir(input.prescriptionId, input.issuedAt);
  const qrContent = `https://www.autamedica.com/verify/${cuir}`;

  // Generate QR as data URL
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

  // Header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 45, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RECETA MÉDICA', marginLeft, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('AutaMedica — Plataforma de Telemedicina', marginLeft, 26);
  doc.text(`CUIR: ${cuir}`, marginLeft, 33);
  doc.text(`Emitida: ${formatDate(input.issuedAt)}  |  Vence: ${formatDate(input.expiresAt)}`, marginLeft, 39);

  // QR in header
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 50, 8, 30, 30);

  y = 55;
  doc.setTextColor(30, 41, 59); // slate-800

  // Patient info (Res. 2214/2025: DNI, CUIL, fecha nac., sexo, domicilio)
  const patientBlockHeight = input.patient.address ? 28 : 22;
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(marginLeft, y, contentWidth, patientBlockHeight, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('PACIENTE', marginLeft + 4, y + 5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(input.patient.name, marginLeft + 4, y + 13);

  const patientMeta: string[] = [];
  if (input.patient.dni) patientMeta.push(`DNI: ${input.patient.dni}`);
  if (input.patient.cuil) patientMeta.push(`CUIL: ${input.patient.cuil}`);
  if (input.patient.dateOfBirth) patientMeta.push(`Nac: ${formatDate(input.patient.dateOfBirth)}`);
  if (input.patient.sex) patientMeta.push(`Sexo: ${input.patient.sex}`);
  if (patientMeta.length > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(patientMeta.join('  |  '), marginLeft + 4, y + 18);
  }
  if (input.patient.address) {
    doc.setFontSize(7);
    doc.text(`Domicilio: ${input.patient.address}`, marginLeft + 4, y + 23);
  }
  y += patientBlockHeight + 5;

  // Medication
  doc.setFillColor(219, 234, 254); // blue-100
  doc.rect(marginLeft, y, contentWidth, 40, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175); // blue-800
  doc.text('MEDICAMENTO', marginLeft + 4, y + 5);

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(input.medication.genericName, marginLeft + 4, y + 14);

  if (input.medication.commercialName) {
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`(${input.medication.commercialName})`, marginLeft + 4, y + 21);
  }

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  const medDetails = `${input.medication.dosage} — ${input.medication.presentation} — ${input.medication.quantity} unidades`;
  doc.text(medDetails, marginLeft + 4, y + 29);

  doc.setFontSize(9);
  doc.text(input.medication.instructions, marginLeft + 4, y + 36, { maxWidth: contentWidth - 8 });
  y += 48;

  // Diagnosis
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('DIAGNÓSTICO', marginLeft, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(input.diagnosis, marginLeft, y, { maxWidth: contentWidth });
  y += 10;

  // Notes
  if (input.notes) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('OBSERVACIONES', marginLeft, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(input.notes, marginLeft, y, { maxWidth: contentWidth });
    y += 15;
  }

  // Prescriber
  y += 5;
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('PRESCRIPTOR', marginLeft, y);
  y += 6;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(input.prescriber.name, marginLeft, y);
  y += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);

  // Res. 2214/2025: profesión, matrícula, jurisdicción, REFEPS, domicilio profesional
  const prescriberLine1 = [
    input.prescriber.profession ?? 'Médico/a',
    `Matrícula: ${input.prescriber.license}`,
    input.prescriber.licenseJurisdiction ? `(${input.prescriber.licenseJurisdiction})` : null,
  ].filter(Boolean).join('  |  ');
  doc.text(prescriberLine1, marginLeft, y);
  y += 4;

  const prescriberLine2 = [
    input.prescriber.specialty ? `Especialidad: ${input.prescriber.specialty}` : null,
    input.prescriber.refeps ? `REFEPS: ${input.prescriber.refeps}` : null,
    input.prescriber.licenseEntity ? `Entidad: ${input.prescriber.licenseEntity}` : null,
  ].filter(Boolean).join('  |  ');
  if (prescriberLine2) {
    doc.setFontSize(8);
    doc.text(prescriberLine2, marginLeft, y);
    y += 4;
  }

  if (input.prescriber.professionalAddress) {
    doc.setFontSize(7);
    doc.text(`Domicilio profesional: ${input.prescriber.professionalAddress}`, marginLeft, y);
    y += 4;
  }

  // Firma electrónica
  y += 3;
  doc.setFillColor(241, 245, 249);
  doc.rect(marginLeft, y, 70, 18, 'F');
  doc.setDrawColor(100, 116, 139);
  doc.rect(marginLeft, y, 70, 18);
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);
  doc.text('Firmado electrónicamente', marginLeft + 4, y + 6);
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`${input.prescriber.name}`, marginLeft + 4, y + 11);
  doc.text(`CUIR: ${cuir}`, marginLeft + 4, y + 15);

  // Footer
  const footerY = 280;
  doc.setDrawColor(203, 213, 225);
  doc.line(marginLeft, footerY - 5, marginLeft + contentWidth, footerY - 5);
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Prescripción electrónica emitida por AutaMedica. CUIR: ${cuir}. Verificar en: ${qrContent}`,
    marginLeft, footerY,
  );
  doc.text(
    'Ley 27.553 — Recetas electrónicas/digitales. Res. 2214/2025 — Estructura mínima de prescripción electrónica.',
    marginLeft, footerY + 4,
  );

  const pdfBuffer = new Uint8Array(doc.output('arraybuffer'));
  const pdfFilename = `receta-${cuir}.pdf`;

  return { cuir, pdfBuffer, pdfFilename, qrDataUrl, qrContent };
}
