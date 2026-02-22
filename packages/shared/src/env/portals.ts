// Portal system utilities
export function getPortalForRole(role: string): string {
  const portals: Record<string, string> = {
    patient: 'patients',
    doctor: 'doctors',
    company_admin: 'companies',
    company: 'companies',
    platform_admin: 'admin',
    admin: 'admin'
  };
  return portals[role] || 'web-app';
}

export function getPortalUrlWithPath(portal: string, path: string): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    const portMap: Record<string, string> = {
      patients: 'http://localhost:3002',
      doctors: 'http://localhost:3001',
      companies: 'http://localhost:3003',
      admin: 'http://localhost:3004'
    };
    const baseUrl = portMap[portal] || 'http://localhost:3000';
    return baseUrl + path;
  }

  const prodMap: Record<string, string> = {
    patients: 'https://patients.autamedica.com',
    doctors: 'https://doctors.autamedica.com',
    companies: 'https://companies.autamedica.com',
    admin: 'https://admin.autamedica.com'
  };

  const baseUrl = prodMap[portal] || 'https://www.autamedica.com';
  return baseUrl + path;
}

export function isCorrectPortal(currentPortal: string, requiredPortal: string): boolean {
  return currentPortal === requiredPortal;
}

export function getRoleForPortal(portal: string): string {
  const roleMap: Record<string, string> = {
    patients: 'patient',
    doctors: 'doctor',
    companies: 'company_admin',
    admin: 'platform_admin'
  };
  return roleMap[portal] || 'patient';
}
