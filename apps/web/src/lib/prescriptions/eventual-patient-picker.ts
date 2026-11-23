export interface EventualPatientRecord {
  patientId: string;
  fullName: string | null;
  dni: string | null;
  documentType: string | null;
  birthDate: string | null;
  gender: string | null;
  contact: string | null;
}

export interface SelectablePrescriptionPatient {
  id: string;
  user_id?: string | null;
  dni?: string | null;
  documentType?: string | null;
  isEventual?: boolean;
  contact?: string | null;
  profile?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    external_id?: string | null;
  } | null;
}

function normalizeSearch(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function compactPatientId(id: string | null | undefined): string {
  return id ? id.slice(0, 8).toUpperCase() : 'SIN-ID';
}

export function formatBrazilCpf(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return (raw ?? '').trim();
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function mapEventualPatientToSelectable(
  item: EventualPatientRecord,
): SelectablePrescriptionPatient | null {
  const patientId = typeof item.patientId === 'string' ? item.patientId.trim() : '';
  if (!patientId) return null;

  const trimmedName = (item.fullName ?? '').trim().replace(/\s+/g, ' ');
  const parts = trimmedName ? trimmedName.split(' ') : [];
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  const contact = (item.contact ?? '').trim() || null;
  const isEmail = Boolean(contact && contact.includes('@'));
  const docNumber = (item.dni ?? '').trim() || null;
  const documentType = (item.documentType ?? '').trim().toUpperCase() || null;

  return {
    id: patientId,
    user_id: null,
    dni: docNumber,
    documentType,
    isEventual: true,
    contact,
    profile: {
      first_name: firstName,
      last_name: lastName,
      email: isEmail ? contact : null,
      phone: !isEmail ? contact : null,
    },
  };
}

export function mergePrescriptionPatients(
  platformPatients: readonly SelectablePrescriptionPatient[],
  eventualPatients: readonly EventualPatientRecord[],
): SelectablePrescriptionPatient[] {
  const merged: SelectablePrescriptionPatient[] = [];
  const indexById = new Map<string, number>();

  for (const item of eventualPatients) {
    const mapped = mapEventualPatientToSelectable(item);
    if (!mapped || indexById.has(mapped.id)) continue;
    indexById.set(mapped.id, merged.length);
    merged.push(mapped);
  }

  for (const patient of platformPatients) {
    const existingIndex = indexById.get(patient.id);
    if (existingIndex === undefined) {
      indexById.set(patient.id, merged.length);
      merged.push(patient);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...patient,
      ...existing,
      dni: existing.dni || patient.dni || null,
      documentType: existing.documentType || patient.documentType || null,
      contact: existing.contact || patient.profile?.phone || patient.profile?.email || null,
      profile: {
        ...patient.profile,
        first_name: existing.profile?.first_name || patient.profile?.first_name || null,
        last_name: existing.profile?.last_name || patient.profile?.last_name || null,
        email: existing.profile?.email || patient.profile?.email || null,
        phone: existing.profile?.phone || patient.profile?.phone || null,
        external_id: existing.profile?.external_id || patient.profile?.external_id || null,
      },
    };
  }

  return merged;
}

export function getSelectablePatientDisplayName(patient: SelectablePrescriptionPatient): string {
  const fullName = [patient.profile?.first_name, patient.profile?.last_name]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');

  if (fullName) return fullName;
  if (patient.profile?.email) return patient.profile.email;
  if (patient.profile?.phone) return patient.profile.phone;
  if (patient.dni) {
    return patient.documentType === 'CPF'
      ? `CPF ${formatBrazilCpf(patient.dni)}`
      : `DNI ${patient.dni}`;
  }
  return `Paciente ${compactPatientId(patient.id)}`;
}

export function getSelectablePatientSecondaryLabel(patient: SelectablePrescriptionPatient): string {
  if (patient.dni) {
    if (patient.documentType === 'CPF') return `CPF ${formatBrazilCpf(patient.dni)}`;
    return `DNI ${patient.dni}`;
  }
  if (patient.profile?.phone && patient.profile?.email) return patient.profile.phone;
  if (patient.profile?.external_id) return patient.profile.external_id;
  return `ID ${compactPatientId(patient.id)}`;
}

export function matchesSelectablePatientSearch(
  patient: SelectablePrescriptionPatient,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;

  const digitsQuery = normalizedQuery.replace(/\D/g, '');
  const rawDocument = patient.dni ?? '';
  const digitsDocument = rawDocument.replace(/\D/g, '');
  const formattedCpf = patient.documentType === 'CPF' ? formatBrazilCpf(rawDocument) : '';

  const haystack = [
    getSelectablePatientDisplayName(patient),
    getSelectablePatientSecondaryLabel(patient),
    patient.profile?.first_name,
    patient.profile?.last_name,
    patient.profile?.email,
    patient.profile?.phone,
    patient.profile?.external_id,
    rawDocument,
    digitsDocument,
    formattedCpf,
    patient.contact,
    patient.user_id,
    patient.id,
  ]
    .map(normalizeSearch)
    .filter(Boolean)
    .join(' ');

  if (haystack.includes(normalizedQuery)) return true;
  if (digitsQuery.length >= 3 && digitsDocument && digitsDocument.includes(digitsQuery)) {
    return true;
  }
  return false;
}
