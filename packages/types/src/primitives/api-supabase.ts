/**
 * Supabase API Response types
 *
 * Define los tipos estándar para respuestas de API Supabase
 * con error handling y paginación.
 */

// ==========================================
// Core Supabase Response Types
// ==========================================

/**
 * Wrapper estándar para respuestas de API Supabase con error handling
 */
export interface SupabaseApiResponse<T = unknown> {
  data: T | null;
  error: {
    message: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
  count?: number; // Para queries con count
  status: number;
  statusText: string;
}

/**
 * Respuesta paginada de Supabase con metadatos de navegación
 */
export interface SupabasePaginatedResponse<T = unknown> extends SupabaseApiResponse<T[]> {
  pagination: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// ==========================================
// Type Guards & Utilities
// ==========================================

export const isSupabaseApiResponse = <T>(v: unknown): v is SupabaseApiResponse<T> => {
  return !!v &&
    typeof v === 'object' &&
    'data' in v &&
    'error' in v &&
    'status' in v;
};

export const isSupabaseError = (response: SupabaseApiResponse<unknown>): boolean => {
  return response.error !== null;
};

export const isSupabaseSuccess = <T>(response: SupabaseApiResponse<T>): response is SupabaseApiResponse<T> & { data: T } => {
  return response.error === null && response.data !== null;
};

export const getSupabaseErrorMessage = (response: SupabaseApiResponse<unknown>): string => {
  return response.error?.message || 'Unknown error occurred';
};