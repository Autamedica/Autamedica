import { afterEach, describe, expect, it, vi } from 'vitest';
import { primeRuntimeEnv, resetRuntimeEnvCache } from '@/lib/runtime-env';
import { generatePrescriptionPdf } from './pdf-prescription.service';
import { rctaService } from './rcta.service';

describe('generatePrescriptionPdf', () => {
  afterEach(() => {
    resetRuntimeEnvCache();
    vi.restoreAllMocks();
  });

  it('renders a visible barcode block tied to the CUIR', async () => {
    primeRuntimeEnv({ RENAPDIS_RL_NUMBER: 'RL-2026-47574120-APN-SSVEIYES#MS' });
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

  it('reads RENAPDIS legajo from the Cloudflare runtime env cache', async () => {
    primeRuntimeEnv({ RENAPDIS_RL_NUMBER: 'RL-RUNTIME-RENAPDIS-123' });
    vi.spyOn(rctaService, 'registerPrescription').mockResolvedValueOnce({
      cuir: 'AR-20260511-RENAPDIS',
      evidenceHash: 'test-evidence-hash',
      registrationId: 'rcta_idx_test',
      timestamp: '2026-05-11T12:00:00.000Z',
    });

    const artifacts = await generatePrescriptionPdf({
      prescriptionId: 'rx-renapdis',
      diagnosis: 'Control',
      issuedAt: '2026-05-11',
      medication: {
        genericName: 'Ibuprofeno',
        commercialName: 'Actron',
        dosage: '400mg',
        instructions: 'Tomar segun indicacion medica',
        presentation: 'Comprimidos',
        quantity: 10,
      },
      patient: {
        address: 'Av. Corrientes 1234, CABA',
        cuil: '27301234568',
        dateOfBirth: '1990-06-14',
        dni: '30123456',
        name: 'Maria Gonzalez',
        sex: 'Femenino',
      },
      prescriber: {
        license: 'MN-123456',
        licenseEntity: 'Ministerio de Salud',
        licenseJurisdiction: 'MN',
        name: 'Dr. Eduardo Marques da Rosa',
      },
    });

    const pdfText = Buffer.from(artifacts.pdfBuffer).toString('latin1');

    expect(pdfText).toContain('RL-RUNTIME-RENAPDIS-123');
  });

  it('can regenerate an already issued prescription without registering a new CUIR', async () => {
    const registerSpy = vi.spyOn(rctaService, 'registerPrescription');

    const artifacts = await generatePrescriptionPdf({
      prescriptionId: 'rx-existing',
      diagnosis: 'Control',
      issuedAt: '2026-05-11',
      existingCuir: 'AM-3A40CA048B7E',
      medication: {
        genericName: 'Metilfenidato',
        dosage: '10mg',
        instructions: 'Tomar segun indicacion medica',
        presentation: 'Comprimidos',
        quantity: 30,
      },
      patient: {
        address: 'Av. Corrientes 1234, CABA',
        dni: '30123456',
        name: 'Maria Gonzalez',
      },
      prescriber: {
        license: 'MN-123456',
        name: 'Dr. Eduardo Marques da Rosa',
        professionalAddress: 'Av. Santa Fe 1500, CABA',
        refeps: 'REF-78901',
      },
    });

    const pdfText = Buffer.from(artifacts.pdfBuffer).toString('latin1');

    expect(registerSpy).not.toHaveBeenCalled();
    expect(artifacts.cuir).toBe('AM-3A40CA048B7E');
    expect(artifacts.qrContent).toBe('https://www.autamedica.com/verify/AM-3A40CA048B7E');
    expect(pdfText).toContain('CÓDIGO DE BARRAS');
    expect(pdfText).toContain('AM-3A40CA048B7E');
  });

  it('renders the Farmalink prescription number in the barcode when supplied', async () => {
    const registerSpy = vi.spyOn(rctaService, 'registerPrescription').mockResolvedValueOnce({
      cuir: 'AR-20260518-FARMALINK',
      evidenceHash: 'test-evidence-hash',
      registrationId: 'rcta_idx_test',
      timestamp: '2026-05-18T12:00:00.000Z',
    });

    const artifacts = await generatePrescriptionPdf({
      prescriptionId: 'rx-farmalink',
      diagnosis: 'Control',
      issuedAt: '2026-05-18',
      externalPrescription: {
        provider: 'farmalink',
        number: '9600000002762',
        displayLabel: 'RECETA FARMALINK',
        legend: 'Número de receta para validación online en farmacia',
      },
      medication: {
        genericName: 'Amoxicilina',
        dosage: '500mg',
        instructions: 'Tomar segun indicacion medica',
        presentation: 'Comprimidos',
        quantity: 16,
      },
      patient: {
        address: 'Av. Corrientes 1234, CABA',
        dni: '30123456',
        name: 'Maria Gonzalez',
      },
      prescriber: {
        license: 'MN-123456',
        name: 'Dr. Eduardo Marques da Rosa',
        professionalAddress: 'Av. Santa Fe 1500, CABA',
        refeps: 'REF-78901',
      },
    });

    const pdfText = Buffer.from(artifacts.pdfBuffer).toString('latin1');

    expect(registerSpy).toHaveBeenCalledOnce();
    expect(artifacts.cuir).toBe('AR-20260518-FARMALINK');
    expect(pdfText).toContain('CUIR: AR-20260518-FARMALINK');
    expect(pdfText).toContain('RECETA FARMALINK: 9600000002762');
    expect(pdfText).toContain('Número de receta para validación online en farmacia');
  });
});
