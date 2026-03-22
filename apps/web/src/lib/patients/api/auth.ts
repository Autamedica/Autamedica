/**
 * Astro-compatible auth utility for patient API routes.
 * Replaces the Next.js version that used next/headers.
 */

import { createAdminClient, createServerClientFromRequest } from '@autamedica/auth/server'

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7)
    try {
      const admin = createAdminClient()
      const { data: userRes } = await admin.auth.getUser(token)
      if (userRes?.user) return userRes.user.id
    } catch {
      return null
    }
  }

  const supabase = createServerClientFromRequest(request)
  const { data: userData } = await supabase.auth.getUser()
  return userData.user?.id ?? null
}
