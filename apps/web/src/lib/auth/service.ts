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
import { createBrowserClient, resetAuthCircuitBreaker } from '@autamedica/auth'
import { logger } from '@autamedica/shared'
import { markManualSignout } from './browser-storage'

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

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return ''
}

function getAuthErrorStatus(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status
  }

  return null
}

function isRecoverableSessionError(error: unknown): boolean {
  const message = getAuthErrorMessage(error).toLowerCase()
  const status = getAuthErrorStatus(error)

  return (
    status === 429 ||
    message.includes('request rate limit reached') ||
    message.includes('refresh token') ||
    message.includes('jwt expired') ||
    message.includes('session from session_id claim in jwt does not exist') ||
    message.includes('invalid session')
  )
}

async function clearLocalSession(
  supabase: ReturnType<typeof createBrowserClient>,
  reason: string,
  error?: unknown,
): Promise<void> {
  resetAuthCircuitBreaker()
  const message = getAuthErrorMessage(error)
  const status = getAuthErrorStatus(error)

  if (error) {
    logger.warn('[AuthService] Clearing local auth state', {
      reason,
      errorMessage: message || undefined,
      errorStatus: status ?? undefined,
    })
  }

  try {
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })

    if (signOutError) {
      logger.warn('[AuthService] Local sign-out cleanup returned an error', {
        reason,
        errorMessage: signOutError.message,
        errorStatus: getAuthErrorStatus(signOutError) ?? undefined,
      })
    }
  } catch (cleanupError) {
    logger.warn('[AuthService] Local sign-out cleanup threw unexpectedly', {
      reason,
      errorMessage: getAuthErrorMessage(cleanupError) || String(cleanupError),
      errorStatus: getAuthErrorStatus(cleanupError) ?? undefined,
    })
  } finally {
    resetAuthCircuitBreaker()
    if (typeof window !== 'undefined') {
      try {
        const authKeys = ['sb-', 'supabase', 'autamedica']
        const toRemoveLocal: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && authKeys.some((prefix) => key.includes(prefix))) {
            toRemoveLocal.push(key)
          }
        }
        toRemoveLocal.forEach((k) => localStorage.removeItem(k))

        const toRemoveSession: string[] = []
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key && authKeys.some((prefix) => key.includes(prefix))) {
            toRemoveSession.push(key)
          }
        }
        toRemoveSession.forEach((k) => sessionStorage.removeItem(k))
      } catch {
        // Ignore storage clearance errors
      }
    }
  }
}

/**
 * Intenta autenticar al usuario con email y contraseña.
 * No hace redirect — el caller decide qué hacer después.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<SignInResult> {
  // Reset circuit breaker so a fresh login isn't blocked by a prior bad refresh.
  resetAuthCircuitBreaker()
  const supabase = createBrowserClient()

  let { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error && isRecoverableSessionError(error)) {
    await clearLocalSession(supabase, 'sign_in_with_password_recovery', error)

    const retryResult = await supabase.auth.signInWithPassword({ email, password })
    error = retryResult.error
  }

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
  resetAuthCircuitBreaker()
  const supabase = createBrowserClient()

  // Limpiar estado previo para evitar conflictos con el nuevo PKCE code_verifier.
  await clearLocalSession(supabase, 'oauth_preflight_cleanup')

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
 * Cierra la sesión local (limpia auth state y cookies accesibles).
 * Para logout global completo usar `signOutGlobally` de @autamedica/auth.
 */
export async function signOutLocal(): Promise<void> {
  markManualSignout()
  const supabase = createBrowserClient()
  await clearLocalSession(supabase, 'explicit_local_sign_out')
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
  let localSession: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      if (isRecoverableSessionError(sessionError)) {
        await clearLocalSession(supabase, 'check_existing_session_refresh_error', sessionError)
        return {
          hasLocalSession: true,
          isServerValid: false,
          accessToken: null,
          refreshToken: null,
        }
      }

      throw sessionError
    }

    localSession = session
  } catch (error) {
    if (isRecoverableSessionError(error)) {
      await clearLocalSession(supabase, 'check_existing_session_exception', error)
      return {
        hasLocalSession: true,
        isServerValid: false,
        accessToken: null,
        refreshToken: null,
      }
    }

    throw error
  }

  if (!localSession) {
    return { hasLocalSession: false, isServerValid: false, accessToken: null, refreshToken: null }
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    // Sesión local inválida — limpiar
    await clearLocalSession(supabase, 'check_existing_session_invalid_user', userError)
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
  resetAuthCircuitBreaker()
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
  resetAuthCircuitBreaker()
  const supabase = createBrowserClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    logger.error('[AuthService] resetPasswordForEmail failed', { error: error.message })
    return { ok: false, errorMessage: error.message }
  }

  return { ok: true, errorMessage: null }
}

/**
 * Verifica un enlace de recuperación token_hash después de una acción explícita
 * del usuario. El GET inicial del correo no consume el OTP (anti-prefetch).
 */
export async function verifyPasswordRecoveryToken(tokenHash: string): Promise<SignInResult> {
  const normalizedTokenHash = tokenHash.trim()
  if (!normalizedTokenHash) {
    return { ok: false, errorMessage: 'Recovery token is missing' }
  }

  resetAuthCircuitBreaker()
  const supabase = createBrowserClient()
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: normalizedTokenHash,
    type: 'recovery',
  })

  if (error) {
    logger.warn('[AuthService] Password recovery token verification failed', {
      errorMessage: error.message,
    })
    return { ok: false, errorMessage: error.message }
  }

  if (!data.session) {
    logger.warn('[AuthService] Password recovery token verification returned no session')
    return { ok: false, errorMessage: 'Password recovery session could not be established' }
  }

  return { ok: true, errorMessage: null }
}

/**
 * Inicializa la sesión del flujo de recuperación.
 *
 * En PKCE, Supabase devuelve un `code` en la URL. La inicialización del
 * cliente (detectSessionInUrl) lo intercambia por una sesión y emite
 * PASSWORD_RECOVERY. No basta con encontrar un token en la URL: exigimos
 * ese evento y una sesión válida antes de permitir cambiar la contraseña.
 */
export async function initializePasswordRecoverySession(): Promise<SignInResult> {
  resetAuthCircuitBreaker()
  const supabase = createBrowserClient()
  let passwordRecoveryEventReceived = false

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
      passwordRecoveryEventReceived = true
    }
  })

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error) {
      logger.warn('[AuthService] Password recovery session initialization failed', {
        errorMessage: error.message,
      })
      return { ok: false, errorMessage: error.message }
    }

    if (!session || !passwordRecoveryEventReceived) {
      logger.warn('[AuthService] Password recovery callback did not establish a recovery session', {
        hasSession: Boolean(session),
        passwordRecoveryEventReceived,
      })
      return { ok: false, errorMessage: 'Password recovery session could not be established' }
    }

    return { ok: true, errorMessage: null }
  } finally {
    subscription.unsubscribe()
  }
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
