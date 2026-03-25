/**
 * Astro-compatible auth utility for patient API routes.
 * Replaces the Next.js version that used next/headers.
 */

import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7)
    try {
      const admin = createAstroAdminClient()
      const { data: userRes } = await admin.auth.getUser(token)
      if (userRes?.user) return userRes.user.id
    } catch {
      return null
    }
  }

  const supabase = createAstroServerClientFromRequest(request)
  const { data: userData } = await supabase.auth.getUser()
  return userData.user?.id ?? null
}
