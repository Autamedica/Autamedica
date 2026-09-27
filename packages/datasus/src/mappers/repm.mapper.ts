import type { RepmPrescricaoInput } from '../types/repm.types';

/**
 * Construye un MedicationRequest FHIR R4 (REPM - Registro Eletr\u00f4nico de
 * Prescri\u00e7\u00f5es e Medicamentos) para envio a RNDS.
 */
export function buildRepmMedicationRequest(input: RepmPrescricaoInput): unknown {
  const medicationCoding = input.medicamento.codigoObm
    ? [{ system: 'http://portal.saude.gov.br/obm', code: input.medicamento.codigoObm }]
    : input.medicamento.codigoCmed
      ? [{ system: 'http://www.anvisa.gov.br/cmed', code: input.medicamento.codigoCmed }]
      : [];

  const medication = {
    concept: {
      coding: medicationCoding,
      text: [
        input.medicamento.nomeGenerico,
        input.medicamento.dosagem,
        input.medicamento.formaFarmaceutica,
      ].filter(Boolean).join(' '),
    },
  };

  const identifier = input.identificadorRegistroOrigem
    ? [{ system: 'http://autamedica.com/rnds/repm', value: input.identificadorRegistroOrigem }]
    : [];

  return {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    identifier,
    subject: {
      identifier: [
        { system: 'https://identifiadorSocial.saude.gov.br/cns', value: input.individuo.cns },
        ...(input.individuo.cpf
          ? [{ system: 'https://identifiadorSocial.saude.gov.br/cpf', value: input.individuo.cpf }]
          : []),
      ],
    },
    authoredOn: input.dataPrescricao,
    requester: {
      identifier: {
        system: 'https://identifiadorSocial.saude.gov.br/cpf',
        value: input.prescritor.cpf,
      },
    },
    performerType: undefined,
    medication,
    dosageInstruction: input.medicamento.quantidade
      ? [{ doseAndRate: [{ doseQuantity: { value: input.medicamento.quantidade, unit: input.medicamento.unidade } }] }]
      : undefined,
    dispenseRequest: {
      validityPeriod: input.validadeDias
        ? {
            start: input.dataPrescricao,
            end: new Date(new Date(input.dataPrescricao).getTime() + input.validadeDias * 86_400_000).toISOString(),
          }
        : undefined,
      quantity: input.medicamento.quantidade
        ? { value: input.medicamento.quantidade, unit: input.medicamento.unidade }
        : undefined,
    },
  };
}