export interface CoverageResult {
  hasCoverage: boolean;
  planName?: string;
  coveragePercentage?: number;
  requiresAuthorization: boolean;
}

export interface IInsuranceCoverageService {
  validateCoverage(
    insuranceProvider: string,
    memberNumber: string
  ): Promise<CoverageResult>;
  calculateCopay(
    medication: string,
    insuranceProvider: string,
    memberNumber: string
  ): Promise<{ copayAmount: number; currency: string }>;
}
