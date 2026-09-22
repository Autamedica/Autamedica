package com.autamedica.android.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class RegisterUiState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val selectedRole: UserRole = UserRole.PATIENT,
    val acceptedTerms: Boolean = false,
    val isLoading: Boolean = false,
    val isGoogleLoading: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
    val isRegistered: Boolean = false,
    val loggedInUser: User? = null
)

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    private val emailRegex = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\$")

    fun onEmailChange(email: String) {
        _uiState.update { it.copy(email = email, error = null) }
    }

    fun onPasswordChange(password: String) {
        _uiState.update { it.copy(password = password, error = null) }
    }

    fun onConfirmPasswordChange(confirmPassword: String) {
        _uiState.update { it.copy(confirmPassword = confirmPassword, error = null) }
    }

    fun onRoleChange(role: UserRole) {
        _uiState.update { it.copy(selectedRole = role, error = null) }
    }

    fun onTermsToggle(accepted: Boolean) {
        _uiState.update { it.copy(acceptedTerms = accepted, error = null) }
    }

    fun onRegister() {
        val currentState = _uiState.value
        
        if (currentState.email.isBlank() || !emailRegex.matches(currentState.email)) {
            _uiState.update { it.copy(error = "Correo electrónico no válido") }
            return
        }

        if (currentState.password != currentState.confirmPassword) {
            _uiState.update { it.copy(error = "Las contraseñas no coinciden") }
            return
        }

        if (currentState.password.length < 6) {
            _uiState.update { it.copy(error = "La contraseña debe tener al menos 6 caracteres") }
            return
        }

        if (!currentState.acceptedTerms) {
            _uiState.update { it.copy(error = "Debes aceptar los términos y condiciones") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null, successMessage = null) }

        viewModelScope.launch {
            try {
                val result = authRepository.register(
                    email = currentState.email,
                    password = currentState.password,
                    selectedRole = currentState.selectedRole
                )

                result.fold(
                    onSuccess = { registrationResult ->
                        if (registrationResult.requiresEmailConfirmation) {
                            _uiState.update { 
                                it.copy(
                                    isLoading = false,
                                    isRegistered = true,
                                    successMessage = "Por favor confirma tu correo electrónico para continuar."
                                ) 
                            }
                        } else {
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    isRegistered = true,
                                    loggedInUser = registrationResult.user
                                )
                            }
                        }
                    },
                    onFailure = { error ->
                        val errorMsg = UiErrorMapper.map(error, "Error al crear la cuenta")
                        _uiState.update { it.copy(isLoading = false, error = errorMsg) }
                    }
                )
            } catch (e: Exception) {
                SecureLog.error("Unexpected error in onRegister", e)
                _uiState.update { it.copy(isLoading = false, error = "Error inesperado al crear la cuenta") }
            }
        }
    }

    fun onGoogleSignIn(idToken: String) {
        _uiState.update { it.copy(isGoogleLoading = true, error = null) }

        viewModelScope.launch {
            try {
                val result = authRepository.loginWithGoogle(idToken, _uiState.value.selectedRole)
                result.fold(
                    onSuccess = { user ->
                        _uiState.update {
                            it.copy(
                                isGoogleLoading = false,
                                isRegistered = true,
                                loggedInUser = user
                            )
                        }
                    },
                    onFailure = { error ->
                        val errorMsg = UiErrorMapper.map(error, "Error al iniciar sesión con Google")
                        _uiState.update { it.copy(isGoogleLoading = false, error = errorMsg) }
                    }
                )
            } catch (e: Exception) {
                SecureLog.error("Unexpected error in onGoogleSignIn", e)
                _uiState.update { it.copy(isGoogleLoading = false, error = "Error inesperado") }
            }
        }
    }

    fun onGoogleSignInError(e: Throwable) {
        if (e !is androidx.credentials.exceptions.GetCredentialCancellationException) {
            _uiState.update { it.copy(isGoogleLoading = false, error = UiErrorMapper.map(e, "Error al autenticar con Google")) }
        } else {
            _uiState.update { it.copy(isGoogleLoading = false) }
        }
    }
}
