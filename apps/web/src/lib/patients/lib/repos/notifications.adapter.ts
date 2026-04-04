import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PortalNotification,
  PortalNotificationCandidate,
} from '@/lib/patients/types/notifications';
import type { INotificationsRepository } from '@/lib/patients/ports/notifications.port';

type Db = SupabaseClient<Database>;
type DbScalar = string | number | boolean | null;
type DbRow = Record<string, unknown>;

interface DbError extends Error {
  code?: string;
}

interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

interface DbQueryBuilder
  extends PromiseLike<{ data: DbRow | DbRow[] | null; error: DbError | null }> {
  select(columns: string, options?: Record<string, unknown>): DbQueryBuilder;
  eq(column: string, value: DbScalar): DbQueryBuilder;
  in(column: string, values: string[]): DbQueryBuilder;
  is(column: string, value: DbScalar): DbQueryBuilder;
  not(column: string, operator: string, value: DbScalar): DbQueryBuilder;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): DbQueryBuilder;
  limit(count: number): DbQueryBuilder;
  insert(values: DbRow | DbRow[]): DbQueryBuilder;
  update(values: DbRow): DbQueryBuilder;
  maybeSingle(): Promise<DbResult<DbRow>>;
}

interface LooseDb {
  from(relation: string): DbQueryBuilder;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapNotification(row: DbRow): PortalNotification {
  return {
    id: asText(row.id) ?? '',
    user_id: asText(row.user_id) ?? '',
    audience: (asText(row.audience) as PortalNotification['audience']) ?? 'patient',
    category: (asText(row.category) as PortalNotification['category']) ?? 'system',
    type: asText(row.type) ?? 'system',
    title: asText(row.title) ?? '',
    body: asText(row.body) ?? '',
    action_url: asText(row.action_url),
    action_label: asText(row.action_label),
    priority: (asText(row.priority) as PortalNotification['priority']) ?? 'normal',
    dedupe_key: asText(row.dedupe_key) ?? '',
    context_data: asObject(row.context_data),
    read_at: asText(row.read_at),
    archived_at: asText(row.archived_at),
    created_at: asText(row.created_at) ?? new Date().toISOString(),
    updated_at: asText(row.updated_at) ?? new Date().toISOString(),
  };
}

export function createNotificationsAdapter(supabase: Db): INotificationsRepository {
  const db = supabase as unknown as LooseDb;
  const self: INotificationsRepository = {
    async listByUser(
      userId: string,
      limit = 20,
    ): Promise<PortalNotification[]> {
      const { data, error } = await db
        .from('portal_notifications')
        .select('*')
        .eq('user_id', userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('[notificationsRepo] listByUser failed', error);
        throw error;
      }

      return Array.isArray(data) ? data.map((row) => mapNotification(row as DbRow)) : [];
    },

    async countUnread(
      userId: string,
    ): Promise<number> {
      const { data, error } = await db
        .from('portal_notifications')
        .select('id')
        .eq('user_id', userId)
        .is('archived_at', null)
        .is('read_at', null);

      if (error) {
        logger.error('[notificationsRepo] countUnread failed', error);
        throw error;
      }

      return Array.isArray(data) ? data.length : 0;
    },

    async listExistingDedupeKeys(
      userId: string,
      dedupeKeys: string[],
    ): Promise<Set<string>> {
      if (dedupeKeys.length === 0) {
        return new Set<string>();
      }

      const { data, error } = await db
        .from('portal_notifications')
        .select('dedupe_key')
        .eq('user_id', userId)
        .in('dedupe_key', dedupeKeys);

      if (error) {
        logger.error('[notificationsRepo] listExistingDedupeKeys failed', error);
        throw error;
      }

      return new Set(
        Array.isArray(data)
          ? data
              .map((row) => asText((row as DbRow).dedupe_key))
              .filter((value): value is string => Boolean(value))
          : [],
      );
    },

    async insertMissing(
      userId: string,
      candidates: PortalNotificationCandidate[],
    ): Promise<void> {
      if (candidates.length === 0) {
        return;
      }

      const existing = await self.listExistingDedupeKeys(
        userId,
        candidates.map((candidate) => candidate.dedupeKey),
      );

      const rows = candidates
        .filter((candidate) => !existing.has(candidate.dedupeKey))
        .map((candidate) => ({
          user_id: userId,
          audience: candidate.audience ?? 'patient',
          category: candidate.category,
          type: candidate.type,
          title: candidate.title,
          body: candidate.body,
          action_url: candidate.actionUrl ?? null,
          action_label: candidate.actionLabel ?? null,
          priority: candidate.priority ?? 'normal',
          dedupe_key: candidate.dedupeKey,
          context_data: candidate.contextData ?? {},
          created_at: candidate.createdAt ?? new Date().toISOString(),
        }));

      if (rows.length === 0) {
        return;
      }

      const { error } = await db.from('portal_notifications').insert(rows);

      if (error) {
        logger.error('[notificationsRepo] insertMissing failed', error);
        throw error;
      }
    },

    async markRead(
      userId: string,
      notificationId: string,
    ): Promise<void> {
      const { error } = await db
        .from('portal_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .is('archived_at', null);

      if (error) {
        logger.error('[notificationsRepo] markRead failed', error);
        throw error;
      }
    },

    async markAllRead(
      userId: string,
    ): Promise<void> {
      const { error } = await db
        .from('portal_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('archived_at', null)
        .is('read_at', null);

      if (error) {
        logger.error('[notificationsRepo] markAllRead failed', error);
        throw error;
      }
    },
  };

  return self;
}
