import type {
  RacAtendimentoInput,
  RacProblema,
} from '../types/rac.types';

const COMPOSITION_PROFILE = 'https://ehr.em.gov.br/fhir/r4/StructureDefinition/br-core-composition-registroatendimentoclinico';

function buildPatient(input: RacAtendimentoInput) {
  return {
    resourceType: 'Patient',
    id: `paciente-${input.individuo.cns}`,
    identifier: [
      { system: 'https://identifiadorSocial.saude.gov.br/cns', value: input.individuo.cns },
      ...(input.individuo.cpf
        ? [{ system: 'https://identifiadorSocial.saude.gov.br/cpf', value: input.individuo.cpf }]
        : []),
    ],
  };
}

function buildPractitioner(profissional: RacAtendimentoInput['profissionais'][number], index: number) {
  const id = `profissional-${index + 1}`;
  const qualification = profissional.conselhoNumero
    ? [
        {
          identifier: [
            {
              system: `https://conselho.saude.gov.br/${(profissional.conselhoTipo ?? 'CRM').toLowerCase()}`,
              value: profissional.conselhoNumero,
              assigner: { display: profissional.conselhoUf },
            },
          ],
        },
      ]
    : undefined;

  return {
    resourceType: 'Practitioner',
    id,
    identifier: [{ system: 'https://identifiadorSocial.saude.gov.br/cpf', value: profissional.cpf }],
    ...(qualification ? { qualification } : {}),
  };
}

function buildConditions(problemas: RacProblema[]): unknown[] {
  return problemas.map((problema, index) => ({
    resourceType: 'Condition',
    id: `problema-${index + 1}`,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    category: [
      {
        coding: [{
          system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRCategoriaServico',
          code: 'consulta',
        }],
      },
    ],
    code: {
      coding: [{
        system: problema.sistema === 'cid10'
          ? 'http://hl7.org/fhir/sid/icd-10'
          : 'http://hl7.org/fhir/sid/icpc-2',
        code: problema.codigo,
      }],
    },
    ...(problema.descricao ? { note: [{ text: problema.descricao }] } : {}),
  }));
}

function buildAllergies(alergias: RacAtendimentoInput['alergias']): unknown[] {
  return (alergias ?? []).map((alergia, index) => ({
    resourceType: 'AllergyIntolerance',
    id: `alergia-${index + 1}`,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    category: [alergia.categoria],
    criticality: alergia.criticidade,
    code: { text: alergia.agente },
    ...(alergia.manifestacao ? { reaction: [{ manifestation: [{ text: alergia.manifestacao }] }] } : {}),
  }));
}

function buildMedications(medicamentos: RacAtendimentoInput['medicamentos']): unknown[] {
  return (medicamentos ?? []).map((medicamento, index) => ({
    resourceType: 'MedicationStatement',
    id: `medicamento-${index + 1}`,
    status: 'active',
    medication: {
      concept: {
        coding: [{ system: 'http://portal.saude.gov.br/obm', display: medicamento.texto }],
      },
    },
    dosage: medicamento.quantidade
      ? [{ doseAndRate: [{ doseQuantity: { value: medicamento.quantidade, unit: medicamento.apresentacao } }] }]
      : undefined,
  }));
}

function buildProcedures(procedimentos: RacAtendimentoInput['procedimentos']): unknown[] {
  return (procedimentos ?? []).map((procedimento, index) => ({
    resourceType: 'Procedure',
    id: `procedimento-${index + 1}`,
    status: procedimento.realizado ? 'completed' : 'requested',
    code: {
      coding: [{
        system: 'http://www.saude.gov.br/sigtap/7',
        code: procedimento.codigo,
      }],
      ...(procedimento.descricao ? { text: procedimento.descricao } : {}),
    },
  }));
}

function buildComposition(input: RacAtendimentoInput): unknown {
  const sections = [];

  if (input.motivos && input.motivos.length > 0) {
    sections.push({
      title: 'Motivo do Atendimento',
      code: {
        coding: [{
          system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRCategoriaServico',
          code: 'motivo',
        }],
      },
      text: {
        status: 'generated',
        div: `<div>${input.motivos.map((m) => `<p>${m}</p>`).join('')}</div>`,
      },
    });
  }

  sections.push({
    title: 'Problemas / Diagn\u00f3sticos Avaliados',
    code: { coding: [{ system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRCategoriaServico', code: 'problemas' }] },
    entry: input.problemas.map((_, index) => ({ reference: `#problema-${index + 1}` })),
  });

  if (input.alergias && input.alergias.length > 0) {
    sections.push({
      title: 'Alergia e/ou Rea\u00e7\u00e3o Adversa',
      code: { coding: [{ system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRCategoriaServico', code: 'alergias' }] },
      entry: input.alergias.map((_, index) => ({ reference: `#alergia-${index + 1}` })),
    });
  }

  if (input.medicamentos && input.medicamentos.length > 0) {
    sections.push({
      title: 'Medicamentos',
      code: { coding: [{ system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRCategoriaServico', code: 'medicamentos' }] },
      entry: input.medicamentos.map((_, index) => ({ reference: `#medicamento-${index + 1}` })),
    });
  }

  if (input.procedimentos && input.procedimentos.length > 0) {
    sections.push({
      title: 'Procedimentos Realizados/Solicitados',
      code: { coding: [{ system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRCategoriaServico', code: 'procedimentos' }] },
      entry: input.procedimentos.map((_, index) => ({ reference: `#procedimento-${index + 1}` })),
    });
  }

  return {
    resourceType: 'Composition',
    id: `composicao-${input.estabelecimentoCnes}-${input.dataHoraAtendimento}`,
    meta: { profile: [COMPOSITION_PROFILE] },
    identifier: input.grupo
      ? [{ system: 'http://autamedica.com/rnds/rac', value: input.grupo }]
      : undefined,
    status: 'final',
    type: {
      coding: [{
        system: 'http://loinc.org',
        code: '57055-6',
        display: 'Antepartum summary note',
      }],
    },
    subject: { reference: `#paciente-${input.individuo.cns}` },
    date: input.dataHoraAtendimento,
    author: input.profissionais.map((_, index) => ({ reference: `#profissional-${index + 1}` })),
    custodian: { identifier: { system: 'https://cnes.saude.gov.br', value: input.estabelecimentoCnes } },
    event: [
      {
        code: [
          { coding: [{ system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRCategoriaServico', code: 'consulta' }] },
        ],
        detail: [
          {
            coding: [{
              system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRModalidadeAssistencial',
              code: input.modalidade,
            }],
          },
          {
            coding: [{
              system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRCaraterAtendimento',
              code: input.carater,
            }],
          },
          {
            coding: [{
              system: 'https://tabela.herokuapp.com/fhir/CodeSystem/BRProcedencia',
              code: input.procedencia,
            }],
          },
        ],
      },
    ],
    section: sections,
  };
}

/**
 * Construye un Bundle de transaccion FHIR R4 para el RAC (ateRNDS).
 * Profesionales, condiciones, alergias, medicamentos y procedimientos se
 * incluyen como recursos referenciados por la Composition.
 */
export function buildRacBundle(input: RacAtendimentoInput): unknown {
  const resources: unknown[] = [
    buildPatient(input),
    ...input.profissionais.map((profissional, index) => buildPractitioner(profissional, index)),
    ...buildConditions(input.problemas),
    ...buildAllergies(input.alergias),
    ...buildMedications(input.medicamentos),
    ...buildProcedures(input.procedimentos),
    buildComposition(input),
  ];

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    timestamp: input.dataHoraAtendimento,
    entry: resources.map((resource) => ({
      resource,
      request: {
        method: 'PUT',
        url: `${(resource as { resourceType: string }).resourceType}/${(resource as { id: string }).id}`,
      },
    })),
  };
}