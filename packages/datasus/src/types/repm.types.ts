export type ConselhoTipo = 'CRM' | 'COREN' | 'CRF' | 'CRO' | 'CRMV' | 'CREFITO' | 'CRP';

export interface RepmIndividuo {
  cns: string;
  cpf?: string;
}

export interface RepmProfissional {
  cpf: string;
  conselhoTipo: ConselhoTipo;
  conselhoUf: string;
  conselhoNumero: string;
  cbo?: string;
}

export interface RepmMedicamento {
  codigoObm?: string;
  codigoCmed?: string;
  nomeGenerico: string;
  dosagem?: string;
  formaFarmaceutica?: string;
  quantidade: number;
  unidade?: string;
}

export interface RepmPrescricaoInput {
  identificadorRegistroOrigem: string;
  estabelecimentoCnes: string;
  ine?: string;
  uf?: string;
  dataPrescricao: string;
  validadeDias?: number;
  individuo: RepmIndividuo;
  prescritor: RepmProfissional;
  medicamento: RepmMedicamento;
}