import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { NextResponse } from 'next/server';

interface CommunityGroupRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  active: boolean | null;
  deleted_at: string | null;
}

interface MembershipCountRow {
  group_id: string;
}

interface PostCountRow {
  group_id: string | null;
}

export async function GET() {
  const supabase = await createRouteHandlerClient();
  const admin = createAdminClient();

  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();

  if (authError || !session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const [groupsResult, membershipsResult, postsResult] = await Promise.all([
    admin
      .from('community_groups')
      .select('id,name,slug,description,category,active,deleted_at')
      .eq('active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    admin
      .from('group_memberships')
      .select('group_id')
      .eq('status', 'active'),
    admin
      .from('community_posts')
      .select('group_id')
      .eq('moderation_status', 'approved')
      .is('deleted_at', null),
  ]);

  if (groupsResult.error) {
    return NextResponse.json({ error: groupsResult.error.message }, { status: 500 });
  }
  if (membershipsResult.error) {
    return NextResponse.json({ error: membershipsResult.error.message }, { status: 500 });
  }
  if (postsResult.error) {
    return NextResponse.json({ error: postsResult.error.message }, { status: 500 });
  }

  const membershipCounts = new Map<string, number>();
  for (const row of (membershipsResult.data ?? []) as MembershipCountRow[]) {
    membershipCounts.set(row.group_id, (membershipCounts.get(row.group_id) ?? 0) + 1);
  }

  const postCounts = new Map<string, number>();
  for (const row of (postsResult.data ?? []) as PostCountRow[]) {
    if (!row.group_id) continue;
    postCounts.set(row.group_id, (postCounts.get(row.group_id) ?? 0) + 1);
  }

  const groups = ((groupsResult.data ?? []) as CommunityGroupRow[]).map((group) => ({
    ...group,
    member_count: membershipCounts.get(group.id) ?? 0,
    post_count: postCounts.get(group.id) ?? 0,
  }));

  return NextResponse.json({ success: true, data: groups });
}
