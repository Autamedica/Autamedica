package com.autamedica.android.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.NotificationRepository
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val selectedRole: com.autamedica.android.domain.model.UserRole = com.autamedica.android.domain.model.UserRole.PATIENT,
    val isLoading: Boolean = false,
    val isGoogleLoading: Boolean = false,
    val error: String? = null,
    val errorResId: Int? = null,
    val isCheckingSession: Boolean = true,
    val loggedInUser: User? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val notificationRepository: NotificationRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        checkExistingSession()
    }

    private fun checkExistingSession() {
        viewModelScope.launch {
            try {
                Timber.d("[Auth] checkExistingSession start")
                val user = authRepository.getCurrentUser()
                Timber.d("[Auth] checkExistingSession result: user=${user != null}")
                _uiState.update {
                    it.copy(
                        isCheckingSession = false,
                        loggedInUser = user,
                    )
                }
                // If session exists, register FCM token
                if (user != null) {
                    registerFcmToken()
                }
            } catch (e: Exception) {
                SecureLog.error("[Auth] checkExistingSession failed", e)
                _uiState.update { it.copy(isCheckingSession = false) }
            }
        }
    }

    fun onRoleChange(role: com.autamedica.android.domain.model.UserRole) {
        _uiState.update { it.copy(selectedRole = role, error = null, errorResId = null) }
    }

    fun onEmailChange(email: String) {
        _uiState.update { it.copy(email = email, error = null, errorResId = null) }
    }

    fun onPasswordChange(password: String) {
        _uiState.update { it.copy(password = password, error = null, errorResId = null) }
    }

    private fun mapErrorMessage(error: Throwable): String {
        SecureLog.error("[Auth] Login error", error)

        if (error is io.github.jan.supabase.exceptions.RestException) {
            val errorBody = error.error.lowercase()
            val desc = error.description?.lowercase() ?: ""
            return when {
                error.statusCode == 400 && ("invalid_grant" in errorBody || "invalid" in desc || "invalid_credentials" in errorBody) ->
                    "Correo o contraseña incorrectos. Revisa tus datos e intenta nuevamente."
                error.statusCode == 422 || "email_not_confirmed" in errorBody ->
                    "Tu correo no ha sido confirmado. Revisa tu bandeja de entrada o spam."
                error.statusCode == 429 || "too_many_requests" in errorBody ->
                    "Demasiados intentos fallidos. Por seguridad, espera unos minutos antes de reintentar."
                else -> error.description ?: "Error de autenticación con el servidor (${error.statusCode})."
            }
        }

        val msg = error.message?.lowercase() ?: return "Error desconocido al iniciar sesión"
        return when {
            "invalid_credentials" in msg || "invalid login" in msg ->
                "Correo o contraseña incorrectos"
            "email not confirmed" in msg ->
                "Confirma tu correo electrónico antes de ingresar"
            "too many requests" in msg || "rate limit" in msg ->
                "Demasiados intentos. Espera unos minutos e intenta de nuevo"
            "network" in msg || "timeout" in msg || "connect" in msg || "unable to resolve host" in msg ->
                "Sin conexión a internet. Verifica tu red"
            "cannot find a matching credential" in msg || "no credentials available" in msg || "type_no_credential" in msg ->
                "No se encontraron cuentas de Google configuradas en este dispositivo"
            "developer_error" in msg || "10:" in msg ->
                "Error de configuración en Google Play Services (verificar cliente OAuth en Google Cloud)"
            "cancelled" in msg || "canceled" in msg ->
                "Inicio de sesión cancelado"
            "at least 6 characters" in msg ->
                "La contraseña debe tener al menos 6 caracteres"
            else -> "Error de acceso: ${error.message?.take(80) ?: "intenta nuevamente"}"
        }
    }

    fun setGoogleLoading(loading: Boolean) {
        _uiState.update { it.copy(isGoogleLoading = loading, error = if (loading) null else it.error) }
    }

    fun onLogin() {
        val state = _uiState.value
        val email = state.email.trim()
        val password = state.password

        if (email.isBlank()) {
            _uiState.update {
                it.copy(
                    error = "Por favor, ingresa tu correo electrónico",
                    errorResId = com.autamedica.android.R.string.login_error_empty_email,
                )
            }
            return
        }
        if (!email.contains("@") || !email.contains(".")) {
            _uiState.update {
                it.copy(
                    error = "El formato de correo no es válido (ej: usuario@correo.com)",
                    errorResId = com.autamedica.android.R.string.login_error_invalid_email,
                )
            }
            return
        }
        if (password.isBlank()) {
            _uiState.update {
                it.copy(
                    error = "Por favor, ingresa tu contraseña",
                    errorResId = com.autamedica.android.R.string.login_error_empty_password,
                )
            }
            return
        }
        if (password.length < 6) {
            _uiState.update {
                it.copy(
                    error = "La contraseña debe tener al menos 6 caracteres",
                    errorResId = com.autamedica.android.R.string.login_error_password_too_short,
                )
            }
            return
        }
        if (state.isLoading || state.isGoogleLoading) return

        _uiState.update { it.copy(isLoading = true, error = null, errorResId = null) }

        viewModelScope.launch {
            try {
                val result = authRepository.login(email, password, state.selectedRole)
                result.fold(
                    onSuccess = { user ->
                        Timber.d("[Auth] Login successful for user: %s", user.id)
                        _uiState.update { it.copy(isLoading = false, loggedInUser = user) }
                        registerFcmToken()
                    },
                    onFailure = { error ->
                        Timber.e(error, "[Auth] Login failed: %s", error.message)
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = mapErrorMessage(error),
                            )
                        }
                    },
                )
            } catch (e: Throwable) {
                Timber.e(e, "[Auth] Unexpected login exception")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = mapErrorMessage(e),
                    )
                }
            }
        }
    }

    fun onGoogleSignIn(idToken: String) {
        val state = _uiState.value
        if (state.isLoading) return

        _uiState.update { it.copy(isGoogleLoading = true, error = null) }

        viewModelScope.launch {
            try {
                val result = authRepository.loginWithGoogle(idToken, state.selectedRole)
                result.fold(
                    onSuccess = { user ->
                        Timber.d("[Auth] Google login successful for user: %s", user.id)
                        _uiState.update { it.copy(isGoogleLoading = false, loggedInUser = user) }
                        registerFcmToken()
                    },
                    onFailure = { error ->
                        Timber.e(error, "[Auth] Google login failed: %s", error.message)
                        _uiState.update {
                            it.copy(
                                isGoogleLoading = false,
                                error = mapErrorMessage(error),
                            )
                        }
                    },
                )
            } catch (e: Throwable) {
                Timber.e(e, "[Auth] Unexpected error during Google login")
                _uiState.update {
                    it.copy(
                        isGoogleLoading = false,
                        error = mapErrorMessage(e),
                    )
                }
            }
        }
    }

    fun onGoogleSignInError(error: Throwable) {
        SecureLog.error("[Auth] Google sign-in error", error)
        Timber.e(error, "[Auth] Google sign-in error: %s", error.message)
        var errorResId: Int? = null
        val friendlyMessage = when {
            error is androidx.credentials.exceptions.GetCredentialCancellationException -> {
                errorResId = com.autamedica.android.R.string.auth_google_cancelled_hint
                "Inicio con Google cancelado o interrumpido. Puedes ingresar con tu correo y contraseña."
            }
            error is androidx.credentials.exceptions.NoCredentialException ||
                error.message?.contains("no credential", ignoreCase = true) == true -> {
                errorResId = com.autamedica.android.R.string.auth_google_no_account_hint
                "No se encontró ninguna cuenta de Google disponible en este dispositivo. Ingresa con correo y contraseña."
            }
            else -> mapErrorMessage(error)
        }
        _uiState.update {
            it.copy(
                isGoogleLoading = false,
                error = friendlyMessage,
                errorResId = errorResId,
            )
        }
    }

    /** Register FCM token in Supabase after successful login (fire-and-forget) */
    private fun registerFcmToken() {
        viewModelScope.launch {
            try {
                val token = FirebaseMessaging.getInstance().token.await()
                notificationRepository.registerFcmToken(token)
                Timber.d("[FCM] Token registered")
            } catch (e: Exception) {
                SecureLog.warn("[FCM] Failed to register FCM token (non-fatal)", e)
            }
        }
    }
}
