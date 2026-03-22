'use server';

import { redirect } from 'next/navigation';

/**
 * @deprecated Use the OnboardingWizard component with /api/profile PATCH instead.
 * Kept for backwards compatibility.
 */

export interface PatientOnboardingData {
  birthDate: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  bloodType?: string;
  heightCm?: number;
  weightKg?: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
}

export async function completePatientOnboarding(
  _data: PatientOnboardingData
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Use the new onboarding wizard instead' };
}

export async function skipOnboarding(): Promise<void> {
  redirect('/');
}
