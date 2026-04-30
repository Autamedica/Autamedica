/**
 * Lakaut Service
 *
 * Integration with Lakaut (Argentine Licensed CA) for Cloud Digital Signature.
 * Used for Phase 3: Licensed PAdES signatures on prescriptions.
 */
import { logger } from "@autamedica/shared";

export interface LakautSignRequest {
  pdfHash: string;
  certificateId: string;
  reason?: string;
  location?: string;
}

export interface LakautSignResponse {
  signatureValue: string; // The hex/base64 signature block
  success: boolean;
  error?: string;
}

export interface LakautOnboardingRequest {
  doctorId: string;
  fullName: string;
  dni: string;
  licenseNumber: string;
  email: string;
}

/**
 * Signs a PDF hash using Lakaut Cloud Signature API.
 * This is used for remote signing without requiring the P12 to be stored in our DB.
 */
export async function signWithLakaut(
  request: LakautSignRequest,
): Promise<LakautSignResponse> {
  logger.info("[lakaut] Requesting remote signature", {
    certificateId: request.certificateId,
  });

  // TODO: [PHASE-3-LAKAUT] Implement real API call to Lakaut REST Gateway (KiaDoc/RemoteSign)
  // 1. Authenticate with Lakaut API Key
  // 2. POST /v1/sign { hash, certId, ... }
  // 3. Handle OTP/Push notification to doctor if required by Lakaut

  return {
    success: false,
    error:
      "Integración con Lakaut en desarrollo. Usar fallback electronic_simple.",
    signatureValue: "",
  };
}

/**
 * Initiates the onboarding process for a doctor to get a Lakaut certificate.
 * This triggers a workflow where Lakaut contacts the doctor for identity validation.
 */
export async function startLakautOnboarding(
  request: LakautOnboardingRequest,
): Promise<{ requestId: string }> {
  logger.info("[lakaut] Starting onboarding for doctor", {
    doctorId: request.doctorId,
  });

  // TODO: [PHASE-3-LAKAUT] Implement API call to Lakaut onboarding endpoint

  return {
    requestId: "LAK-" + Math.random().toString(36).substring(7).toUpperCase(),
  };
}

/**
 * Checks the status of a Lakaut certificate request.
 */
export async function checkCertificateStatus(
  _requestId: string,
): Promise<"pending" | "issued" | "rejected"> {
  // TODO: [PHASE-3-LAKAUT] Check Lakaut API for request status
  return "pending";
}
