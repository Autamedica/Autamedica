import { expect, test } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';

function parseLocationHeader(location: string | undefined): URL {
  if (!location) {
    throw new Error('Missing location header');
  }
  return new URL(location, BASE_URL);
}

test.describe('Astro Bridge Routing', () => {
  test('returns 301 for stable legacy aliases', async ({ request }) => {
    const cases: Array<{ from: string; to: string }> = [
      { from: '/web-app', to: '/platform' },
      { from: '/webapp', to: '/platform' },
      { from: '/company', to: '/companies' },
      { from: '/portal/patients', to: '/patients' },
      { from: '/portal/doctors', to: '/doctors' },
      { from: '/portal/companies', to: '/companies' },
    ];

    for (const item of cases) {
      const response = await request.get(item.from, { maxRedirects: 0 });
      expect(response.status(), `status for ${item.from}`).toBe(301);
      const location = parseLocationHeader(response.headers().location);
      expect(location.pathname, `location for ${item.from}`).toBe(item.to);
    }
  });

  test('preserves path and query on stable 301 redirects', async ({ request }) => {
    const cases: Array<{ from: string; toPath: string; query: string }> = [
      { from: '/web-app/dashboard?src=legacy', toPath: '/platform/dashboard', query: 'src=legacy' },
      { from: '/webapp/settings?tab=1', toPath: '/platform/settings', query: 'tab=1' },
      { from: '/company/reports?m=1', toPath: '/companies/reports', query: 'm=1' },
      { from: '/app/hub?from=old', toPath: '/platform/hub', query: 'from=old' },
    ];

    for (const item of cases) {
      const response = await request.get(item.from, { maxRedirects: 0 });
      expect(response.status(), `status for ${item.from}`).toBe(301);
      const location = parseLocationHeader(response.headers().location);
      expect(location.pathname, `path for ${item.from}`).toBe(item.toPath);
      expect(location.searchParams.toString(), `query for ${item.from}`).toBe(item.query);
    }
  });

  test('redirects non-owned bridge subroutes to login with portal context', async ({ request }) => {
    const cases: Array<{ path: string; portal: string }> = [
      { path: '/patients/legacy-zone', portal: 'patients' },
      { path: '/doctors/legacy-zone', portal: 'doctors' },
      { path: '/companies/legacy-zone', portal: 'companies' },
      { path: '/admin/legacy-zone', portal: 'admin' },
    ];

    for (const item of cases) {
      const response = await request.get(item.path, { maxRedirects: 0 });
      expect(response.status(), `status for ${item.path}`).toBe(302);

      const location = parseLocationHeader(response.headers().location);
      expect(location.pathname, `login path for ${item.path}`).toBe('/auth/login');
      expect(location.searchParams.get('portal'), `portal for ${item.path}`).toBe(item.portal);
      expect(location.searchParams.get('returnTo'), `returnTo for ${item.path}`).toBe(item.path);
    }
  });

  test('redirects owned protected Astro subroutes to login with portal context', async ({ request }) => {
    const ownedRoutes: Array<{ path: string; portal: string }> = [
      { path: '/patients/appointments', portal: 'patients' },
      { path: '/patients/history', portal: 'patients' },
      { path: '/patients/prevention', portal: 'patients' },
      { path: '/doctors/agenda', portal: 'doctors' },
      { path: '/doctors/consultations', portal: 'doctors' },
      { path: '/doctors/patients', portal: 'doctors' },
      { path: '/companies/crisis', portal: 'companies' },
      { path: '/companies/marketplace', portal: 'companies' },
      { path: '/companies/reports', portal: 'companies' },
    ];

    for (const item of ownedRoutes) {
      const response = await request.get(item.path, { maxRedirects: 0 });
      expect(response.status(), `status for ${item.path}`).toBe(302);

      const location = parseLocationHeader(response.headers().location);
      expect(location.pathname, `login path for ${item.path}`).toBe('/auth/login');
      expect(location.searchParams.get('portal'), `portal for ${item.path}`).toBe(item.portal);
      expect(location.searchParams.get('returnTo'), `returnTo for ${item.path}`).toBe(item.path);
    }
  });
});
