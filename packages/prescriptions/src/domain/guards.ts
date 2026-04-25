import type { DoctorId, PatientId } from '@autamedica/types';
import type { PrescriptionDraft } from './models';
import type { IRenpreValidator } from './renpre.ports';
import type { IConsentRepository } from './consent.ports';

export type DrugCategory = 'narcotic' | 'psychotropic' | 'default';

const NARCOTIC_KEYWORDS = [
  'morfina', 'fentanilo', 'fentanyl', 'metadona', 'oxicodona',
  'buprenorfina', 'metilfenidato', 'methylphenidate',
  'lisdexanfetamina', 'lisdexamfetamine', 'anfetamina', 'amphetamine',
];

const PSYCHOTROPIC_KEYWORDS = [
  'clonazepam', 'diazepam', 'lorazepam', 'alprazolam', 'midazolam',
  'zolpidem', 'zopiclona', 'pregabalina', 'gabapentina',
  'tramadol', 'codeína', 'codeina',
];

export function classifyDrug(items: PrescriptionDraft['items']): DrugCategory {
  const allNames = items
    .map((i) => `${i.genericName} ${i.commercialName ?? ''}`.toLowerCase())
    .join(' ');

  if (NARCOTIC_KEYWORDS.some((kw) => allNames.includes(kw))) return 'narcotic';
  if (PSYCHOTROPIC_KEYWORDS.some((kw) => allNames.includes(kw))) return 'psychotropic';
  return 'default';
}

export const PRESCRIPTION_BLOCK_CODES = {
  RENPRE_NOT_VERIFIED: 'RENPRE_NOT_VERIFIED',
  AC_SIGNATURE_REQUIRED: 'AC_SIGNATURE_REQUIRED',
  CONSENT_PSYCHIATRY_MISSING: 'CONSENT_PSYCHIATRY_MISSING',
  CONSENT_TELEMEDICINE_MISSING: 'CONSENT_TELEMEDICINE_MISSING',
} as const;

export type PrescriptionBlockCode =
  typeof PRESCRIPTION_BLOCK_CODES[keyof typeof PRESCRIPTION_BLOCK_CODES];

export class PrescriptionBlockedError extends Error {
  constructor(
    public readonly code: PrescriptionBlockCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(`Prescription blocked: ${code}`);
    this.name = 'PrescriptionBlockedError';
  }
}

export interface GuardContext {
  doctorId: DoctorId;
  patientId: PatientId;
  draft: PrescriptionDraft;
  doctorHasAcSignature: boolean;
}

export class PrescriptionGuards {
  constructor(
    private readonly renpre: IRenpreValidator,
    private readonly consents: IConsentRepository,
  ) {}

  async assertCanPrescribe(ctx: GuardContext): Promise<{ drugCategory: DrugCategory }> {
    const drugCategory = classifyDrug(ctx.draft.items);
    const isControlled = drugCategory !== 'default';

    if (!(await this.consents.isActive(ctx.patientId, 'telemedicine'))) {
      throw new PrescriptionBlockedError(PRESCRIPTION_BLOCK_CODES.CONSENT_TELEMEDICINE_MISSING);
    }

    if (isControlled) {
      if (!(await this.consents.isActive(ctx.patientId, 'psychiatry_controlled'))) {
        throw new PrescriptionBlockedError(PRESCRIPTION_BLOCK_CODES.CONSENT_PSYCHIATRY_MISSING, {
          drugCategory,
        });
      }

      if (!(await this.renpre.isVerified(ctx.doctorId))) {
        throw new PrescriptionBlockedError(PRESCRIPTION_BLOCK_CODES.RENPRE_NOT_VERIFIED, {
          drugCategory,
        });
      }

      if (drugCategory === 'narcotic' && !ctx.doctorHasAcSignature) {
        throw new PrescriptionBlockedError(PRESCRIPTION_BLOCK_CODES.AC_SIGNATURE_REQUIRED, {
          drugCategory,
        });
      }
    }

    return { drugCategory };
  }
}
