import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { generatePrescriptionPdf } from './pdf-prescription.service';
import { rctaService } from './rcta.service';

describe('Farmalink PDF affiliate reconciliation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints the exact PAN submitted to Farmalink, not the patient CUIL', async () => {
    const textSpy = vi.spyOn(jsPDF.prototype, 'text');
    vi.spyOn(rctaService, 'registerPrescription').mockResolvedValueOnce({
      cuir: '02680042020102000000000000000000000010104',
      evidenceHash: 'test-evidence-hash',
      registrationId: 'test-registration',
      timestamp: '2026-11-03T12:00:00.000Z',
    });
    const output = await generatePrescriptionPdf({
      prescriptionId: 'rx-homologation-test',
      issuedAt: '2026-11-03',
      diagnosis: 'Fixture TEST',
      externalPrescription: { provider: 'farmalink', number: '9600000421228' },
      medication: {
        genericName: 'GLICOLICOAC.ASOC.',
        dosage: 'Uso de prueba',
        presentation: 'Crema x 20 g',
        quantity: 1,
        instructions: 'Fixture TEST',
      },
      patient: {
        name: 'Demo Demo',
        dni: '12345678',
        cuil: '27-12345678-0',
        affiliateCredential: '20123456786',
        insuranceEntityCode: 7110,
        insurancePlan: '100',
      },
      prescriber: { name: 'Demo Demo', license: 'MN 11111' },
    });
    const renderedText = textSpy.mock.calls
      .map(([value]) => Array.isArray(value) ? value.map(String).join(' ') : String(value))
      .join('\n');
    expect(Buffer.from(output.pdfBuffer).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(renderedText).toContain('Nro. afiliado / Credencial: 20123456786');
    expect(renderedText).toContain('Plan: No Posee');
    expect(renderedText).toContain('Entidad: 7110');
    expect(renderedText).toContain('CUIL: 27123456780');
    expect(renderedText).toContain('CUIL PACIENTE');
    expect(renderedText).toContain('RECETA FARMALINK');
    expect(renderedText).toContain('RECETA EXTERNA: 9600000421228');
    expect(renderedText).not.toContain('FARMALINK TEST / MODALIDAD GENERICO=');
  });

  it('keeps ReNaPDiS legend but removes technical generic-mode label in unsigned TEST', async () => {
    const textSpy = vi.spyOn(jsPDF.prototype, 'text');
    const output = await generatePrescriptionPdf({
      prescriptionId: 'rx-homologation-test',
      issuedAt: '2026-11-03',
      diagnosis: 'Fixture TEST',
      homologationTest: true,
      homologationMode: 'S',
      externalPrescription: { provider: 'farmalink', number: '9600000421228' },
      medication: {
        genericName: 'GLICOLICOAC.ASOC.', dosage: 'Uso de prueba',
        presentation: 'Crema x 20 g', quantity: 1, instructions: 'Fixture TEST',
      },
      patient: { name: 'Demo Demo', dni: '12345678', cuil: '27123456780',
        affiliateCredential: '20123456786', insuranceEntityCode: 7110, insurancePlan: '100' },
      prescriber: { name: 'Demo Demo', license: 'MN 11111' },
    });
    const renderedText = textSpy.mock.calls
      .map(([value]) => Array.isArray(value) ? value.map(String).join(' ') : String(value))
      .join('\n');
    expect(Buffer.from(output.pdfBuffer).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(renderedText).toContain('RL-2026-47574120-APN-SSVEIYES#MS');
    expect(renderedText).toContain('Nro. afiliado / Credencial: 20123456786');
    expect(renderedText).toContain('CUIL PACIENTE');
    expect(renderedText).not.toContain('MODALIDAD GENERICO=');
    expect(output.cuir).toBe('');
    expect(output.qrContent).toBe('');
  });
});
