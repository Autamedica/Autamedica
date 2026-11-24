export type PublicLicense = {
  license_type?: string | null;
  license_number?: string | null;
};

export type PublicProfileViewData = {
  care_country: 'AR' | 'BR';
  bio?: string | null;
  years_experience?: number | null;
  education?: unknown;
  certifications?: unknown;
  clinical_focus_areas?: unknown;
  professional_experience?: unknown;
  academic_activity?: unknown;
  uf_brazil?: string | null;
  rqe_number?: string | null;
  licenses?: unknown;
};

export type EditorialEntry = {
  title: string;
  institution?: string;
  period?: string;
  detail?: string;
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

export function toEditorialEntries(value: unknown): EditorialEntry[] {
  return objectEntries(value).flatMap((item): EditorialEntry[] => {
    if (typeof item === 'string') {
      const title = item.trim();
      return title ? [{ title }] : [];
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
