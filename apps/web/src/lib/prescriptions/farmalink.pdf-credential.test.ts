import { describe, expect, it, vi } from 'vitest';
import { generatePrescriptionPdf } from './pdf-prescription.service';
import { rctaService } from './rcta.service';

describe('Farmalink PDF affiliate reconciliation', () => {
  it('prints the exact PAN submitted to Farmalink, not the patient CUIL', async () => {
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
    const pdf = Buffer.from(output.pdfBuffer).toString('latin1');
    expect(pdf).toContain('Nro. afiliado / Credencial: 20123456786');
    expect(pdf).toContain('Plan: NO POSEE');
    expect(pdf).toContain('Entidad: 7110');
    expect(pdf).toContain('Plan: 100');
    expect(pdf).toContain('CUIL: 27123456780');
    expect(pdf).toContain('CUIL PACIENTE');
    expect(pdf).toContain('RECETA FARMALINK');
    expect(pdf).toContain('RECETA EXTERNA: 9600000421228');
    expect(pdf).not.toContain('FARMALINK TEST / MODALIDAD GENERICO=');
    vi.restoreAllMocks();
  });

  it('keeps ReNaPDiS legend but removes technical generic-mode label in unsigned TEST', async () => {
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
        affiliateCredential: '20123456786', insuranceEntityCode: 7110, insurancePlan: 'NO POSEE' },
      prescriber: { name: 'Demo Demo', license: 'MN 11111' },
    });
    const pdf = Buffer.from(output.pdfBuffer).toString('latin1');
    expect(pdf).toContain('RL-2026-47574120-APN-SSVEIYES#MS');
    expect(pdf).toContain('Nro. afiliado / Credencial: 20123456786');
    expect(pdf).toContain('CUIL PACIENTE');
    expect(pdf).not.toContain('MODALIDAD GENERICO=');
    expect(output.cuir).toContain('NO ASIGNADO - TEST');
    expect(output.qrContent).toBe('');
  });
});
