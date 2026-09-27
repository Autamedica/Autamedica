import type { RedfmDispensacaoInput, RedfmEstornoInput } from '../types/redfm.types';

function medicationCoding(medicamento: RedfmDispensacaoInput['medicamento']): unknown[] {
  return medicamento.codigoObm
    ? [{ system: 'http://portal.saude.gov.br/obm', code: medicamento.codigoObm }]
    : medicamento.codigoCmed
      ? [{ system: 'http://www.anvisa.gov.br/cmed', code: medicamento.codigoCmed }]
      : [];
}

function medicationText(medicamento: RedfmDispensacaoInput['medicamento']): string {
  return [
    medicamento.nomeGenerico,
    medicamento.dosagem,
    medicamento.formaFarmaceutica,
  ].filter(Boolean).join(' ');
}

/**
 * Construye un MedicationDispense FHIR R4 (REDFM - Registro Eletr\u00f4nico
 * de Dispensa\u00e7\u00f5es de Medicamentos e Farmac\u00eauticos) para RNDS.
 * El `vendor_id` (Farmalink/CUIR) se porta como identifier de origen.
 */
export function buildRedfmMedicationDispense(input: RedfmDispensacaoInput): unknown {
  const identifier = [
    { system: 'http://autamedica.com/rnds/redfm', value: input.identificadorRegistroOrigem },
    ...(input.identificadorPrescricaoOrigem
      ? [{ system: 'http://autamedica.com/rnds/prescricao_origem', value: input.identificadorPrescricaoOrigem }]
      : []),
  ];

  const statusMap: Record<string, string> = {
    declinado: 'declined',
    inserido_por_erro: 'cancelled',
    estorno: 'cancelled',
    completo: 'completed',
  };

  return {
    resourceType: 'MedicationDispense',
    status: statusMap[input.situacao] ?? 'completed',
    identifier,
    ...(input.estornoReferencia
      ? {
          substitution: {
            wasSubstituted: true,
            reason: [{ text: `Estorno referente a ${input.estornoReferencia}` }],
          },
        }
      : {}),
    subject: {
      identifier: [
        { system: 'https://identifiadorSocial.saude.gov.br/cns', value: input.individuo.cns },
        ...(input.individuo.cpf
          ? [{ system: 'https://identifiadorSocial.saude.gov.br/cpf', value: input.individuo.cpf }]
          : []),
      ],
    },
    performer: [
      {
        actor: {
          identifier: {
            system: 'https://identifiadorSocial.saude.gov.br/cpf',
            value: input.farmaceutico.cpf,
          },
        },
      },
    ],
    medication: {
      concept: {
        coding: medicationCoding(input.medicamento),
        text: medicationText(input.medicamento),
      },
    },
    quantity: input.medicamento.quantidade
      ? { value: input.medicamento.quantidade, unit: input.medicamento.unidade }
      : undefined,
    whenHandedOver: input.dataDispensacao,
    location: { identifier: { system: 'https://cnes.saude.gov.br', value: input.estabelecimentoCnes } },
    ...(input.identificadorPrescricaoRnds
      ? { authorizingPrescription: [{ identifier: { value: input.identificadorPrescricaoRnds } }] }
      : {}),
  };
}

export function buildRedfmEstorno(input: RedfmEstornoInput): unknown {
  const identifier = [{ system: 'http://autamedica.com/rnds/redfm', value: input.identificadorRegistroOrigem }];

  return {
    resourceType: 'MedicationDispense',
    status: 'cancelled',
    identifier,
    substitution: {
      wasSubstituted: true,
      reason: [{ text: `Estorno referente a ${input.referenciaregistroOriginal}` }],
    },
    subject: {
      identifier: [
        { system: 'https://identifiadorSocial.saude.gov.br/cns', value: input.individuo.cns },
        ...(input.individuo.cpf
          ? [{ system: 'https://identifiadorSocial.saude.gov.br/cpf', value: input.individuo.cpf }]
          : []),
      ],
    },
    performer: [
      {
        actor: {
          identifier: {
            system: 'https://identifiadorSocial.saude.gov.br/cpf',
            value: input.farmaceutico.cpf,
          },
        },
      },
    ],
    medication: {},
    whenHandedOver: input.dataDispensacao,
    location: { identifier: { system: 'https://cnes.saude.gov.br', value: input.estabelecimentoCnes } },
  };
}