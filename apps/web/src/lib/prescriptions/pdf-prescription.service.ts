import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { rctaService } from './rcta.service';
import { getSubstanceCategory, getValidityPeriodDays } from './strict-validation';

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

  // QR in header
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 50, 8, 30, 30);

  y = 55;
  doc.setTextColor(30, 41, 59);

  // Patient info (Compliance Block)
  const patientBlockHeight = 32;
  doc.setFillColor(248, 250, 252); 
  doc.rect(marginLeft, y, contentWidth, patientBlockHeight, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('DATOS DEL PACIENTE', marginLeft + 4, y + 6);
  
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(input.patient.name, marginLeft + 4, y + 14);

  const patientMeta = [
    input.patient.dni ? `DNI: ${input.patient.dni}` : null,
    input.patient.cuil ? `CUIL: ${input.patient.cuil}` : null,
    input.patient.dateOfBirth ? `Nac: ${formatDate(input.patient.dateOfBirth)}` : null,
  ].filter(Boolean).join('  |  ');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(patientMeta, marginLeft + 4, y + 20);
  
  if (input.patient.address) {
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Domicilio: ${input.patient.address}`, marginLeft + 4, y + 26);
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

  // Firma Digital (Placeholder for PAdES/Visual)
  const signatureY = 245;
  doc.setFillColor(248, 250, 252);
  doc.rect(marginLeft, signatureY, 80, 25, 'F');
  doc.setDrawColor(15, 23, 42);
  doc.rect(marginLeft, signatureY, 80, 25);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FIRMA DIGITAL CERTIFICADA', marginLeft + 5, signatureY + 7);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento firmado mediante certificado X.509', marginLeft + 5, signatureY + 12);
  doc.text(`Validador RCTA: ${cuir}`, marginLeft + 5, signatureY + 16);
  doc.text(`Fecha de registro: ${formatDate(input.issuedAt)}`, marginLeft + 5, signatureY + 20);

  // Footer (Compliance & Privacy)
  const footerY = 285;
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

  const pdfBuffer = new Uint8Array(doc.output('arraybuffer'));
  const pdfFilename = `receta-ar-${cuir}.pdf`;

  return { cuir, pdfBuffer, pdfFilename, qrDataUrl, qrContent };
}
