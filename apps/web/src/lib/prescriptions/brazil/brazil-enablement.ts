export type MemedLinkStatus =
  | 'not_linked'
  | 'linked_untested'
  | 'test_emission_verified'
  | 'suspended';

export type IcpBrasilStatus =
  | 'not_started'
  | 'requested_cfm_free'
  | 'self_reported_active'
  | 'verified'
  | 'expired'
  | 'revoked';

export type IcpProvider =
  | 'cfm_cloud_a3'
  | 'vidaas'
  | 'birdid'
  | 'safeid'
  | 'other_icp_brasil';

export type SncrB1Status =
  | 'not_requested'
  | 'visa_requested'
  | 'self_reported_active'
  | 'verified'
  | 'depleted'
  | 'suspended';

export type EnablementStageStatus = 'pending' | 'in_review' | 'verified';

export interface EnablementStage {
  step: number;
  key:
    | 'crm_cfm'
    | 'cpf_address'
    | 'memed_link'
    | 'icp_brasil'
    | 'signature_test'
    | 'sncr_b1_visa'
    | 'b1_verified';
  title: string;
  description: string;
  status: EnablementStageStatus;
}

export interface BrazilEnablementSummary {
  doctorId: string;
  crm: {
    licenseNumber: string | null;
    uf: string | null;
    cfmValidated: boolean;
  };
  profile: {
    hasCpf: boolean;
    hasBirthDate: boolean;
    professionalAddress: string | null;
  };
  credentials: {
    memedLinkStatus: MemedLinkStatus;
    icpBrasilStatus: IcpBrasilStatus;
    icpProvider: IcpProvider | null;
    icpExpiresAt: string | null;
    sncrB1Status: SncrB1Status;
    sncrVisaUf: string | null;
    sncrVisaMunicipality: string | null;
    sncrReviewNotes: string | null;
  };
  capabilities: {
    canIssueSimpleRx: boolean;
    canIssueRceRetRx: boolean;
    canIssueControlledB1: boolean;
  };
  links: {
    cfmFreeCertificateUrl: string;
    anvisaSncrGuideUrl: string;
  };
  stages: EnablementStage[];
  completedStages: number;
  totalStages: number;
}

export const CFM_FREE_CERTIFICATE_URL = 'https://crmvirtual.cfm.org.br/';
export const ANVISA_SNCR_GUIDE_URL =
  'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/controlados/sncr';

const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

const SELF_ICP_STATUSES = new Set<IcpBrasilStatus>([
  'not_started',
  'requested_cfm_free',
  'self_reported_active',
]);

const SELF_SNCR_STATUSES = new Set<SncrB1Status>([
  'not_requested',
  'visa_requested',
  'self_reported_active',
  'depleted',
]);

const VALID_ICP_PROVIDERS = new Set<IcpProvider>([
  'cfm_cloud_a3',
  'vidaas',
  'birdid',
  'safeid',
  'other_icp_brasil',
]);

export interface DoctorEnablementPatchInput {
  professionalAddress?: string;
  icpBrasilStatus?: 'not_started' | 'requested_cfm_free' | 'self_reported_active';
  icpProvider?: IcpProvider | null;
  icpExpiresAt?: string | null;
  sncrB1Status?: 'not_requested' | 'visa_requested' | 'self_reported_active' | 'depleted';
  sncrVisaUf?: string | null;
  sncrVisaMunicipality?: string | null;
}

export function parseDoctorEnablementPatch(raw: unknown):
  | { ok: true; value: DoctorEnablementPatchInput }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request body' };
  }
  const body = raw as Record<string, unknown>;
  const out: DoctorEnablementPatchInput = {};

  if (body.professionalAddress !== undefined) {
    if (typeof body.professionalAddress !== 'string') {
      return { ok: false, error: 'professionalAddress must be a string' };
    }
    const clean = body.professionalAddress.trim().replace(/\s+/g, ' ');
    if (clean.length < 5 || clean.length > 240) {
      return { ok: false, error: 'professionalAddress must be between 5 and 240 characters' };
    }
    out.professionalAddress = clean;
  }

  if (body.icpBrasilStatus !== undefined) {
    if (
      typeof body.icpBrasilStatus !== 'string' ||
      !SELF_ICP_STATUSES.has(body.icpBrasilStatus as IcpBrasilStatus)
    ) {
      return { ok: false, error: 'icpBrasilStatus cannot be set to a verified/revoked state by doctor' };
    }
    out.icpBrasilStatus = body.icpBrasilStatus as DoctorEnablementPatchInput['icpBrasilStatus'];
  }

  if (body.icpProvider !== undefined) {
    if (body.icpProvider === null || body.icpProvider === '') {
      out.icpProvider = null;
    } else if (
      typeof body.icpProvider === 'string' &&
      VALID_ICP_PROVIDERS.has(body.icpProvider as IcpProvider)
    ) {
      out.icpProvider = body.icpProvider as IcpProvider;
    } else {
      return { ok: false, error: 'Invalid icpProvider' };
    }
  }

  if (body.icpExpiresAt !== undefined) {
    if (body.icpExpiresAt === null || body.icpExpiresAt === '') {
      out.icpExpiresAt = null;
    } else if (typeof body.icpExpiresAt === 'string' && !Number.isNaN(Date.parse(body.icpExpiresAt))) {
      out.icpExpiresAt = new Date(body.icpExpiresAt).toISOString();
    } else {
      return { ok: false, error: 'Invalid icpExpiresAt timestamp' };
    }
  }

  if (body.sncrB1Status !== undefined) {
    if (
      typeof body.sncrB1Status !== 'string' ||
      !SELF_SNCR_STATUSES.has(body.sncrB1Status as SncrB1Status)
    ) {
      return { ok: false, error: 'sncrB1Status cannot be verified by doctor' };
    }
    out.sncrB1Status = body.sncrB1Status as DoctorEnablementPatchInput['sncrB1Status'];
  }

  if (body.sncrVisaUf !== undefined) {
    if (body.sncrVisaUf === null || body.sncrVisaUf === '') {
      out.sncrVisaUf = null;
    } else if (typeof body.sncrVisaUf === 'string') {
      const uf = body.sncrVisaUf.trim().toUpperCase();
      if (!VALID_UFS.has(uf)) return { ok: false, error: 'Invalid sncrVisaUf' };
      out.sncrVisaUf = uf;
    } else {
      return { ok: false, error: 'Invalid sncrVisaUf' };
    }
  }

  if (body.sncrVisaMunicipality !== undefined) {
    if (body.sncrVisaMunicipality === null || body.sncrVisaMunicipality === '') {
      out.sncrVisaMunicipality = null;
    } else if (typeof body.sncrVisaMunicipality === 'string') {
      const mun = body.sncrVisaMunicipality.trim().replace(/\s+/g, ' ');
      if (mun.length < 2 || mun.length > 120) {
        return { ok: false, error: 'sncrVisaMunicipality must be between 2 and 120 characters' };
      }
      out.sncrVisaMunicipality = mun;
    } else {
      return { ok: false, error: 'Invalid sncrVisaMunicipality' };
    }
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: 'No updatable fields provided' };
  }

  return { ok: true, value: out };
}

export interface AdminVerifyEnablementInput {
  memedLinkStatus?: MemedLinkStatus;
  memedTestPrescriptionId?: string | null;
  icpBrasilStatus?: IcpBrasilStatus;
  icpProvider?: IcpProvider | null;
  icpExpiresAt?: string | null;
  sncrB1Status?: SncrB1Status;
  sncrVisaUf?: string | null;
  sncrVisaMunicipality?: string | null;
  sncrReviewNotes?: string | null;
}

const ALL_MEMED_STATUSES = new Set<MemedLinkStatus>([
  'not_linked',
  'linked_untested',
  'test_emission_verified',
  'suspended',
]);

const ALL_ICP_STATUSES = new Set<IcpBrasilStatus>([
  'not_started',
  'requested_cfm_free',
  'self_reported_active',
  'verified',
  'expired',
  'revoked',
]);

const ALL_SNCR_STATUSES = new Set<SncrB1Status>([
  'not_requested',
  'visa_requested',
  'self_reported_active',
  'verified',
  'depleted',
  'suspended',
]);

export function parseAdminVerifyEnablement(raw: unknown):
  | { ok: true; value: AdminVerifyEnablementInput }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request body' };
  }
  const body = raw as Record<string, unknown>;
  const out: AdminVerifyEnablementInput = {};

  if (body.memedLinkStatus !== undefined) {
    if (
      typeof body.memedLinkStatus !== 'string' ||
      !ALL_MEMED_STATUSES.has(body.memedLinkStatus as MemedLinkStatus)
    ) {
      return { ok: false, error: 'Invalid memedLinkStatus' };
    }
    out.memedLinkStatus = body.memedLinkStatus as MemedLinkStatus;
  }

  if (body.memedTestPrescriptionId !== undefined) {
    if (body.memedTestPrescriptionId === null || body.memedTestPrescriptionId === '') {
      out.memedTestPrescriptionId = null;
    } else if (typeof body.memedTestPrescriptionId === 'string') {
      const clean = body.memedTestPrescriptionId.trim();
      if (clean.length < 1 || clean.length > 100) {
        return { ok: false, error: 'Invalid memedTestPrescriptionId' };
      }
      out.memedTestPrescriptionId = clean;
    } else {
      return { ok: false, error: 'Invalid memedTestPrescriptionId' };
    }
  }

  if (body.icpBrasilStatus !== undefined) {
    if (
      typeof body.icpBrasilStatus !== 'string' ||
      !ALL_ICP_STATUSES.has(body.icpBrasilStatus as IcpBrasilStatus)
    ) {
      return { ok: false, error: 'Invalid icpBrasilStatus' };
    }
    out.icpBrasilStatus = body.icpBrasilStatus as IcpBrasilStatus;
  }

  if (body.icpProvider !== undefined) {
    if (body.icpProvider === null || body.icpProvider === '') {
      out.icpProvider = null;
    } else if (
      typeof body.icpProvider === 'string' &&
      VALID_ICP_PROVIDERS.has(body.icpProvider as IcpProvider)
    ) {
      out.icpProvider = body.icpProvider as IcpProvider;
    } else {
      return { ok: false, error: 'Invalid icpProvider' };
    }
  }

  if (body.icpExpiresAt !== undefined) {
    if (body.icpExpiresAt === null || body.icpExpiresAt === '') {
      out.icpExpiresAt = null;
    } else if (typeof body.icpExpiresAt === 'string' && !Number.isNaN(Date.parse(body.icpExpiresAt))) {
      out.icpExpiresAt = new Date(body.icpExpiresAt).toISOString();
    } else {
      return { ok: false, error: 'Invalid icpExpiresAt' };
    }
  }

  if (body.sncrB1Status !== undefined) {
    if (
      typeof body.sncrB1Status !== 'string' ||
      !ALL_SNCR_STATUSES.has(body.sncrB1Status as SncrB1Status)
    ) {
      return { ok: false, error: 'Invalid sncrB1Status' };
    }
    out.sncrB1Status = body.sncrB1Status as SncrB1Status;
  }

  if (body.sncrVisaUf !== undefined) {
    if (body.sncrVisaUf === null || body.sncrVisaUf === '') {
      out.sncrVisaUf = null;
    } else if (typeof body.sncrVisaUf === 'string' && VALID_UFS.has(body.sncrVisaUf.trim().toUpperCase())) {
      out.sncrVisaUf = body.sncrVisaUf.trim().toUpperCase();
    } else {
      return { ok: false, error: 'Invalid sncrVisaUf' };
    }
  }

  if (body.sncrVisaMunicipality !== undefined) {
    if (body.sncrVisaMunicipality === null || body.sncrVisaMunicipality === '') {
      out.sncrVisaMunicipality = null;
    } else if (typeof body.sncrVisaMunicipality === 'string') {
      const mun = body.sncrVisaMunicipality.trim();
      if (mun.length < 2 || mun.length > 120) {
        return { ok: false, error: 'Invalid sncrVisaMunicipality' };
      }
      out.sncrVisaMunicipality = mun;
    } else {
      return { ok: false, error: 'Invalid sncrVisaMunicipality' };
    }
  }

  if (body.sncrReviewNotes !== undefined) {
    if (body.sncrReviewNotes === null || body.sncrReviewNotes === '') {
      out.sncrReviewNotes = null;
    } else if (typeof body.sncrReviewNotes === 'string') {
      out.sncrReviewNotes = body.sncrReviewNotes.trim().slice(0, 500);
    } else {
      return { ok: false, error: 'Invalid sncrReviewNotes' };
    }
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: 'No review fields provided' };
  }
  return { ok: true, value: out };
}

export function computeEffectiveBrazilCapabilities(params: {
  doctorActive: boolean;
  cfmValidated: boolean;
  hasCpf: boolean;
  hasProfessionalAddress: boolean;
  memedLinkStatus: MemedLinkStatus;
  icpBrasilStatus: IcpBrasilStatus;
  icpExpiresAt: string | null;
  sncrB1Status: SncrB1Status;
  sncrVisaUf: string | null;
}): {
  canIssueSimpleRx: boolean;
  canIssueRceRetRx: boolean;
  canIssueControlledB1: boolean;
} {
  const canIssueSimpleRx =
    params.doctorActive &&
    params.cfmValidated &&
    params.hasCpf &&
    (params.memedLinkStatus === 'linked_untested' ||
      params.memedLinkStatus === 'test_emission_verified');

  const icpNotExpired =
    !params.icpExpiresAt || Date.parse(params.icpExpiresAt) > Date.now();

  const canIssueRceRetRx =
    canIssueSimpleRx &&
    params.hasProfessionalAddress &&
    params.icpBrasilStatus === 'verified' &&
    icpNotExpired;

  const canIssueControlledB1 =
    canIssueRceRetRx &&
    params.sncrB1Status === 'verified' &&
    Boolean(params.sncrVisaUf && VALID_UFS.has(params.sncrVisaUf));

  return {
    canIssueSimpleRx,
    canIssueRceRetRx,
    canIssueControlledB1,
  };
}

export function buildBrazilEnablementSummary(params: {
  doctorId: string;
  doctorActive: boolean;
  licenseNumber: string | null;
  ufBrazil: string | null;
  cfmValidated: boolean;
  hasCpf: boolean;
  hasBirthDate: boolean;
  professionalAddress: string | null;
  credentialRow?: {
    memed_link_status?: string | null;
    icp_brasil_status?: string | null;
    icp_provider?: string | null;
    icp_expires_at?: string | null;
    sncr_b1_status?: string | null;
    sncr_visa_uf?: string | null;
    sncr_visa_municipality?: string | null;
    sncr_review_notes?: string | null;
    can_issue_simple_rx?: boolean | null;
    can_issue_rce_ret_rx?: boolean | null;
    can_issue_controlled_b1?: boolean | null;
  } | null;
}): BrazilEnablementSummary {
  const row = params.credentialRow ?? {};
  const memedLinkStatus = (
    ALL_MEMED_STATUSES.has(row.memed_link_status as MemedLinkStatus)
      ? row.memed_link_status
      : 'not_linked'
  ) as MemedLinkStatus;
  const icpBrasilStatus = (
    ALL_ICP_STATUSES.has(row.icp_brasil_status as IcpBrasilStatus)
      ? row.icp_brasil_status
      : 'not_started'
  ) as IcpBrasilStatus;
  const icpProvider = VALID_ICP_PROVIDERS.has(row.icp_provider as IcpProvider)
    ? (row.icp_provider as IcpProvider)
    : null;
  const sncrB1Status = (
    ALL_SNCR_STATUSES.has(row.sncr_b1_status as SncrB1Status)
      ? row.sncr_b1_status
      : 'not_requested'
  ) as SncrB1Status;
  const sncrVisaUf = row.sncr_visa_uf ?? params.ufBrazil ?? null;
  const cleanAddress = params.professionalAddress?.trim() || null;

  const canIssueSimpleRx = Boolean(row.can_issue_simple_rx);
  const canIssueRceRetRx = Boolean(row.can_issue_rce_ret_rx);
  const canIssueControlledB1 = Boolean(row.can_issue_controlled_b1);

  const stage1: EnablementStageStatus = params.cfmValidated ? 'verified' : 'pending';
  const stage2: EnablementStageStatus =
    params.hasCpf && cleanAddress
      ? 'verified'
      : params.hasCpf || cleanAddress
        ? 'in_review'
        : 'pending';
  const stage3: EnablementStageStatus =
    memedLinkStatus === 'test_emission_verified' || memedLinkStatus === 'linked_untested'
      ? 'verified'
      : 'pending';
  const stage4: EnablementStageStatus =
    icpBrasilStatus === 'verified'
      ? 'verified'
      : icpBrasilStatus === 'requested_cfm_free' || icpBrasilStatus === 'self_reported_active'
        ? 'in_review'
        : 'pending';
  const stage5: EnablementStageStatus =
    memedLinkStatus === 'test_emission_verified' && icpBrasilStatus === 'verified'
      ? 'verified'
      : icpBrasilStatus === 'verified'
        ? 'in_review'
        : 'pending';
  const stage6: EnablementStageStatus =
    sncrB1Status === 'verified'
      ? 'verified'
      : sncrB1Status === 'visa_requested' || sncrB1Status === 'self_reported_active'
        ? 'in_review'
        : 'pending';
  const stage7: EnablementStageStatus = canIssueControlledB1
    ? 'verified'
    : sncrB1Status === 'self_reported_active'
      ? 'in_review'
      : 'pending';

  const stages: EnablementStage[] = [
    {
      step: 1,
      key: 'crm_cfm',
      title: 'CRM + UF validados pelo CFM',
      description: 'Registro profissional ativo e conferido na base oficial do CFM.',
      status: stage1,
    },
    {
      step: 2,
      key: 'cpf_address',
      title: 'CPF e endereço profissional',
      description: 'Obrigatório para emitir receitas e notificação controlada com endereço no rodapé.',
      status: stage2,
    },
    {
      step: 3,
      key: 'memed_link',
      title: 'Vinculação do prescritor digital',
      description: 'Habilita teleconsultas gerais e receitas simples digitais.',
      status: stage3,
    },
    {
      step: 4,
      key: 'icp_brasil',
      title: 'Certificado digital ICP-Brasil',
      description: 'Solicite o certificado A3 gratuito do CFM ou utilize VIDaaS / BirdID / SafeID.',
      status: stage4,
    },
    {
      step: 5,
      key: 'signature_test',
      title: 'Prova de assinatura digital (RCE / RET)',
      description: 'Habilita receitas C1/C5, antimicrobianos e atestados com assinatura ICP-Brasil.',
      status: stage5,
    },
    {
      step: 6,
      key: 'sncr_b1_visa',
      title: 'Cota B1 na VISA / SNCR',
      description: 'Solicite numeração de Notificação de Receita B à Vigilância Sanitária da sua UF.',
      status: stage6,
    },
    {
      step: 7,
      key: 'b1_verified',
      title: 'Liberação para Notificação B1 (Azul)',
      description: 'Permite receber consultas de renovação e emitir psicotrópicos B1 com numeração SNCR.',
      status: stage7,
    },
  ];

  return {
    doctorId: params.doctorId,
    crm: {
      licenseNumber: params.licenseNumber,
      uf: params.ufBrazil,
      cfmValidated: params.cfmValidated,
    },
    profile: {
      hasCpf: params.hasCpf,
      hasBirthDate: params.hasBirthDate,
      professionalAddress: cleanAddress,
    },
    credentials: {
      memedLinkStatus,
      icpBrasilStatus,
      icpProvider,
      icpExpiresAt: row.icp_expires_at ?? null,
      sncrB1Status,
      sncrVisaUf,
      sncrVisaMunicipality: row.sncr_visa_municipality ?? null,
      sncrReviewNotes: row.sncr_review_notes ?? null,
    },
    capabilities: {
      canIssueSimpleRx,
      canIssueRceRetRx,
      canIssueControlledB1,
    },
    links: {
      cfmFreeCertificateUrl: CFM_FREE_CERTIFICATE_URL,
      anvisaSncrGuideUrl: ANVISA_SNCR_GUIDE_URL,
    },
    stages,
    completedStages: stages.filter((s) => s.status === 'verified').length,
    totalStages: stages.length,
  };
}
