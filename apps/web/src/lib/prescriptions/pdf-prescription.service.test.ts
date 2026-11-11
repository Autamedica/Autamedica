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
  it('renders both actual AutaMedica PDFs for previously approved TEST numbers without issuing/registering again', async () => {
    const rctaSpy = vi.spyOn(rctaService, 'registerPrescription');
    for (const scenario of [
      { mode: 'S' as const, number: '9600000421228', commercialName: undefined, filename: 'generica' },
      { mode: 'N' as const, number: '9600000421242', commercialName: 'ESFUMEL blanqueadora cr. x 20 g', filename: 'marca' },
    ]) {
      const artifacts = await generatePrescriptionPdf({
        prescriptionId: `farmalink-homologation-${scenario.mode}-${scenario.number}`,
        homologationTest: true,
        homologationMode: scenario.mode,
        externalPrescription: {
          provider: 'farmalink',
          number: scenario.number,
          barcodeTitle: 'RECETA FARMALINK',
          displayLabel: 'RECETA FARMALINK',
          legend: 'Número de receta para validación en farmacia',
        },
        issuedAt: '2026-11-03',
        expiresAt: '2026-11-19',
        patient: {
          name: 'Demo Demo', dni: '12345678', cuil: '27123456780',
          dateOfBirth: '2025-01-01', sex: 'Masculino',
          insurancePlan: '100',
          affiliateCredential: '20123456786',
          insuranceEntityCode: 7110,
        },
        prescriber: {
          name: 'Demo Demo',
          license: 'MN 11111', licenseJurisdiction: 'MN',
          specialty: 'Medico clinico',
          professionalAddress: 'Consultorio particular CALLE 11 Nro 2300',
        },
        diagnosis: 'I20.9',
        medication: {
          genericName: 'GLICOLICOAC.ASOC.',
          commercialName: scenario.commercialName,
          dosage: '',
          presentation: 'Crema x 20 g',
          quantity: 1,
          instructions: '',
        },
      });
      expect(artifacts.cuir).toBe('');
      expect(artifacts.qrContent).toBe('');
      const pdfText = Buffer.from(artifacts.pdfBuffer).toString('latin1');
      expect(pdfText).toContain('GLICOLICOAC.ASOC.');
      expect(pdfText).toContain(scenario.number);
      expect(pdfText).toContain('Nro. afiliado / Credencial: 20123456786');
      expect(pdfText).toContain('Entidad: 7110');
      expect(pdfText).toContain('Plan: NO POSEE');
      expect(pdfText).toContain('CUIL PACIENTE');
      expect(pdfText).toContain(`RECETA FARMALINK: ${scenario.number}`);
      expect(pdfText).toContain('Sistema Nacional de Trazabilidad de Actos (RCTA)');
      expect(pdfText).not.toContain('AUTAMEDICA - FARMALINK TEST');
      expect(pdfText).not.toContain('NO APTA PARA DISPENSA');
      expect(pdfText).not.toContain('SOLO TEST: sin firma, CUIR o QR');
      expect(pdfText).toContain('RL-2026-47574120-APN-SSVEIYES#MS');
      expect(pdfText).toContain('Esta prescripción tiene validez de documento público electrónico según Ley 27.553.');
      expect(pdfText).not.toContain('MODALIDAD GENERICO=');
      expect(pdfText).not.toContain('Sugerido:');
      expect(pdfText).toContain('CUIR: -');
      expect(pdfText).toContain('VERIFICACIÓN DE FIRMA');
      expect(pdfText).toContain('Verificar la firma en el certificado PDF o registro del emisor.');


      expect(pdfText).not.toContain('AUTAMEDICA - FARMALINK TEST');
      expect(pdfText).not.toContain('NO APTA PARA DISPENSA');
      expect(pdfText).not.toContain('SOLO TEST: sin firma, CUIR o QR');
      expect(pdfText).not.toContain('PREDNISOLONA');
      expect(pdfText).not.toContain('Validador RCTA');
      if (scenario.mode === 'S') expect(pdfText).not.toContain('ESFUMEL');
      else expect(pdfText).toContain('ESFUMEL');
      writeFileSync(`/tmp/farmalink-autamedica-${scenario.filename}-test.pdf`,
        new Uint8Array(artifacts.pdfBuffer));
    }
    expect(rctaSpy).not.toHaveBeenCalled();
  });

  it('preserves a supplied CUIR and QR in Farmalink homologation without registering a new one', async () => {
    const existingCuir = '02680042020102000000000000000000000010106';
    const registerSpy = vi.spyOn(rctaService, 'registerPrescription');
    const artifacts = await generatePrescriptionPdf({
      prescriptionId: 'farmalink-homologation-existing-cuir',
      homologationTest: true,
      homologationMode: 'S',
      existingCuir,
      externalPrescription: {
        provider: 'farmalink',
        number: '9600000421228',
        displayLabel: 'RECETA FARMALINK',
        legend: 'Número de receta para validación en farmacia',
      },
      issuedAt: '2026-11-03',
      diagnosis: 'I20.9',
      medication: {
        genericName: 'GLICOLICOAC.ASOC.',
        dosage: '',
        instructions: '',
        presentation: 'Crema x 20 g',
        quantity: 1,
      },
      patient: {
        name: 'Demo Demo',
        dni: '12345678',
        cuil: '27123456780',
        affiliateCredential: '20123456786',
        insuranceEntityCode: 7110,
        insurancePlan: '100',
      },
      prescriber: {
        name: 'Demo Demo',
        license: 'MN 11111',
      },
    });

    const pdfText = Buffer.from(artifacts.pdfBuffer).toString('latin1');
    expect(registerSpy).not.toHaveBeenCalled();
    expect(artifacts.cuir).toBe(existingCuir);
    expect(artifacts.qrContent).toBe(`https://www.autamedica.com/verify/${existingCuir}`);
    expect(pdfText).toContain(`CUIR: ${existingCuir}`);
    expect(pdfText).toContain(`Validador RCTA: ${existingCuir}`);
    expect(pdfText).not.toContain('Sin registro RCTA ni QR verificado');
  });

});

