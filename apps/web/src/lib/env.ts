/**
 * Utilidades de entorno para apps/web (Astro).
 * Usa import.meta.env en lugar de process.env.
 */

type AppTarget = 'patients' | 'doctors' | 'companies' | 'admin';

const BASE_URLS: Record<AppTarget, string> = {
  doctors: 'https://doctors.autamedica.com',
  patients: 'https://patients.autamedica.com',
  companies: 'https://companies.autamedica.com',
  admin: 'https://admin.autamedica.com'
};

const ROUTE_TO_APP: Array<[string, AppTarget]> = [
  ['/doctors', 'doctors'],
  ['/patients', 'patients'],
  ['/companies', 'companies']
];

export function getAppUrl(path: string = '', app?: AppTarget): string {
  if (app) {
    return BASE_URLS[app] + path;
  }

  for (const [route, target] of ROUTE_TO_APP) {
    if (path.startsWith(route)) {
      return BASE_URLS[target] + path;
    }
  }

  return path;
}
