import { describe, expect, it } from 'vitest';
import { buildRedfmMedicationDispense, buildRedfmEstorno } from '../mappers/redfm.mapper';
import type { RedfmDispensacaoInput, RedfmEstornoInput } from '../types/redfm.types';
import type { RepmProfissional } from '../types/repm.types';

const farmaceutico: RepmProfissional = {
  cpf: '99988877766',
  conselhoTipo: 'CRF',
  conselhoUf: 'RS',
  conselhoNumero: '54321',
};

function baseRedfmInput(): RedfmDispensacaoInput {
  return {
    identificadorRegistroOrigem: 'disp-001',
    identificadorPrescricaoRnds: 'presc-rnds-001',
    identificadorPrescricaoOrigem: 'AM-RCTA-123456',
    estabelecimentoCnes: '2207777',
    dataDispensacao: '2026-09-15T10:00:00Z',
    individuo: { cns: '123456789012345', cpf: '98765432100' },
    farmaceutico,
    medicamento: { codigoObm: 'OBM-500', nomeGenerico: 'Amoxicilina', quantidade: 21, unidade: 'caps' },
    situacao: 'completo',
    tipoDispensacao: 'total',
  };
}

describe('redfm.mapper', () => {
  it('builds a completed MedicationDispense with OBM and identifiers', () => {
    const dispense = buildRedfmMedicationDispense(baseRedfmInput()) as Record<string, unknown>;
    expect(dispense.resourceType).toBe('MedicationDispense');
    expect(dispense.status).toBe('completed');
    expect((dispense.identifier as Array<{ value: string }>)).toContainEqual(
      { system: 'http://autamedica.com/rnds/prescricao_origem', value: 'AM-RCTA-123456' },
    );
  });

  it('references the RNDS prescription when available', () => {
    const dispense = buildRedfmMedicationDispense(baseRedfmInput()) as Record<string, unknown>;
    const authorizing = dispense.authorizingPrescription as Array<{ identifier: { value: string } }>;
    expect(authorizing[0].identifier.value).toBe('presc-rnds-001');
  });

  it('maps decline and estorno statuses to FHIR statuses', () => {
    const declined = buildRedfmMedicationDispense({ ...baseRedfmInput(), situacao: 'declinado' }) as Record<string, unknown>;
    expect(declined.status).toBe('declined');
    const estorno = buildRedfmMedicationDispense({ ...baseRedfmInput(), situacao: 'estorno' }) as Record<string, unknown>;
    expect(estorno.status).toBe('cancelled');
  });

  it('builds an explicit estorno referencing original dispense', () => {
    const estornoInput: RedfmEstornoInput = {
      identificadorRegistroOrigem: 'disp-original-001-estornado',
      referenciaregistroOriginal: 'disp-original-001',
      estabelecimentoCnes: '2207777',
      dataDispensacao: '2026-09-16T09:00:00Z',
      individuo: { cns: '123456789012345' },
      farmaceutico,
      situacao: 'estorno',
      tipoDispensacao: 'estorno',
    };
    const estorno = buildRedfmEstorno(estornoInput) as Record<string, unknown>;
    expect(estorno.status).toBe('cancelled');
    expect(JSON.stringify(estorno)).toContain('disp-original-001');
  });
});