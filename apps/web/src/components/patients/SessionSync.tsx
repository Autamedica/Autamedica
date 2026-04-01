'use client';

import { useSessionSync } from '@/hooks/patients/useSessionSync';
import { usePatientSession } from '@/hooks/patients/usePatientSession';
import { IncomingCallHandler } from '@/components/patients/calls/IncomingCallHandler';

export function SessionSync() {
  useSessionSync();
  const { patient, profile } = usePatientSession();

  if (!patient?.id) return null;

  return <IncomingCallHandler patientId={patient.id} patientName={profile?.first_name || 'Paciente'} />;
}
