import { createHash } from 'crypto';

export interface RCTARegistrationResult {
  cuir: string;
  registrationId: string;
  timestamp: string;
  evidenceHash: string;
}

/**
 * RCTA (Registro Central de Trazabilidad de Actos) Service
 * Encapsulates the communication with the national registry for electronic prescriptions.
 * As per Ley 27.553, all prescriptions must be uniquely registered.
 */
export class RCTAService {
  private static readonly PREFIX = 'AR'; // National prefix for Argentina

  /**
   * Registers a clinical act (prescription) in the national registry.
   * Currently implements a bridge/simulator consistent with RCTA structural requirements.
   */
  async registerPrescription(
    doctorId: string,
    patientId: string,
    medicationIFA: string,
  ): Promise<RCTARegistrationResult> {
    // In a production environment with real credentials, this would be an API call to the Ministry of Health.
    // For now, we generate a valid-format CUIR and internal registration ID.
    
    const timestamp = new Date().toISOString();
    const nonce = Math.random().toString(36).substring(7);
    
    // Generate a structured CUIR: PREFIX-YYYYMMDD-HASH
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const hash = createHash('sha256')
      .update(`${doctorId}:${patientId}:${medicationIFA}:${timestamp}:${nonce}`)
      .digest('hex')
      .substring(0, 8)
      .toUpperCase();
      
    const cuir = `${RCTAService.PREFIX}-${dateStr}-${hash}`;
    
    // Create a deterministic registration evidence hash for audit
    const evidenceHash = createHash('sha256')
      .update(`${cuir}${timestamp}${nonce}`)
      .digest('hex');

    return {
      cuir,
      registrationId: `rcta_idx_${hash}`,
      timestamp,
      evidenceHash, // Added for enhanced traceability
    };
  }

  /**
   * Validates a CUIR against the registry.
   */
  async verifyCUIR(cuir: string): Promise<boolean> {
    // Structural validation for simulation
    return cuir.startsWith(RCTAService.PREFIX) && cuir.length > 15;
  }
}

export const rctaService = new RCTAService();
