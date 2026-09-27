import type { RepmIndividuo, RepmMedicamento, RepmProfissional } from './repm.types';

export type RedfmSituacao = 'completo' | 'inserido_por_erro' | 'declinado' | 'estorno';

export type RedfmTipoDispensacao = 'total' | 'parcial' | 'nao_dispensado' | 'estorno';

export interface RedfmDispensacaoInput {
  identificadorRegistroOrigem: string;
  identificadorPrescricaoRnds?: string;
  identificadorPrescricaoOrigem?: string;
  estabelecimentoCnes: string;
  ine?: string;
  dataDispensacao: string;
  individuo: RepmIndividuo;
  farmaceutico: RepmProfissional;
  medicamento: RedfmMedicamento;
  situacao: RedfmSituacao;
  tipoDispensacao: RedfmTipoDispensacao;
  estornoReferencia?: string;
}

export interface RedfmMedicamento extends RepmMedicamento {}

export interface RedfmEstornoInput {
  identificadorRegistroOrigem: string;
  referenciaregistroOriginal: string;
  estabelecimentoCnes: string;
  ine?: string;
  dataDispensacao: string;
  individuo: RepmIndividuo;
  farmaceutico: RepmProfissional;
  situacao: 'estorno';
  tipoDispensacao: 'estorno';
}