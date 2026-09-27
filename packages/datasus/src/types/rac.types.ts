export type RacProcedencia =
  | 'retorno'
  | 'demanda_espontanea'
  | 'demanda_referenciada';

export type RacModalidade = 'atencao_basica' | 'ambulatorial_especializada' | 'domiciliar' | 'telemedicina';

export type RacCarater = 'eletivo' | 'urgencia';

export type RacDesfecho =
  | 'alta_clinica'
  | 'encaminhamento'
  | 'transferencia'
  | 'retorno'
  | 'alta_voluntaria'
  | 'obito'
  | 'permanencia';

export type RacDiagnosticoSistema = 'cid10' | 'ciap';

export type RacCategoriaProblema = 'principal' | 'secundario' | 'historico';

export type RacAlergiaCriticidade = 'alta' | 'media' | 'baixa';

export type RacAlergiaCategoria = 'medicacao' | 'alimento' | 'outra';

export interface RacProblema {
  codigo: string;
  sistema: RacDiagnosticoSistema;
  categoria?: RacCategoriaProblema;
  descricao?: string;
}

export interface RacAlergia {
  categoria: RacAlergiaCategoria;
  criticidade: RacAlergiaCriticidade;
  agente: string;
  manifestacao?: string;
}

export interface RacProcedimento {
  codigo: string;
  descricao?: string;
  realizado: boolean;
}

export interface RacMedicamento {
  texto: string;
  quantidade?: number;
  apresentacao?: string;
}

export interface RacProfissional {
  cpf: string;
  cbo?: string;
  conselhoTipo?: 'CRM' | 'COREN' | 'CRF' | 'CRO' | 'CRMV' | 'CREFITO' | 'CRP';
  conselhoUf?: string;
  conselhoNumero?: string;
}

export interface RacIndividuo {
  cns: string;
  cpf?: string;
}

export interface RacAtendimentoInput {
  estabelecimentoCnes: string;
  ine?: string;
  dataHoraAtendimento: string;
  grupo?: string;
  individuo: RacIndividuo;
  profissionais: RacProfissional[];
  motivos?: string[];
  problemas: RacProblema[];
  alergias?: RacAlergia[];
  medicamentos?: RacMedicamento[];
  procedimentos?: RacProcedimento[];
  procedencia: RacProcedencia;
  modalidade: RacModalidade;
  carater: RacCarater;
  desfecho: RacDesfecho;
}