export type PublicLicense = {
  license_type?: string | null;
  license_number?: string | null;
};

export type PublicProfileViewData = {
  care_country: 'AR' | 'BR';
  bio?: string | null;
  years_experience?: number | null;
  public_profile_accepts_consultations?: boolean | null;
  public_profile_headline?: string | null;
  education?: unknown;
  certifications?: unknown;
  clinical_focus_areas?: unknown;
  professional_experience?: unknown;
  academic_activity?: unknown;
  uf_brazil?: string | null;
  rqe_number?: string | null;
  licenses?: unknown;
  testimonials?: unknown;
};

export type EditorialEntry = {
  title: string;
  institution?: string;
  period?: string;
  detail?: string;
};

const NAME_LOWERCASE_CONNECTORS = new Set([
  'da', 'de', 'do', 'dos', 'das', 'del', 'la', 'las', 'los', 'y', 'e',
]);

const PT_SPECIALTY_MAP: Record<string, string> = {
  'medicina general': 'Clínica Médica',
  'clinica medica': 'Clínica Médica',
  'clínica médica': 'Clínica Médica',
  'pediatria': 'Pediatria',
  'pediatría': 'Pediatria',
  'cardiologia': 'Cardiologia',
  'cardiología': 'Cardiologia',
  'psiquiatria': 'Psiquiatria',
  'psiquiatría': 'Psiquiatria',
  'dermatologia': 'Dermatologia',
  'dermatología': 'Dermatologia',
  'ginecologia': 'Ginecologia',
  'ginecología': 'Ginecologia',
  'traumatologia': 'Ortopedia e Traumatologia',
  'traumatología': 'Ortopedia e Traumatologia',
  'neurologia': 'Neurologia',
  'neurología': 'Neurologia',
  'oftalmologia': 'Oftalmologia',
  'oftalmología': 'Oftalmologia',
};

function objectEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value && typeof value === 'object' ? [value] : [];
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseDelimitedEditorialString(raw: string): EditorialEntry {
  const trimmed = raw.trim();
  const separator = trimmed.includes(' — ') ? ' — ' : trimmed.includes(' - ') ? ' - ' : null;
  if (!separator) return { title: trimmed };

  const parts = trimmed.split(separator).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { title: trimmed };
  if (parts.length === 2) {
    return { title: parts[0], institution: parts[1] };
  }
  return {
    title: parts[0],
    institution: parts.slice(1, -1).join(' — '),
    period: parts[parts.length - 1],
  };
}

export function formatDisplayName(firstName?: string | null, lastName?: string | null): string {
  const joined = [firstName, lastName]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(' ')
    .replace(/\s+/g, ' ');
  if (!joined) return '';

  const hasLowercase = /[a-záéíóúàèìòùâêîôûãõäëïöüçñ]/.test(joined);
  if (hasLowercase) return joined;

  return joined
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('es-AR');
      if (index > 0 && NAME_LOWERCASE_CONNECTORS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('es-AR') + lower.slice(1);
    })
    .join(' ');
}

export function formatSpecialtyLabel(specialty?: string | null, isPortuguese = false): string {
  const clean = typeof specialty === 'string' ? specialty.trim() : '';
  if (!clean || !isPortuguese) return clean;
  const mapped = PT_SPECIALTY_MAP[clean.toLocaleLowerCase('es-AR')];
  return mapped ?? clean;
}

export function dedupeCertificationsAgainstFocus(
  certifications: EditorialEntry[],
  clinicalFocusAreas: string[],
): EditorialEntry[] {
  if (!certifications.length || !clinicalFocusAreas.length) return certifications;
  const normalizedFocus = new Set(
    clinicalFocusAreas.map((area) => area.trim().toLocaleLowerCase('es-AR')),
  );
  return certifications.filter((entry) => {
    const normalizedTitle = entry.title.trim().toLocaleLowerCase('es-AR');
    return Boolean(entry.institution || entry.period || entry.detail || !normalizedFocus.has(normalizedTitle));
  });
}

export function shouldShowConsultationCta(profile: PublicProfileViewData): boolean {
  return profile.public_profile_accepts_consultations !== false;
}

export function toEditorialEntries(value: unknown): EditorialEntry[] {
  return objectEntries(value).flatMap((item): EditorialEntry[] => {
    if (typeof item === 'string') {
      const title = item.trim();
      return title ? [parseDelimitedEditorialString(title)] : [];
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];

    const record = item as Record<string, unknown>;
    const title = firstString(record, ['title', 'name', 'degree', 'program', 'position', 'role', 'course']);
    const institution = firstString(record, ['institution', 'university', 'organization', 'hospital', 'employer', 'issuer']);
    const period = firstString(record, ['period', 'year', 'date', 'dates']);
    const detail = firstString(record, ['description', 'detail', 'specialty', 'focus']);
    if (!title && !institution && !detail) return [];
    return [{ title: title || institution || detail, institution: institution || undefined, period: period || undefined, detail: detail || undefined }];
  });
}

export function toStringEntries(value: unknown): string[] {
  return objectEntries(value).flatMap((item): string[] => {
    if (typeof item === 'string' && item.trim()) return [item.trim()];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const value = firstString(item as Record<string, unknown>, ['title', 'name', 'label', 'focus', 'description']);
      return value ? [value] : [];
    }
    return [];
  });
}

export function getPublicProfileCredentials(profile: PublicProfileViewData): {
  licenses: string[];
  rqe: string;
  verified: boolean;
} {
  const source = objectEntries(profile.licenses);
  const licenses = source.flatMap((entry): string[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as PublicLicense;
    const type = typeof row.license_type === 'string' ? row.license_type.trim().toUpperCase() : '';
    const number = typeof row.license_number === 'string' ? row.license_number.trim() : '';
    if (!number) return [];
    if (profile.care_country === 'BR' && type === 'CRM') {
      const uf = typeof profile.uf_brazil === 'string' ? profile.uf_brazil.trim().toUpperCase() : '';
      return [uf ? 'CRM/' + uf + ' ' + number : 'CRM ' + number];
    }
    if (profile.care_country === 'AR' && (type === 'MN' || type === 'MP')) {
      return [type + ' ' + number];
    }
    return [];
  });
  return {
    licenses,
    rqe: profile.care_country === 'BR' && typeof profile.rqe_number === 'string'
      ? profile.rqe_number.trim()
      : '',
    verified: licenses.length > 0,
  };
}

export function getVisibleProfileSections(profile: PublicProfileViewData): {
  practice: boolean;
  education: boolean;
  experience: boolean;
  academic: boolean;
  verification: boolean;
} {
  return {
    practice: Boolean(
      (typeof profile.bio === 'string' && profile.bio.trim())
      || toStringEntries(profile.clinical_focus_areas).length,
    ),
    education: toEditorialEntries(profile.education).length > 0
      || toEditorialEntries(profile.certifications).length > 0,
    experience: (typeof profile.years_experience === 'number' && profile.years_experience > 0)
      || toEditorialEntries(profile.professional_experience).length > 0,
    academic: toEditorialEntries(profile.academic_activity).length > 0,
    verification: getPublicProfileCredentials(profile).verified,
  };
}


export type PublicTestimonial = {
  comment: string;
  created_at?: string;
};

export function toVerifiedTestimonials(value: unknown): PublicTestimonial[] {
  return objectEntries(value).flatMap((item): PublicTestimonial[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const comment = typeof record.comment === 'string' ? record.comment.trim() : '';
    if (!comment) return [];
    return [{
      comment,
      created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    }];
  });
}

export function isTestimonialsEnabled(
  country: 'AR' | 'BR',
  flags: Partial<Record<'AR' | 'BR', boolean>>,
): boolean {
  return flags[country] === true;
}

export function shouldShowTestimonials(
  profile: PublicProfileViewData,
  flags: Partial<Record<'AR' | 'BR', boolean>>,
): boolean {
  return isTestimonialsEnabled(profile.care_country, flags)
    && toVerifiedTestimonials(profile.testimonials).length > 0;
}
