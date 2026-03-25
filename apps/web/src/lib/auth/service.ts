/**
 * AuthService — capa de servicio para operaciones de autenticación.
 *
 * Centraliza todas las interacciones con Supabase Auth que anteriormente
 * estaban dispersas en componentes y hooks.
 *
 * Capas: UI → AuthService (este archivo) → createBrowserClient() → Supabase
 *
 * Nunca instanciar Supabase directamente en componentes ni hooks.
 * Siempre pasar por aquí.
 */
import { createBrowserClient } from '@autamedica/auth'
import { logger } from '@autamedica/shared'

export interface SignInResult {
  ok: boolean
  errorMessage: string | null
}

export interface SessionCheckResult {
  hasLocalSession: boolean
  isServerValid: boolean
  accessToken: string | null
  refreshToken: string | null
}

/**
 * Intenta autenticar al usuario con email y contraseña.
 * No hace redirect — el caller decide qué hacer después.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<SignInResult> {
  const supabase = createBrowserClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { ok: false, errorMessage: error.message }
  }

  return { ok: true, errorMessage: null }
}

/**
 * Inicia el flujo OAuth. Redirige al proveedor — no retorna si tiene éxito.
 * Limpia el estado de auth previo antes de iniciar un nuevo flujo PKCE.
 */
export async function signInWithOAuth(
  provider: 'google',
  redirectTo: string,
  queryParams?: Record<string, string>
): Promise<SignInResult> {
  const supabase = createBrowserClient()

  // Limpiar estado previo para evitar conflictos con el nuevo PKCE code_verifier.
  await supabase.auth.signOut({ scope: 'local' })

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      queryParams: queryParams ?? { access_type: 'offline', prompt: 'select_account' },
    },
  })

  if (error) {
    logger.error('[AuthService] signInWithOAuth failed', { provider, error: error.message })
    return { ok: false, errorMessage: error.message }
  }

  return { ok: true, errorMessage: null }
}

/**
 * Cierra la sesión local (limpia localStorage y cookies accesibles).
 * Para logout global completo usar `signOutGlobally` de @autamedica/auth.
 */
export async function signOutLocal(): Promise<void> {
  const supabase = createBrowserClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })

  if (error) {
    logger.error('[AuthService] signOutLocal failed', { error: error.message })
  }
}

/**
 * Verifica el estado de sesión actual.
 * Primero chequea storage local (sin red); si hay sesión, valida server-side con getUser().
 *
 * Usado en bootstrap de formularios de login para evitar mostrar el form
 * a usuarios ya autenticados.
 */
export async function checkExistingSession(): Promise<SessionCheckResult> {
  const supabase = createBrowserClient()

  const { data: { session: localSession } } = await supabase.auth.getSession()

  if (!localSession) {
    return { hasLocalSession: false, isServerValid: false, accessToken: null, refreshToken: null }
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    // Sesión local inválida — limpiar
    await supabase.auth.signOut({ scope: 'local' })
    return { hasLocalSession: true, isServerValid: false, accessToken: null, refreshToken: null }
  }

  return {
    hasLocalSession: true,
    isServerValid: true,
    accessToken: localSession.access_token,
    refreshToken: localSession.refresh_token,
  }
}

export interface SignUpOptions {
  emailRedirectTo?: string
  metadata?: Record<string, unknown>
}

/**
 * Registra un nuevo usuario con email y contraseña.
 * El caller debe manejar el redirect post-registro (verificación de email, callback, etc.).
 */
export async function signUp(
  email: string,
  password: string,
  options?: SignUpOptions
): Promise<SignInResult> {
  const supabase = createBrowserClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: options?.emailRedirectTo,
      data: options?.metadata,
    },
  })

  if (error) {
    logger.error('[AuthService] signUp failed', { error: error.message })
    return { ok: false, errorMessage: error.message }
  }

  return { ok: true, errorMessage: null }
}

/**
 * Envía un email de recuperación de contraseña.
 */
export async function resetPasswordForEmail(
  email: string,
  redirectTo: string
): Promise<SignInResult> {
  const supabase = createBrowserClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    logger.error('[AuthService] resetPasswordForEmail failed', { error: error.message })
    return { ok: false, errorMessage: error.message }
  }

  return { ok: true, errorMessage: null }
}

/**
 * Actualiza la contraseña del usuario autenticado.
 */
export async function updatePassword(newPassword: string): Promise<SignInResult> {
  const supabase = createBrowserClient()

  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) {
    logger.error('[AuthService] updatePassword failed', { error: error.message })
    return { ok: false, errorMessage: error.message }
  }

  return { ok: true, errorMessage: null }
}

/**
 * Obtiene el usuario autenticado actual (con validación server-side).
 * Retorna null si no hay sesión válida.
 */
export async function getCurrentUser() {
  const supabase = createBrowserClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return null

  return user
}

/**
 * Actualiza el rol del usuario en user_metadata.
 * Usado en onboarding / selección de rol post-registro.
 */
export async function updateUserRole(role: string): Promise<SignInResult> {
  const supabase = createBrowserClient()

  const { error } = await supabase.auth.updateUser({ data: { role } })

  if (error) {
    logger.error('[AuthService] updateUserRole failed', { role, error: error.message })
    return { ok: false, errorMessage: error.message }
  }

  return { ok: true, errorMessage: null }
}
