import { describe, expect, it } from 'vitest';
import { buildRepmMedicationRequest } from '../mappers/repm.mapper';
import type { RepmPrescricaoInput } from '../types/repm.types';

function baseRepmInput(): RepmPrescricaoInput {
  return {
    identificadorRegistroOrigem: 'AM-RCTA-123456',
    estabelecimentoCnes: '2207777',
    ine: '001',
    dataPrescricao: '2026-09-14T18:30:00Z',
    validadeDias: 10,
    individuo: { cns: '123456789012345', cpf: '98765432100' },
    prescritor: {
      cpf: '11122233344',
      conselhoTipo: 'CRM',
      conselhoUf: 'RS',
      conselhoNumero: '12345',
    },
    medicamento: {
      codigoObm: 'OBM-500',
      nomeGenerico: 'Amoxicilina',
      dosagem: '500mg',
      formaFarmaceutica: 'caps',
      quantidade: 21,
      unidade: 'caps',
    },
  };
}

describe('repm.mapper', () => {
  it('builds a MedicationRequest with OBM coding', () => {
    const request = buildRepmMedicationRequest(baseRepmInput()) as Record<string, unknown>;
    expect(request.resourceType).toBe('MedicationRequest');
    const medication = request.medication as { concept: { coding: Array<{ system: string; code: string }> } };
    expect(medication.concept.coding[0]).toMatchObject({ system: 'http://portal.saude.gov.br/obm', code: 'OBM-500' });
  });

  it('carries the source identifier and CNS subject', () => {
    const request = buildRepmMedicationRequest(baseRepmInput()) as Record<string, unknown>;
    expect((request.identifier as Array<{ value: string }>)[0].value).toBe('AM-RCTA-123456');
    expect((request.subject as { identifier: Array<{ system: string }> }).identifier[0].system).toContain('cns');
  });

  it('computes validity end from validityDias', () => {
    const request = buildRepmMedicationRequest(baseRepmInput()) as { dispenseRequest: { validityPeriod: { start: string; end: string } } };
    const end = new Date(request.dispenseRequest.validityPeriod.end).getTime();
    const start = new Date(request.dispenseRequest.validityPeriod.start).getTime();
    expect(end - start).toBe(10 * 86_400_000);
  });
});