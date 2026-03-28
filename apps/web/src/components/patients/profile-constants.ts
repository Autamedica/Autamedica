export const GENDER_OPTIONS = [
  { value: '', label: 'Seleccionar' },
  { value: 'female', label: 'Femenino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Otro' },
  { value: 'prefer_not_to_say', label: 'Prefiero no decirlo' },
] as const;

export const BLOOD_TYPE_OPTIONS = [
  { value: '', label: 'Seleccionar' },
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
] as const;

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Sin actualizaciones recientes';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin actualizaciones recientes';
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatCompactDate(value: string | null): string {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function getCompletionTone(value: number): string {
  if (value >= 85) return 'text-emerald-600';
  if (value >= 60) return 'text-sky-600';
  return 'text-amber-600';
}
