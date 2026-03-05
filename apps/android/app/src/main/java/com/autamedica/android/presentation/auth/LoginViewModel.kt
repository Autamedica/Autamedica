package com.autamedica.android.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
    val isLoading: Boolean = false,
    val isGoogleLoading: Boolean = false,
    val error: String? = null,
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
                    registerFcmToken(user.id)
                }
            } catch (e: Exception) {
                Timber.e(e, "[Auth] checkExistingSession failed")
                _uiState.update { it.copy(isCheckingSession = false) }
            }
        }
    }

    fun onEmailChange(email: String) {
        _uiState.update { it.copy(email = email, error = null) }
    }

    fun onPasswordChange(password: String) {
        _uiState.update { it.copy(password = password, error = null) }
    }

    private fun mapErrorMessage(error: Throwable): String {
        Timber.w("[Auth] mapErrorMessage called: ${error.javaClass.simpleName} - ${error.message?.take(100)}")
        val msg = error.message?.lowercase() ?: return "Error al iniciar sesion"
        return when {
            "invalid_credentials" in msg || "invalid login" in msg ->
                "Correo o contrasena incorrectos"
            "email not confirmed" in msg ->
                "Confirma tu correo antes de ingresar"
            "too many requests" in msg || "rate limit" in msg ->
                "Demasiados intentos. Intenta en unos minutos"
            "network" in msg || "timeout" in msg || "connect" in msg ->
                "Sin conexion a internet"
            "cancelled" in msg || "canceled" in msg ->
                "Inicio de sesion cancelado"
            "no credentials available" in msg || "no credential" in msg ->
                "No se encontraron cuentas de Google en este dispositivo"
            else -> "Error al iniciar sesion"
        }
    }

    fun onLogin() {
        val state = _uiState.value
        if (state.email.isBlank() || state.password.isBlank()) return
        if (state.isLoading || state.isGoogleLoading) return

        _uiState.update { it.copy(isLoading = true, error = null) }

        viewModelScope.launch {
            val result = authRepository.login(state.email.trim(), state.password)
            result.fold(
                onSuccess = { user ->
                    _uiState.update { it.copy(isLoading = false, loggedInUser = user) }
                    registerFcmToken(user.id)
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = mapErrorMessage(error),
                        )
                    }
                },
            )
        }
    }

    fun onGoogleSignIn(idToken: String) {
        if (_uiState.value.isLoading || _uiState.value.isGoogleLoading) return

        _uiState.update { it.copy(isGoogleLoading = true, error = null) }

        viewModelScope.launch {
            val result = authRepository.loginWithGoogle(idToken)
            result.fold(
                onSuccess = { user ->
                    _uiState.update { it.copy(isGoogleLoading = false, loggedInUser = user) }
                    registerFcmToken(user.id)
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isGoogleLoading = false,
                            error = mapErrorMessage(error),
                        )
                    }
                },
            )
        }
    }

    fun onGoogleSignInError(error: Throwable) {
        Timber.e(error, "[Auth] Google sign-in error")
        _uiState.update {
            it.copy(
                isGoogleLoading = false,
                error = mapErrorMessage(error),
            )
        }
    }

    /** Register FCM token in Supabase after successful login (fire-and-forget) */
    private fun registerFcmToken(userId: String) {
        viewModelScope.launch {
            try {
                val token = FirebaseMessaging.getInstance().token.await()
                notificationRepository.registerFcmToken(token)
                Timber.d("[FCM] Token registered for user $userId")
            } catch (e: Exception) {
                Timber.w(e, "[FCM] Failed to register FCM token (non-fatal)")
            }
        }
    }
}

