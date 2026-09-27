export type CadsusSex = 'M' | 'F' | 'O';

export interface CadsusMunicipio {
  codigo?: string;
  nome?: string;
  uf?: string;
}

export interface CadsusPerson {
  cns: string;
  cpf?: string;
  nome: string;
  nomeMae?: string | null;
  sexo?: CadsusSex | null;
  nascimento?: string | null;
  municipioNascimento?: CadsusMunicipio | null;
}

export interface CadsusLookupRequest {
  cns?: string;
  cpf?: string;
  nome?: string;
  dataNascimento?: string;
}

export type CadsusLookupSource = 'cadsus_pdq' | 'cadsus_web' | 'offline_mock';

export interface CadsusLookupResult {
  found: boolean;
  reason?: 'not_found' | 'multiple_matches' | 'error';
  person?: CadsusPerson;
  source: CadsusLookupSource;
  raw?: unknown;
}

export interface ICadsusClient {
  lookup(request: CadsusLookupRequest): Promise<CadsusLookupResult>;
}

export const CADSUS_REQUIRED_FIELDS = [
  'cns',
  'nome',
  'nomeMae',
  'sexo',
  'nascimento',
  'municipioNascimento',
] as const;