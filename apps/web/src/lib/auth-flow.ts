import { isValidUserRole, resolveRoleFromPortal } from '@autamedica/shared';
import type { UserRole } from '@autamedica/shared';
import { getAppBaseUrl } from './env';

export type EntryRole = 'patient' | 'doctor' | 'company_admin';
export type EntryPortal = 'patients' | 'doctors' | 'companies';
export type AuthPage = 'login' | 'register' | 'select-role';

export interface RoleEntry {
  role: EntryRole;
  portal: EntryPortal;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
}

export const ROLE_ENTRIES: readonly RoleEntry[] = [
  {
    role: 'patient',
    portal: 'patients',
    label: 'Paciente',
    shortLabel: 'Paciente',
    description: 'Agenda turnos y revisa tu historial',
    accent: 'var(--portal-patients)',
  },
  {
    role: 'doctor',
    portal: 'doctors',
    label: 'Médico',
    shortLabel: 'Médico',
    description: 'Gestiona agenda, consultas y pacientes',
    accent: 'var(--portal-doctors)',
  },
  {
    role: 'company_admin',
    portal: 'companies',
    label: 'Empresa',
    shortLabel: 'Empresa',
    description: 'Controla la salud corporativa del equipo',
    accent: 'var(--portal-companies)',
  },
] as const;

function isEntryRole(role: string): role is EntryRole {
  return role === 'patient' || role === 'doctor' || role === 'company_admin';
}

function normalizeRole(role: string | null | undefined): EntryRole | undefined {
  if (!role) {
    return undefined;
  }

  if (role === 'company') {
    return 'company_admin';
  }

  if (isValidUserRole(role) && isEntryRole(role)) {
    return role;
  }

  return undefined;
}

function parseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function sanitizeReturnTo(returnTo: string | null | undefined): string | undefined {
  if (!returnTo) {
    return undefined;
  }

  const trimmed = returnTo.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  const absolute = parseAbsoluteUrl(trimmed);
  if (!absolute) {
    return undefined;
  }

  if (absolute.protocol !== 'https:' && absolute.protocol !== 'http:') {
    return undefined;
  }

  return absolute.toString();
}

export function resolveEntryRoleFromParams(params: URLSearchParams): EntryRole | undefined {
  const roleFromQuery = normalizeRole(params.get('role'));
  if (roleFromQuery) {
    return roleFromQuery;
  }

  const portal = params.get('portal');
  if (!portal) {
    return undefined;
  }

  const roleFromPortal = resolveRoleFromPortal(portal.toLowerCase());
  return normalizeRole(roleFromPortal ?? undefined);
}

export function resolvePortalFromRole(role: EntryRole): EntryPortal {
  return role === 'company_admin' ? 'companies' : `${role}s` as EntryPortal;
}

export function getRoleEntry(role: EntryRole): RoleEntry {
  const entry = ROLE_ENTRIES.find((item) => item.role === role);
  if (!entry) {
    throw new Error(`Unknown role entry: ${role}`);
  }
  return entry;
}

export function getDefaultReturnTo(role: EntryRole): string {
  return getAppBaseUrl(resolvePortalFromRole(role));
}

interface BuildAuthPathOptions {
  role?: EntryRole;
  portal?: EntryPortal;
  returnTo?: string | null;
}

export function buildAuthPath(page: AuthPage, options: BuildAuthPathOptions = {}): string {
  const params = new URLSearchParams();
  const role = options.role;
  const portal = options.portal ?? (role ? resolvePortalFromRole(role) : undefined);
  const returnTo = sanitizeReturnTo(options.returnTo);

  if (role) {
    params.set('role', role);
  }
  if (portal) {
    params.set('portal', portal);
  }
  if (returnTo) {
    params.set('returnTo', returnTo);
  }

  const query = params.toString();
  return query ? `/auth/${page}?${query}` : `/auth/${page}`;
}

export function buildRoleAuthPath(
  page: Exclude<AuthPage, 'select-role'>,
  role: EntryRole,
  returnTo?: string | null
): string {
  return buildAuthPath(page, {
    role,
    portal: resolvePortalFromRole(role),
    returnTo: returnTo ?? getDefaultReturnTo(role),
  });
}

export function getRoleFromUserMetadata(metadataRole: unknown): EntryRole | undefined {
  if (typeof metadataRole !== 'string') {
    return undefined;
  }
  return normalizeRole(metadataRole);
}

export function getEntryRolesForUi(currentRole?: EntryRole): Array<RoleEntry & { isCurrent: boolean }> {
  return ROLE_ENTRIES.map((entry) => ({
    ...entry,
    isCurrent: entry.role === currentRole,
  }));
}

export function normalizeRoleFromUnknown(role: unknown): EntryRole | undefined {
  return typeof role === 'string' ? normalizeRole(role as UserRole) : undefined;
}
