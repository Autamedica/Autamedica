import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, forbidden, internalError, badRequest } from '@/lib/api-helpers';
import { withAuth, isAuthed } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { UptimeService } from '@/lib/admin/services/uptime.service';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuth(request);
    if (!isAuthed(auth)) return auth;

    createAstroAdminClient(locals.runtime?.env);
    
    // Simple check if user is admin
    const role = (auth.user.user_metadata as Record<string, unknown>)?.role;
    const isAdmin = typeof role === 'string' && ['admin', 'organization_admin', 'platform_admin'].includes(role);
    
    if (!isAdmin) return forbidden();

    const body = await request.json();
    
    if (!body.title || !body.start || !body.end) {
      return badRequest('Missing required fields');
    }

    const result = await UptimeService.scheduleMaintenance(body);
    return jsonOk(result);
  } catch (error) {
    logger.error('[maintenance] POST error', error);
    return internalError();
  }
};

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuth(request);
    if (!isAuthed(auth)) return auth;

    createAstroAdminClient(locals.runtime?.env);
    const role = (auth.user.user_metadata as Record<string, unknown>)?.role;
    const isAdmin = typeof role === 'string' && ['admin', 'organization_admin', 'platform_admin'].includes(role);
    
    if (!isAdmin) return forbidden();

    const [monitors, statusPages] = await Promise.all([
      UptimeService.getMonitors(),
      UptimeService.getStatusPages()
    ]);

    return jsonOk({ monitors, statusPages });
  } catch (error) {
    logger.error('[maintenance] GET error', error);
    return internalError();
  }
};
