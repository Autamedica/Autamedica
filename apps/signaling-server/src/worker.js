/**
 * Minimal Cloudflare Worker entrypoint for signaling service.
 *
 * This worker intentionally exposes health and metadata endpoints only.
 * Real-time signaling is served by the Node/Socket.IO service in this package.
 */
/** @typedef {{ SIGNALING_API_KEY?: string; SIGNALING_MODE?: string }} WorkerEnv */

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-signaling-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

/**
 * @param {Request} request
 * @param {WorkerEnv} env
 */
function hasInternalAccess(request, env) {
  const expected = env.SIGNALING_API_KEY;
  if (!expected) return true;

  const provided =
    request.headers.get('x-signaling-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  return provided === expected;
}

/** @type {{ fetch(request: Request, env: WorkerEnv): Promise<Response> }} */
const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = getCorsHeaders(request.headers.get('origin'));

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health') {
      return json(
        {
          status: 'ok',
          service: 'autamedica-http-signaling-server',
          mode: env.SIGNALING_MODE || 'http',
          timestamp: new Date().toISOString()
        },
        200,
        cors
      );
    }

    if (url.pathname === '/api/internal/status') {
      if (!hasInternalAccess(request, env)) {
        return json({ error: 'Unauthorized' }, 401, cors);
      }

      return json(
        {
          ok: true,
          protected: true,
          hasApiKey: Boolean(env.SIGNALING_API_KEY)
        },
        200,
        cors
      );
    }

    if (url.pathname === '/' || url.pathname === '/connect' || url.pathname === '/signaling') {
      return json(
        {
          error: 'Signaling is handled by the Node service',
          documentation: 'Use apps/signaling-server/src/server.ts deployment target'
        },
        410,
        cors
      );
    }

    return json({ error: 'Not found' }, 404, cors);
  }
};

export default worker;
