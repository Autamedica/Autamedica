export interface RefepsValidationResult {
  isValid: boolean;
  matriculaNumber: string;
  matriculaType: 'MN' | 'MP';
  fullName?: string;
  specialty?: string;
  province?: string;
  source?: 'national_refeps_api' | 'local_database_fallback' | 'offline_mock';
  practitionerId?: string;
  qualifications?: Array<{
    text?: string;
    identifiers?: Array<{ system?: string; value?: string }>;
  }>;
  registrationStatus: 'active' | 'suspended' | 'revoked' | 'not_found';
}

export interface IRefepsValidator {
  validateMatricula(
    matricula: string,
    type: 'MN' | 'MP',
    province?: string
  ): Promise<RefepsValidationResult>;
}
