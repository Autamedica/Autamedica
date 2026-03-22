import type { APIRoute } from 'astro'
import { createAdminClient, createServerClientFromRequest } from '@autamedica/auth/server'
import type { SupabaseClient } from '@supabase/supabase-js'

interface CommunityGroupRow {
  id: string
  name: string
  slug: string
  description: string | null
  category: string | null
  active: boolean | null
  deleted_at: string | null
}

interface MembershipCountRow {
  group_id: string
}

interface PostCountRow {
  group_id: string | null
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request }) => {
  const supabase = createServerClientFromRequest(request)
  // Cast to generic SupabaseClient: community_groups/group_memberships/community_posts are not in generated DB types yet
  const admin = createAdminClient() as unknown as SupabaseClient

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return json({ error: 'No autorizado' }, 401)
  }

  const [groupsResult, membershipsResult, postsResult] = await Promise.all([
    admin
      .from('community_groups')
      .select('id,name,slug,description,category,active,deleted_at')
      .eq('active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    admin.from('group_memberships').select('group_id').eq('status', 'active'),
    admin
      .from('community_posts')
      .select('group_id')
      .eq('moderation_status', 'approved')
      .is('deleted_at', null),
  ])

  if (groupsResult.error) {
    return json({ error: groupsResult.error.message }, 500)
  }
  if (membershipsResult.error) {
    return json({ error: membershipsResult.error.message }, 500)
  }
  if (postsResult.error) {
    return json({ error: postsResult.error.message }, 500)
  }

  const membershipCounts = new Map<string, number>()
  for (const row of (membershipsResult.data ?? []) as unknown as MembershipCountRow[]) {
    membershipCounts.set(row.group_id, (membershipCounts.get(row.group_id) ?? 0) + 1)
  }

  const postCounts = new Map<string, number>()
  for (const row of (postsResult.data ?? []) as unknown as PostCountRow[]) {
    if (!row.group_id) continue
    postCounts.set(row.group_id, (postCounts.get(row.group_id) ?? 0) + 1)
  }

  const groups = ((groupsResult.data ?? []) as unknown as CommunityGroupRow[]).map((group) => ({
    ...group,
    member_count: membershipCounts.get(group.id) ?? 0,
    post_count: postCounts.get(group.id) ?? 0,
  }))

  return json({ success: true, data: groups })
}
