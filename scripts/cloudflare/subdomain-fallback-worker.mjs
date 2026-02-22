const TARGET_BY_HOST = {
  'doctors.autamedica.com': 'https://autamedica-doctors-az6.pages.dev',
  'companies.autamedica.com': 'https://autamedica-companies-drl.pages.dev',
  'admin.autamedica.com': 'https://autamedica-admin-5r9.pages.dev',
};

const subdomainFallbackWorker = {
  async fetch(request) {
    const url = new URL(request.url);
    const targetBase = TARGET_BY_HOST[url.hostname];

    if (!targetBase) {
      return new Response('Host not configured', { status: 404 });
    }

    const destination = new URL(url.pathname + url.search, targetBase);
    return Response.redirect(destination.toString(), 302);
  },
};

export default subdomainFallbackWorker;
