export interface RefepsValidationResult {
  isValid: boolean;
  matriculaNumber: string;
  matriculaType: 'MN' | 'MP';
  fullName?: string;
  specialty?: string;
  province?: string;
  registrationStatus: 'active' | 'suspended' | 'revoked' | 'not_found';
}

export interface IRefepsValidator {
  validateMatricula(
    matricula: string,
    type: 'MN' | 'MP',
    province?: string
  ): Promise<RefepsValidationResult>;
}
