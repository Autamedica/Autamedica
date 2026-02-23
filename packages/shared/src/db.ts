/**
 * Supabase Database Wrapper
 *
 * Wrapper con safe-guards para operaciones comunes:
 * - Auto-filtro de soft-deleted (deleted_at IS NULL)
 * - Transformación automática snake_case → camelCase para UI
 * - Type-safe con tipos desde @autamedica/types
 *
 * REGLA: Este wrapper siempre retorna datos en camelCase para UI.
 *        Para operaciones raw SQL o RLS, usar cliente directo.
 *
 * @example
 * ```ts
 * // Lectura con auto-filtro de soft-deleted
 * const appointments = await selectActive<UiAppointment>('appointments', '*');
 *
 * // Lectura sin transformación (raw DB data)
 * const rawData = await selectActiveRaw('appointments', '*');
 * ```
 */

import type { Database } from '@autamedica/types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { toCamel, toSnake } from './casing';

type PublicSchema = Database['public'];
type Tables = PublicSchema['Tables'];
type TableName = Extract<keyof Tables, string>;

type TableRow<Table extends TableName> = Tables[Table] extends { Row: infer R } ? R : never;
type TableInsert<Table extends TableName> = Tables[Table] extends { Insert: infer I } ? I : never;
type TableUpdate<Table extends TableName> = Tables[Table] extends { Update: infer U } ? U : never;

/**
 * Cliente Supabase singleton (lazy).
 * Evita evaluar variables de entorno al importar el módulo.
 */
let supabaseClient: SupabaseClient<Database> | null = null;

function getSupabaseClient(): SupabaseClient<Database> {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase configuration is missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  supabaseClient = createClient<Database>(url, anonKey);
  return supabaseClient;
}

/**
 * Proxy para mantener compatibilidad con imports existentes (`supabase.from(...)`).
 * El cliente real se crea bajo demanda en el primer acceso.
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  set(_target, prop, value, receiver) {
    const client = getSupabaseClient() as unknown as Record<PropertyKey, unknown>;
    return Reflect.set(client, prop, value, receiver);
  },
}) as SupabaseClient<Database>;

/**
 * Opciones para queries de lectura
 */
interface BaseSelectOptions<Table extends TableName> {
  /** Incluir soft-deleted (deleted_at NOT NULL) - Default: false */
  includeDeleted?: boolean;
  /** Transformar a camelCase - Default: true */
  transform?: boolean;
  /** Ordenamiento */
  orderBy?: { column: keyof TableRow<Table> & string; ascending?: boolean };
  /** Límite de resultados */
  limit?: number;
  /** Offset para paginación */
  offset?: number;
}

export type SelectOptions<Table extends TableName> = BaseSelectOptions<Table>;

/**
 * SELECT con auto-filtro de soft-deleted y transformación a camelCase
 *
 * USAR: Para lecturas desde UI que necesitan camelCase
 *
 * @template T - Tipo UI esperado (camelCase)
 * @param table - Nombre de tabla en BD
 * @param query - Columnas a seleccionar (default: '*')
 * @param options - Opciones de query
 * @returns Promise con array de registros en camelCase
 *
 * @example
 * ```ts
 * interface UiAppointment {
 *   id: string;
 *   patientId: string;
 *   startTime: string;
 *   status: 'scheduled' | 'confirmed';
 * }
 *
 * const appointments = await selectActive<UiAppointment>('appointments');
 * // appointments[0].patientId (camelCase)
 * ```
 */
export async function selectActive<Table extends TableName, TResult = TableRow<Table>>(
  table: Table,
  query = '*',
  options: SelectOptions<Table> = {}
): Promise<TResult[]> {
  const {
    includeDeleted = false,
    transform = true,
    orderBy,
    limit,
    offset,
  } = options;

  let queryBuilder = supabase.from(table as any).select(query);

  // Auto-filtro de soft-deleted (a menos que explícitamente se incluyan)
  if (!includeDeleted) {
    queryBuilder = queryBuilder.is('deleted_at', null);
  }

  // Ordenamiento
  if (orderBy) {
    queryBuilder = queryBuilder.order(orderBy.column as any, {
      ascending: orderBy.ascending ?? true,
    });
  }

  // Paginación
  if (limit !== undefined) {
    queryBuilder = queryBuilder.limit(limit);
  }

  if (offset !== undefined) {
    queryBuilder = queryBuilder.range(offset, offset + (limit ?? 10) - 1);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Error en selectActive('${table}'): ${error.message}`);
  }

  // Transformar a camelCase si está habilitado
  const rows = data ?? [];
  return transform
    ? (toCamel<TableRow<Table>[]>(rows) as unknown as TResult[])
    : (rows as unknown as TResult[]);
}

/**
 * SELECT raw sin transformación (retorna snake_case directo de BD)
 *
 * USAR: Para operaciones server-side que no necesitan transformación
 *
 * @template T - Tipo DB esperado (snake_case)
 * @param table - Nombre de tabla
 * @param query - Columnas a seleccionar
 * @param options - Opciones de query
 * @returns Promise con array de registros en snake_case
 */
export async function selectActiveRaw<Table extends TableName, TResult = TableRow<Table>>(
  table: Table,
  query = '*',
  options: Omit<SelectOptions<Table>, 'transform'> = {}
): Promise<TResult[]> {
  return selectActive<Table, TResult>(table, query, { ...options, transform: false });
}

/**
 * SELECT por ID con auto-filtro de soft-deleted
 *
 * @template T - Tipo UI esperado (camelCase)
 * @param table - Nombre de tabla
 * @param id - ID del registro
 * @param options - Opciones de query
 * @returns Promise con registro único o null
 *
 * @example
 * ```ts
 * const appointment = await selectById<UiAppointment>('appointments', '123');
 * if (appointment) {
 *   logger.info(appointment.patientId); // camelCase
 * }
 * ```
 */
export async function selectById<Table extends TableName, TResult = TableRow<Table>>(
  table: Table,
  id: string,
  options: SelectOptions<Table> = {}
): Promise<TResult | null> {
  const { includeDeleted = false, transform = true } = options;

  let queryBuilder = supabase
    .from(table as any)
    .select('*')
    .eq('id', id);

  if (!includeDeleted) {
    queryBuilder = queryBuilder.is('deleted_at', null);
  }

  const { data, error } = await queryBuilder.maybeSingle();

  if (error) {
    throw new Error(`Error en selectById('${table}', '${id}'): ${error.message}`);
  }

  if (!data) return null;

  return transform
    ? (toCamel<TableRow<Table>>(data) as unknown as TResult)
    : (data as unknown as TResult);
}

/**
 * INSERT con transformación automática camelCase → snake_case
 *
 * USAR: Para inserts desde UI con datos en camelCase
 *
 * @template TInput - Tipo UI de input (camelCase)
 * @template TOutput - Tipo UI de output (camelCase)
 * @param table - Nombre de tabla
 * @param data - Datos a insertar (camelCase)
 * @param options - Opciones de insert
 * @returns Promise con registro insertado en camelCase
 *
 * @example
 * ```ts
 * const newAppointment = await insertRecord<UiAppointmentInsert, UiAppointment>(
 *   'appointments',
 *   { patientId: '123', startTime: '2025-01-01', type: 'checkup' }
 * );
 * // BD recibe: { patient_id, start_time, type }
 * // Retorna: { id, patientId, startTime, ... } (camelCase)
 * ```
 */
export async function insertRecord<Table extends TableName, TInput extends Record<string, unknown>, TResult = TableRow<Table>>(
  table: Table,
  data: TInput,
  options: { transform?: boolean } = {}
): Promise<TResult> {
  const { transform = true } = options;

  // Transformar input a snake_case para BD
  const dbPayload = (transform ? toSnake(data) : data) as TableInsert<Table>;

  const { data: inserted, error } = await supabase
    .from(table as any)
    .insert(dbPayload as unknown as Record<string, unknown>)
    .select()
    .single();

  if (error) {
    throw new Error(`Error en insertRecord('${table}'): ${error.message}`);
  }

  // Transformar output a camelCase para UI
  return transform
    ? (toCamel<TableRow<Table>>(inserted) as unknown as TResult)
    : (inserted as unknown as TResult);
}

/**
 * UPDATE con transformación automática camelCase → snake_case
 *
 * @template TInput - Tipo UI de input (camelCase)
 * @template TOutput - Tipo UI de output (camelCase)
 * @param table - Nombre de tabla
 * @param id - ID del registro a actualizar
 * @param data - Datos a actualizar (camelCase)
 * @param options - Opciones de update
 * @returns Promise con registro actualizado en camelCase
 */
export async function updateRecord<Table extends TableName, TInput extends Record<string, unknown>, TResult = TableRow<Table>>(
  table: Table,
  id: string,
  data: TInput,
  options: { transform?: boolean } = {}
): Promise<TResult> {
  const { transform = true } = options;

  // Transformar input a snake_case para BD
  const dbPayload = (transform ? toSnake(data) : data) as TableUpdate<Table>;

  const { data: updated, error } = await supabase
    .from(table as any)
    .update(dbPayload as unknown as Record<string, unknown>)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Error en updateRecord('${table}', '${id}'): ${error.message}`);
  }

  // Transformar output a camelCase para UI
  return transform
    ? (toCamel<TableRow<Table>>(updated) as unknown as TResult)
    : (updated as unknown as TResult);
}

/**
 * SOFT DELETE - Marca deleted_at en lugar de borrar físicamente
 *
 * @param table - Nombre de tabla
 * @param id - ID del registro a soft-delete
 * @returns Promise con éxito de operación
 *
 * @example
 * ```ts
 * await softDelete('appointments', '123');
 * // BD: UPDATE appointments SET deleted_at = NOW() WHERE id = '123'
 * ```
 */
export async function softDelete<Table extends TableName>(
  table: Table,
  id: string
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from(table as any)
    .update({ deleted_at: now })
    .eq('id', id);

  if (error) {
    throw new Error(`Error en softDelete('${table}', '${id}'): ${error.message}`);
  }
}

/**
 * HARD DELETE - Borra físicamente el registro
 *
 * ⚠️ USAR CON PRECAUCIÓN - Solo para casos excepcionales
 *
 * @param table - Nombre de tabla
 * @param id - ID del registro a borrar
 * @returns Promise con éxito de operación
 */
export async function hardDelete<Table extends TableName>(
  table: Table,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from(table as any)
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Error en hardDelete('${table}', '${id}'): ${error.message}`);
  }
}

/**
 * RESTORE - Restaura un registro soft-deleted
 *
 * @param table - Nombre de tabla
 * @param id - ID del registro a restaurar
 * @returns Promise con éxito de operación
 */
export async function restoreRecord<Table extends TableName>(
  table: Table,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from(table as any)
    .update({ deleted_at: null })
    .eq('id', id);

  if (error) {
    throw new Error(`Error en restoreRecord('${table}', '${id}'): ${error.message}`);
  }
}

/**
 * COUNT con auto-filtro de soft-deleted
 *
 * @param table - Nombre de tabla
 * @param options - Opciones de query
 * @returns Promise con conteo de registros
 */
export async function countActive<Table extends TableName>(
  table: Table,
  options: { includeDeleted?: boolean } = {}
): Promise<number> {
  const { includeDeleted = false } = options;

  let queryBuilder = supabase
    .from(table as any)
    .select('*', { count: 'exact', head: true });

  if (!includeDeleted) {
    queryBuilder = queryBuilder.is('deleted_at', null);
  }

  const { count, error } = await queryBuilder;

  if (error) {
    throw new Error(`Error en countActive('${table}'): ${error.message}`);
  }

  return count ?? 0;
}
