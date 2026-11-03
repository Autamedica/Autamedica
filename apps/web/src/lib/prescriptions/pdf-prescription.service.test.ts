import { writeFileSync } from 'node:fs';
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
      cuir: '02680042020102000000000000000000000010101',
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

    expect(artifacts.cuir).toBe('02680042020102000000000000000000000010101');
    expect(artifacts.qrContent).toBe('https://www.autamedica.com/verify/02680042020102000000000000000000000010101');
    expect(pdfText).toContain('CÓDIGO DE BARRAS');
    expect(pdfText).toContain('VERIFICACIÓN DE FIRMA');
    expect(pdfText).not.toContain('Este documento ha sido firmado');
    expect(pdfText).toContain('500mg');
    expect(pdfText).toContain('Comprimidos');
    expect(pdfText).toContain('Fecha de registro: 11/05/2026');
    expect(pdfText).toContain('Identificador verificable de receta electrónica');
    expect(pdfText).toContain(
      'Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos',
    );
    expect(pdfText).toContain('RL-2026-47574120-APN-SSVEIYES#MS');
    expect(pdfText).not.toMatch(/no sustituci[oó]n/i);
    expect(pdfText).toContain('02680042020102000000000000000000000010101');
  });

  it('reads RENAPDIS legajo from the Cloudflare runtime env cache', async () => {
    primeRuntimeEnv({ RENAPDIS_RL_NUMBER: 'RL-RUNTIME-RENAPDIS-123' });
    vi.spyOn(rctaService, 'registerPrescription').mockResolvedValueOnce({
      cuir: '02680042020102000000000000000000000010102',
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
      existingCuir: '02680042020102000000000000000000000010103',
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
    expect(artifacts.cuir).toBe('02680042020102000000000000000000000010103');
    expect(artifacts.qrContent).toBe('https://www.autamedica.com/verify/02680042020102000000000000000000000010103');
    expect(pdfText).toContain('CÓDIGO DE BARRAS');
    expect(pdfText).toContain('02680042020102000000000000000000000010103');
  });

  it('renders the Farmalink prescription number in the barcode when supplied', async () => {
    const registerSpy = vi.spyOn(rctaService, 'registerPrescription').mockResolvedValueOnce({
      cuir: '02680042020102000000000000000000000010104',
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
    expect(artifacts.cuir).toBe('02680042020102000000000000000000000010104');
    expect(pdfText).toContain('CUIR: 02680042020102000000000000000000000010104');
    expect(pdfText).toContain('RECETA FARMALINK: 9600000002762');
    writeFileSync('/tmp/autamedica-farmalink-barcode.pdf', new Uint8Array(artifacts.pdfBuffer));
    expect(pdfText).toContain('Número de receta para validación online en farmacia');
  });

  it('generates pdf correctly for female and empathetic aesthetic templates', async () => {
    vi.spyOn(rctaService, 'registerPrescription').mockResolvedValue({
      cuir: '02680042020102000000000000000000000010105',
      evidenceHash: 'test-evidence-hash',
      registrationId: 'rcta_idx_test',
      timestamp: '2026-05-22T12:00:00.000Z',
    });

    const commonInput = {
      prescriptionId: 'rx-template-test',
      diagnosis: 'Control',
      issuedAt: '2026-05-22',
      medication: {
        genericName: 'Amoxicilina',
        dosage: '500mg',
        instructions: 'Tomar segun indicacion medica',
        presentation: 'Comprimidos',
        quantity: 16,
      },
      patient: {
        dni: '30123456',
        name: 'Maria Gonzalez',
      },
      prescriber: {
        license: 'MN-123456',
        name: 'Dr. Eduardo Marques da Rosa',
      },
    };

    const artifactsFemale = await generatePrescriptionPdf({
      ...commonInput,
      template: 'female',
    });

    const artifactsEmpathetic = await generatePrescriptionPdf({
      ...commonInput,
      template: 'empathetic',
    });

    expect(artifactsFemale.cuir).toBe('02680042020102000000000000000000000010105');
    expect(artifactsEmpathetic.cuir).toBe('02680042020102000000000000000000000010105');

    const pdfTextFemale = Buffer.from(artifactsFemale.pdfBuffer).toString('latin1');
    const pdfTextEmpathetic = Buffer.from(artifactsEmpathetic.pdfBuffer).toString('latin1');

    expect(pdfTextFemale).toContain('RECETA MÉDICA ELECTRÓNICA');
    expect(pdfTextEmpathetic).toContain('RECETA MÉDICA ELECTRÓNICA');
  });
});

