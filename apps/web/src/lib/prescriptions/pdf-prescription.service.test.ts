import { describe, expect, it, vi } from 'vitest';
import { generatePrescriptionPdf } from './pdf-prescription.service';
import { rctaService } from './rcta.service';

describe('generatePrescriptionPdf', () => {
  it('renders a visible barcode block tied to the CUIR', async () => {
    vi.spyOn(rctaService, 'registerPrescription').mockResolvedValueOnce({
      cuir: 'AR-20260511-C0EEE620',
      evidenceHash: 'test-evidence-hash',
      registrationId: 'rcta_idx_test',
      timestamp: '2026-05-11T12:00:00.000Z',
    });

    const artifacts = await generatePrescriptionPdf({
      prescriptionId: 'rx-test',
      diagnosis: 'Cefalea tensional',
      issuedAt: '2026-05-11',
      medication: {
        genericName: 'Paracetamol',
        commercialName: 'Tafirol',
        dosage: '500mg',
        instructions: 'Tomar 1 comprimido cada 8 horas',
        presentation: 'Comprimidos',
        quantity: 16,
      },
      patient: {
        address: 'Av. Corrientes 1234, CABA',
        cuil: '27301234568',
        dateOfBirth: '1990-06-14',
        dni: '30123456',
        insurancePlan: 'OSDE 210',
        name: 'Maria Gonzalez',
        sex: 'Femenino',
      },
      prescriber: {
        license: 'MN-123456',
        licenseEntity: 'Ministerio de Salud',
        licenseJurisdiction: 'MN',
        name: 'Dr. Eduardo Marques da Rosa',
        professionalAddress: 'Av. Santa Fe 1500, CABA',
        refeps: 'REF-78901',
        specialty: 'Clinica Medica',
      },
    });

    const pdfText = Buffer.from(artifacts.pdfBuffer).toString('latin1');

    expect(artifacts.cuir).toBe('AR-20260511-C0EEE620');
    expect(artifacts.qrContent).toBe('https://www.autamedica.com/verify/AR-20260511-C0EEE620');
    expect(pdfText).toContain('CÓDIGO DE BARRAS');
    expect(pdfText).toContain('500mg');
    expect(pdfText).toContain('Comprimidos');
    expect(pdfText).toContain('Fecha de registro: 11/05/2026');
    expect(pdfText).toContain('Identificador verificable de receta electrónica');
    expect(pdfText).toContain(
      'Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos',
    );
    expect(pdfText).toContain('RL-2026-47574120-APN-SSVEIYES#MS');
    expect(pdfText).not.toMatch(/no sustituci[oó]n/i);
    expect(pdfText).toContain('AR-20260511-C0EEE620');
  });
});
