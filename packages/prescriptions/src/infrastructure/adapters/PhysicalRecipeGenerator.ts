/**
 * Genera recetas en formato HTML imprimible (duplicado o triplicado) para
 * jurisdicciones que aún exigen recetario oficial físico para Lista II-IV.
 *
 * El output es HTML con estilos print-ready. El consumidor puede:
 *  - Mostrarlo en una vista /print y disparar window.print()
 *  - Convertirlo a PDF con un servicio externo (Puppeteer, Browserless)
 *  - Imprimirlo directamente al enviarlo al paciente
 */

import type { IssuedPrescription } from '../../domain/models';

export type PhysicalRecipeCopies = 'duplicate' | 'triplicate';

export interface PhysicalRecipeOutput {
  html: string;
  prescriptionId: string;
  copies: PhysicalRecipeCopies;
  jurisdiction: string;
}

const PHYSICAL_REQUIRED_PROVINCES: Record<string, PhysicalRecipeCopies> = {
  // Por defecto la mayoría de las jurisdicciones aceptan electrónica (Res. 2214/2025).
  // Mapeá aquí las que aún exigen físico para algún subset.
  catamarca: 'duplicate',
  formosa: 'duplicate',
};

export function requiresPhysicalRecipe(jurisdiction: string | undefined): PhysicalRecipeCopies | null {
  if (!jurisdiction) return null;
  const key = jurisdiction.trim().toLowerCase();
  return PHYSICAL_REQUIRED_PROVINCES[key] ?? null;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

function copyLabel(copy: number, total: PhysicalRecipeCopies): string {
  const labels = total === 'duplicate'
    ? ['ORIGINAL — Archivo Farmacia', 'DUPLICADO — Paciente']
    : ['ORIGINAL — Archivo Farmacia', 'DUPLICADO — Paciente', 'TRIPLICADO — Profesional'];
  return labels[copy - 1] ?? `COPIA ${copy}`;
}

function renderCopy(rx: IssuedPrescription, copyNum: number, copies: PhysicalRecipeCopies): string {
  const label = copyLabel(copyNum, copies);
  const issuedDate = new Date(rx.issuedAt).toLocaleDateString('es-AR');
  const expiresDate = new Date(rx.expiresAt).toLocaleDateString('es-AR');

  const items = rx.items.map((i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${escape(i.genericName)}</strong>${i.commercialName ? ` (${escape(i.commercialName)})` : ''}</td>
      <td>${escape(i.dosage)} · ${escape(i.presentation)}</td>
      <td>${i.quantity}</td>
      <td>${escape(i.instructions)}</td>
    </tr>
  `).join('');

  return `
    <section class="recipe">
      <header>
        <div class="copy-badge">${label}</div>
        <h1>RECETA ARCHIVADA — Lista II/IV</h1>
        <div class="meta">
          <span>CUIR: <strong>${escape(rx.cuir)}</strong></span>
          <span>Fecha: ${issuedDate}</span>
          <span>Vence: ${expiresDate}</span>
        </div>
      </header>

      <div class="parties">
        <div class="box">
          <h3>PROFESIONAL</h3>
          <p><strong>${escape(rx.prescriber.fullName)}</strong></p>
          <p>${escape(rx.prescriber.specialty ?? 'Médico/a')}</p>
          <p>${escape(rx.prescriber.matriculaType)} ${escape(rx.prescriber.matriculaNumber)}${rx.prescriber.matriculaProvince ? ' — ' + escape(rx.prescriber.matriculaProvince) : ''}</p>
        </div>
        <div class="box">
          <h3>PACIENTE</h3>
          <p><strong>${escape(rx.patient.fullName)}</strong></p>
          <p>DNI: ${escape(rx.patient.dni)}</p>
          <p>CUIL: ${escape(rx.patient.cuil)}</p>
          ${rx.patient.insuranceProvider ? `<p>OS: ${escape(rx.patient.insuranceProvider)} — ${escape(rx.patient.insuranceMemberNumber ?? '')}</p>` : ''}
        </div>
      </div>

      ${rx.diagnosisCie10 ? `<p class="dx"><strong>Diagnóstico (CIE-10):</strong> ${escape(rx.diagnosisCie10)}</p>` : ''}

      <table class="items">
        <thead>
          <tr><th>#</th><th>Medicamento</th><th>Presentación</th><th>Cantidad</th><th>Posología</th></tr>
        </thead>
        <tbody>${items}</tbody>
      </table>

      ${rx.notes ? `<p class="notes"><strong>Observaciones:</strong> ${escape(rx.notes)}</p>` : ''}

      <footer>
        <div class="sig">
          <div class="line"></div>
          <p>Firma y sello del profesional</p>
        </div>
        <div class="qr-slot">
          <p>QR de verificación:</p>
          <div class="qr" data-payload="${escape(rx.artifacts.qrCodeContent)}"></div>
          ${rx.artifacts.linkBuscadorNacional ? `<p class="url">${escape(rx.artifacts.linkBuscadorNacional)}</p>` : ''}
        </div>
      </footer>
    </section>
  `;
}

export function renderPhysicalRecipeHtml(
  rx: IssuedPrescription,
  jurisdiction: string,
  forced?: PhysicalRecipeCopies,
): PhysicalRecipeOutput | null {
  const copies = forced ?? requiresPhysicalRecipe(jurisdiction);
  if (!copies) return null;

  const count = copies === 'duplicate' ? 2 : 3;
  const sections = Array.from({ length: count }, (_, i) => renderCopy(rx, i + 1, copies)).join('\n');

  const html = `<!doctype html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  <title>Receta ${rx.cuir} — ${copies}</title>
  <style>
    @page { size: A5; margin: 10mm; }
    body { font-family: 'Arial', sans-serif; font-size: 10pt; color: #111; margin: 0; }
    .recipe { page-break-after: always; padding: 10mm; border: 1.5pt solid #111; }
    .recipe:last-child { page-break-after: auto; }
    .copy-badge { text-align: right; font-weight: bold; color: #b91c1c; font-size: 9pt; letter-spacing: 0.5pt; }
    h1 { margin: 4pt 0; font-size: 12pt; text-align: center; text-transform: uppercase; }
    .meta { display: flex; justify-content: space-between; font-size: 8.5pt; border-top: 0.5pt solid #666; border-bottom: 0.5pt solid #666; padding: 3pt 0; margin: 4pt 0; }
    .parties { display: flex; gap: 6pt; margin: 6pt 0; }
    .box { flex: 1; border: 0.5pt solid #666; padding: 4pt; }
    .box h3 { margin: 0 0 3pt 0; font-size: 8pt; letter-spacing: 0.5pt; }
    .box p { margin: 1pt 0; font-size: 9pt; }
    .dx { margin: 4pt 0; font-size: 9pt; }
    .items { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 8.5pt; }
    .items th, .items td { border: 0.5pt solid #666; padding: 3pt 4pt; text-align: left; vertical-align: top; }
    .items th { background: #f0f0f0; }
    .notes { margin: 4pt 0; font-size: 9pt; font-style: italic; }
    footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10pt; }
    .sig { text-align: center; width: 55%; }
    .sig .line { border-top: 0.5pt solid #111; margin-top: 20pt; }
    .sig p { margin: 2pt 0 0; font-size: 8pt; }
    .qr-slot { text-align: center; font-size: 8pt; }
    .qr-slot .qr { width: 25mm; height: 25mm; border: 0.5pt solid #666; margin: 2pt auto; background: #f9f9f9; }
    .qr-slot .url { word-break: break-all; font-size: 7pt; color: #666; max-width: 30mm; }
  </style>
</head>
<body>
${sections}
</body>
</html>`;

  return {
    html,
    prescriptionId: rx.id,
    copies,
    jurisdiction,
  };
}
