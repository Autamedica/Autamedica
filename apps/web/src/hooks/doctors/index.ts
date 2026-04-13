/**
 * Barrel export para todos los hooks médicos
 */

// Patient data hooks
export { usePatientData } from './usePatientData'
export { useMedicalHistory } from './useMedicalHistory'
export { usePrescriptions } from './usePrescriptions'
export { usePrescriptionsCore } from './usePrescriptionsCore'
export { useVitalSigns } from './useVitalSigns'
export { useRealPatients } from './useRealPatients'

// Doctor hooks
export { useAuthenticatedUser } from './useAuthenticatedUser'
export { useRealDoctors, useCurrentDoctor, useDoctorsBySpecialty } from './useRealDoctors'
export { useCheckDoctorExists } from './useCheckDoctorExists'
export { useDoctorStats } from './useDoctorStats'
export { useSubscription } from './useSubscription'

// AI & Analysis
export { useAIAnalysis } from './useAIAnalysis'

// Telemedicine
export { useTelemedicineSignaling } from './useTelemedicineSignaling'

// UI / Layout
export { useClock } from './useClock'
export { useDoctorWorkspaceState } from './useDoctorWorkspaceState'
export { useSidebar } from './useSidebar'
