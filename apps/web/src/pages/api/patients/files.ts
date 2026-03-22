import type { APIRoute } from 'astro'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import type { AppSupabaseClient } from '@autamedica/supabase-client'

const BUCKET = 'patient-files'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return json({ ok: false, error: 'unauthorized' }, 401)

    const admin = createAdminClient() as unknown as AppSupabaseClient

    const prefix = `${userId}/`
    const { data: objects, error } = await admin.storage
      .from(BUCKET)
      .list(prefix, { limit: 100, offset: 0 })

    if (error) throw error

    const list = Array.isArray(objects) ? objects : []
    return json({
      ok: true,
      data: {
        files: list.map((o) => ({
          name: o.name,
          path: prefix + o.name,
          size: o.metadata?.size ?? null,
          lastModified: o.updated_at ?? null,
          contentType: o.metadata?.mimetype ?? null,
        })),
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    logger.error('[API] files GET error', e as Error)
    return json({ ok: false, error: msg }, 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return json({ ok: false, error: 'unauthorized' }, 401)

    const body = await request.json().catch(() => ({}))
    const filename: string | undefined = (body as Record<string, unknown>)?.filename as
      | string
      | undefined

    if (!filename) return json({ ok: false, error: 'filename_required' }, 400)

    const suggestedPath = `${userId}/${Date.now()}-${filename}`
    return json({ ok: true, data: { bucket: BUCKET, path: suggestedPath } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    logger.error('[API] files POST error', e as Error)
    return json({ ok: false, error: msg }, 500)
  }
}

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return json({ ok: false, error: 'unauthorized' }, 401)

    const body = await request.json().catch(() => ({}))
    const path: string | undefined = (body as Record<string, unknown>)?.path as string | undefined

    if (!path?.startsWith(`${userId}/`)) {
      return json({ ok: false, error: 'invalid_path' }, 400)
    }

    const admin = createAdminClient() as unknown as AppSupabaseClient
    const { error } = await admin.storage.from(BUCKET).remove([path])

    if (error) throw error
    return json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    logger.error('[API] files DELETE error', e as Error)
    return json({ ok: false, error: msg }, 500)
  }
}
