import { afterEach, describe, expect, it } from 'vitest';
import { primeRuntimeEnv, resetRuntimeEnvCache } from '@/lib/runtime-env';
import { buildFarmalinkAltaRecetaRequest } from './farmalink.mapper';
import { __testables } from './issue-prescription.service';

const doctor = {
  id: 'doctor-1',
  license_number: '123456',
  specialty: 'Clinica Medica',
  refeps_id: '54122333444',
  enrollment_entity: 'MN',
  enrollment_jurisdiction: 'C',
  professional_address: 'Av. Santa Fe 1500, CABA',
};

const patient = {
  dni: '30123456',
  cuil: '27-30123456-8',
  address: 'Av. Corrientes 1234, CABA',
  birth_date: '1990-06-14',
  gender: 'female',
  insurance_info: null,
};

const item = {
  generic_name: 'AMOXICILINA',
  commercial_name: 'Amoxidal',
  dosage: '500 MG',
  presentation: 'Comprimidos',
  quantity: 1,
  instructions: 'Tomar segun indicacion medica',
};

describe('issuePrescription Farmalink wiring', () => {
  afterEach(() => {
    resetRuntimeEnvCache();
  });

  it('builds a homologation AltaReceta payload from runtime env and prescription data', () => {
    primeRuntimeEnv({
      FARMALINK_ORG_ID: '182',
      FARMALINK_IP_ORIGIN: '8.8.8.8',
      FARMALINK_PUNTO_EMISOR_ID: '10000',
      FARMALINK_HOMOLOGATION_COD_ENTIDAD: '7110',
      FARMALINK_HOMOLOGATION_CREDENCIAL: '20123456786',
      FARMALINK_HOMOLOGATION_PLAN: 'NO POSEE',
      FARMALINK_PRESCRIBER_BIRTH_DATE: '1980-01-01',
      FARMALINK_PRESCRIBER_DOCUMENT_NUMBER: '22333444',
      FARMALINK_DEFAULT_PRODUCT_CODE: '123',
      FARMALINK_DEFAULT_DRUG_CODE: '1',
    });

    const mapInput = __testables.buildFarmalinkPrescriptionMapInput({
      clinicalData: { diagnosis: 'Cefalea' },
      doctor,
      doctorName: 'Dr. Eduardo Marques',
      item,
      patient,
      patientName: 'Maria Gonzalez',
      now: '2026-05-18T12:00:00.000Z',
      expiresAt: '2026-06-17T12:00:00.000Z',
    });
    const request = buildFarmalinkAltaRecetaRequest(mapInput);

    expect(request.altaRecetaElectRq.infoCabeceraRq).toEqual({
      idOrganizacion: '182',
      tipoOrganizacion: 'NMD',
      ipOrigen: '8.8.8.8',
      infoBrowser: 'AutaMedica',
    });
    expect(Object.prototype.hasOwnProperty.call(request.altaRecetaElectRq, 'puntoEmisor')).toBe(false);
    expect(request.altaRecetaElectRq.recElectronica.afiliado.credencial).toEqual({
      codEntidad: 7110,
      pan: '20123456786',
      plan: 'NO POSEE',
    });
    expect(request.altaRecetaElectRq.recElectronica.detalleRecElectronica.item[0])
      .toMatchObject({
        codProducto: '00123',
        codDroga: '00001',
        textoGenerico: 'AMOXICILINA 500 MG Comprimidos',
      });
  });

  it('lets clinical Farmalink metadata override generic env defaults', () => {
    primeRuntimeEnv({
      FARMALINK_ORG_ID: '182',
      FARMALINK_IP_ORIGIN: '8.8.8.8',
      FARMALINK_HOMOLOGATION_COD_ENTIDAD: '7110',
      FARMALINK_HOMOLOGATION_CREDENCIAL: '20123456786',
      FARMALINK_PRESCRIBER_BIRTH_DATE: '1980-01-01',
      FARMALINK_PRESCRIBER_DOCUMENT_NUMBER: '22333444',
      FARMALINK_DEFAULT_PRODUCT_CODE: '123',
      FARMALINK_DEFAULT_DRUG_CODE: '1',
    });

    const mapInput = __testables.buildFarmalinkPrescriptionMapInput({
      clinicalData: {
        diagnosis: 'Control',
        farmalink: {
          // An old client-provided organization must not override the vendor-assigned ID.
          organization: { id: '100' },
          credential: { codEntidad: 7110, pan: '87654321', plan: 'TEST' },
          item: { productCode: '999', drugCode: '888', genericText: 'IBUPROFENO 400 MG' },
        },
      },
      doctor,
      doctorName: 'Dr. Eduardo Marques',
      item,
      patient,
      patientName: 'Maria Gonzalez',
      now: '2026-05-18T12:00:00.000Z',
      expiresAt: '2026-06-17T12:00:00.000Z',
    });
    const request = buildFarmalinkAltaRecetaRequest(mapInput);

    expect(request.altaRecetaElectRq.infoCabeceraRq.idOrganizacion).toBe('182');
    expect(request.altaRecetaElectRq.recElectronica.afiliado.credencial.pan).toBe('87654321');
    expect(request.altaRecetaElectRq.recElectronica.afiliado.credencial.plan).toBe('TEST');
    expect(request.altaRecetaElectRq.recElectronica.detalleRecElectronica.item[0])
      .toMatchObject({
        codProducto: '00999',
        codDroga: '00888',
        textoGenerico: 'IBUPROFENO 400 MG',
      });
  });
});

describe('Farmalink branded PDF contract', () => {
  it('blocks brand mode N if there is no real commercial name to display', () => {
    expect(() => __testables.buildFarmalinkPrescriptionMapInput({
      clinicalData: { diagnosis: 'TEST' },
      doctor,
      doctorName: 'Dr. Test Prescriber',
      item: { ...item, commercial_name: undefined, farmalink: { generic: false } },
      patient,
      patientName: 'Test Patient',
      now: '2026-11-03T12:00:00.000Z',
      expiresAt: '2026-11-19T12:00:00.000Z',
    })).toThrow('items.0.commercialName');
  });

  it('preserves explicitly selected generic S even when a brand is available', () => {
    const mapped = __testables.buildFarmalinkPrescriptionMapInput({
      clinicalData: { diagnosis: 'TEST' },
      doctor,
      doctorName: 'Dr. Test Prescriber',
      item: { ...item, farmalink: { generic: true } },
      patient,
      patientName: 'Test Patient',
      now: '2026-11-03T12:00:00.000Z',
      expiresAt: '2026-11-19T12:00:00.000Z',
    });
    expect(mapped.items[0]?.generic).toBe(true);
  });
});

describe('issuePrescription prescriber validation gate', () => {
  it('allows nationally validated and explicitly exempt prescribers', () => {
    expect(__testables.canIssueWithPrescriberValidationStatus('valid')).toBe(true);
    expect(__testables.canIssueWithPrescriberValidationStatus('exempt')).toBe(true);
  });

  it('blocks issuance while the prescriber validation is unresolved', () => {
    expect(__testables.canIssueWithPrescriberValidationStatus('pending')).toBe(false);
    expect(__testables.canIssueWithPrescriberValidationStatus('pending_review')).toBe(false);
    expect(__testables.canIssueWithPrescriberValidationStatus('rejected')).toBe(false);
    expect(__testables.canIssueWithPrescriberValidationStatus(null)).toBe(false);
  });
});
