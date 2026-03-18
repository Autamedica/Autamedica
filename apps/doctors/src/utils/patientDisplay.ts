type PatientNameCandidate = {
  first_name?: string | null
  last_name?: string | null
  firstName?: string | null
  lastName?: string | null
}

export function getPatientDisplayName(patient: unknown): string {
  if (!patient || typeof patient !== 'object') {
    return 'Paciente'
  }

  const candidate = patient as PatientNameCandidate
  const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim()
    || [candidate.firstName, candidate.lastName].filter(Boolean).join(' ').trim()

  return fullName || 'Paciente'
}
