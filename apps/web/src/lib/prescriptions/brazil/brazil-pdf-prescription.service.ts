import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { BrazilPrescriptionInput } from './types';

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

    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, size, size, 'F');

    doc.setFillColor(0, 0, 0);
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
  } catch (error) {
    console.error('[drawQrCodeVector] Error:', error);
  }
}

function formatDateBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function generateBrazilPrescriptionPdf(input: BrazilPrescriptionInput): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 15;
  const contentWidth = pageWidth - 30;

  // Header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  
  const title = input.model === 'controle_especial' 
    ? 'RECEITUÁRIO DE CONTROLE ESPECIAL' 
    : input.model === 'antimicrobiano'
      ? 'RECEITA DE ANTIMICROBIANOS'
      : 'RECEITA MÉDICA DIGITAL';
      
  doc.text(title, marginLeft, 16);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Em conformidade com a Resolução CFM nº 2.299/2021 e nº 2.314/2022', marginLeft, 23);
  doc.text(`Emitida em: ${formatDateBr(input.issuedAt)}  |  Validade até: ${formatDateBr(input.expiresAt)}`, marginLeft, 30);
  doc.text(`ID: ${input.prescriptionId}`, marginLeft, 36);

  const qrUrl = input.itiValidationUrl || 'https://validar.iti.gov.br';
  drawQrCodeVector(doc, qrUrl, pageWidth - 45, 6, 30);

  let y = 50;

  // Paciente
  doc.setFillColor(248, 250, 252);
  doc.rect(marginLeft, y, contentWidth, 24, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(marginLeft, y, contentWidth, 24, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('DADOS DO PACIENTE', marginLeft + 4, y + 6);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(input.patient.name, marginLeft + 4, y + 13);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`CPF: ${input.patient.cpf} ${input.patient.cns ? ` | CNS: ${input.patient.cns}` : ''}`, marginLeft + 4, y + 19);

  y += 30;

  // Medicamentos
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('PRESCRIÇÃO TERAPÊUTICA', marginLeft, y);
  y += 6;

  input.medications.forEach((med, idx) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginLeft, y, contentWidth, 28, 'S');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${idx + 1}. ${med.genericName.toUpperCase()} ${med.dosage}`, marginLeft + 4, y + 7);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    if (med.commercialName) {
      doc.text(`(Nome Comercial: ${med.commercialName})`, marginLeft + 4, y + 12);
    }
    doc.text(`Qtd: ${med.quantity} ${med.presentation}`, marginLeft + 4, y + 17);

    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Posologia: ${med.instructions}`, marginLeft + 4, y + 23, { maxWidth: contentWidth - 8 });

    y += 32;
  });

  // Prescritor e Firma
  const footerY = 225;
  doc.setFillColor(248, 250, 252);
  doc.rect(marginLeft, footerY, contentWidth, 32, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(marginLeft, footerY, contentWidth, 32, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('MÉDICO PRESCRITOR (ICP-BRASIL)', marginLeft + 4, footerY + 6);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(input.prescriber.name, marginLeft + 4, footerY + 13);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`CRM/${input.prescriber.uf}: ${input.prescriber.crm} ${input.prescriber.rqe ? ` | RQE: ${input.prescriber.rqe}` : ''}`, marginLeft + 4, footerY + 19);
  doc.text(`CPF: ${input.prescriber.cpf}`, marginLeft + 4, footerY + 25);

  // Legal Disclaimer
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Documento assinado digitalmente com certificado ICP-Brasil nos termos da MP 2.200-2/2001 e Resolução CFM nº 2.299/2021.',
    marginLeft,
    268,
  );
  doc.text(
    'Para validação da autenticidade da assinatura digital e dispensação em farmácia, consulte https://validar.iti.gov.br.',
    marginLeft,
    273,
  );

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
