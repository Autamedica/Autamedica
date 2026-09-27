import { describe, expect, it } from 'vitest';
import { buildRacBundle } from '../mappers/rac.mapper';
import type { RacAtendimentoInput } from '../types/rac.types';

function baseRacInput(): RacAtendimentoInput {
  return {
    estabelecimentoCnes: '2207777',
    ine: '001',
    dataHoraAtendimento: '2026-09-14T18:30:00Z',
    grupo: 'rg-001',
    individuo: { cns: '123456789012345', cpf: '98765432100' },
    profissionais: [{ cpf: '11122233344', conselhoTipo: 'CRM', conselhoUf: 'RS', conselhoNumero: '12345' }],
    motivos: ['Tosse persistente ha 5 dias'],
    problemas: [{ codigo: 'R05', sistema: 'cid10', categoria: 'principal', descricao: 'Tosse' }],
    alergias: [{ categoria: 'medicacao', criticidade: 'alta', agente: 'Penicilina', manifestacao: 'Anafilaxia' }],
    medicamentos: [{ texto: 'Amoxicilina 500mg', quantidade: 21, apresentacao: 'caps' }],
    procedimentos: [{ codigo: '0301010072', descricao: 'Consulta', realizado: true }],
    procedencia: 'demanda_espontanea',
    modalidade: 'atencao_basica',
    carater: 'eletivo',
    desfecho: 'alta_clinica',
  };
}

describe('rac.mapper', () => {
  it('builds a transaction Bundle with Composition and referenced resources', () => {
    const bundle = buildRacBundle(baseRacInput()) as {
      resourceType: string;
      type: string;
      entry: Array<{ resource: { resourceType: string; id: string }; request: { method: string; url: string } }>;
    };

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('transaction');

    const types = bundle.entry.map((e) => e.resource.resourceType);
    expect(types).toContain('Patient');
    expect(types).toContain('Practitioner');
    expect(types).toContain('Condition');
    expect(types).toContain('AllergyIntolerance');
    expect(types).toContain('MedicationStatement');
    expect(types).toContain('Procedure');
    expect(types).toContain('Composition');

    const composition = bundle.entry.find((e) => e.resource.resourceType === 'Composition')!;
    const compositionResource = composition.resource as Record<string, unknown>;
    const section = (compositionResource.section as Array<Record<string, unknown>>)?.find(
      (s) => s.title === 'Alergia e/ou Rea\u00e7\u00e3o Adversa',
    );
    expect(section).toBeDefined();
    expect((section?.entry as Array<{ reference: string }>)[0].reference).toBe('#alergia-1');
  });

  it('sets composition subject and custodian from CNS and CNES', () => {
    const bundle = buildRacBundle(baseRacInput()) as { entry: Array<{ resource: Record<string, unknown> }> };
    const composition = bundle.entry.find((e) => e.resource.resourceType === 'Composition')!.resource;
    expect((composition.subject as { reference: string }).reference).toBe('#paciente-123456789012345');
    expect((composition.custodian as { identifier: { value: string } }).identifier.value).toBe('2207777');
  });

  it('serializes alergia criticidad and reaction', () => {
    const bundle = buildRacBundle(baseRacInput()) as { entry: Array<{ resource: Record<string, unknown> }> };
    const allergy = bundle.entry.find((e) => e.resource.resourceType === 'AllergyIntolerance')!.resource;
    expect(allergy.criticality).toBe('alta');
    expect((allergy.reaction as Array<{ manifestation: Array<{ text: string }> }>)[0].manifestation[0].text).toBe('Anafilaxia');
  });

  it('records transaction-entry method PUT per resource', () => {
    const bundle = buildRacBundle(baseRacInput()) as { entry: Array<{ request: { method: string; url: string } }> };
    expect(bundle.entry.length).toBeGreaterThan(0);
    expect(bundle.entry.every((e) => e.request.method === 'PUT')).toBe(true);
  });
});