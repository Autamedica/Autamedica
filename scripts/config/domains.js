/**
 * Canonical domain/source-of-truth config for production and local checks.
 * Keep all script-level hostnames here to avoid drift.
 */

const DOMAINS = Object.freeze({
  apex: 'autamedica.com',
  web: 'www.autamedica.com',
  authHub: 'www.autamedica.com',
  patients: 'patients.autamedica.com',
  doctors: 'doctors.autamedica.com',
  companies: 'companies.autamedica.com',
  admin: 'admin.autamedica.com',
});

const URLS = Object.freeze({
  apex: `https://${DOMAINS.apex}`,
  web: `https://${DOMAINS.web}`,
  authHub: `https://${DOMAINS.authHub}`,
  patients: `https://${DOMAINS.patients}`,
  doctors: `https://${DOMAINS.doctors}`,
  companies: `https://${DOMAINS.companies}`,
  admin: `https://${DOMAINS.admin}`,
  authLogin: `https://${DOMAINS.authHub}/auth/login`,
});

const LOCAL_URLS = Object.freeze({
  authHub: 'http://localhost:3000',
  doctors: 'http://localhost:3001',
  patients: 'http://localhost:3002',
  companies: 'http://localhost:3003',
  admin: 'http://localhost:3004',
});

const PAGES_TARGETS = Object.freeze({
  web: 'autamedica-web.pages.dev',
  webApp: 'autamedica-web-app.pages.dev',
  doctors: 'autamedica-doctors-az6.pages.dev',
  patients: 'autamedica-patients.pages.dev',
  companies: 'autamedica-companies-drl.pages.dev',
  admin: 'autamedica-admin-5r9.pages.dev',
});

const PORTAL_DOMAINS = Object.freeze([
  DOMAINS.doctors,
  DOMAINS.patients,
  DOMAINS.companies,
  DOMAINS.admin,
]);

const HEADER_AUDIT_DOMAINS = Object.freeze([
  DOMAINS.web,
  DOMAINS.doctors,
  DOMAINS.patients,
  DOMAINS.companies,
  DOMAINS.admin,
]);

function getAuthLoginUrl(role) {
  if (!role) {
    return `${URLS.authLogin}`;
  }

  const query = new URLSearchParams({ role });
  return `${URLS.authLogin}/?${query.toString()}`;
}

module.exports = Object.freeze({
  DOMAINS,
  URLS,
  LOCAL_URLS,
  PAGES_TARGETS,
  PORTAL_DOMAINS,
  HEADER_AUDIT_DOMAINS,
  getAuthLoginUrl,
});
