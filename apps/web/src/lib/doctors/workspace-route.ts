export const DOCTOR_DASHBOARD_PATH = '/doctors/dashboard'
export const DOCTOR_PATIENTS_PATH = '/doctors/patients'

export type DoctorWorkspaceTab = 'patient-info' | 'medical-history' | 'prescriptions' | 'vital-signs' | 'ai-history'

export function buildDoctorPatientWorkspaceUrl(patientId: string, tab: DoctorWorkspaceTab = 'patient-info'): string {
  const url = new URL(DOCTOR_DASHBOARD_PATH, 'https://www.autamedica.com')
  url.searchParams.set('section', 'patients')
  url.searchParams.set('patientId', patientId)

  if (tab !== 'patient-info') {
    url.searchParams.set('tab', tab)
  }

  return `${url.pathname}${url.search}`
}

export function buildDoctorPatientsListUrl(): string {
  return DOCTOR_PATIENTS_PATH
}
