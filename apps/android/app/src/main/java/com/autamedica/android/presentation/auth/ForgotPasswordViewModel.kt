package com.autamedica.android.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.data.remote.SupabaseAuthDataSource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class ForgotPasswordUiState(
    val email: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null
)

@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val authDataSource: SupabaseAuthDataSource
) : ViewModel() {

    private val _uiState = MutableStateFlow(ForgotPasswordUiState())
    val uiState: StateFlow<ForgotPasswordUiState> = _uiState.asStateFlow()

    fun onEmailChange(email: String) {
        _uiState.update { it.copy(email = email, error = null, successMessage = null) }
    }

    fun onSubmit() {
        val state = _uiState.value
        if (state.email.isBlank()) return

        _uiState.update { it.copy(isLoading = true, error = null, successMessage = null) }
        viewModelScope.launch {
            try {
                authDataSource.sendPasswordResetEmail(state.email.trim())
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        successMessage = "Si la cuenta existe, hemos enviado un enlace de recuperación."
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = UiErrorMapper.map(e, "Ocurrió un error. Intenta nuevamente.")
                    )
                }
            }
        }
    }
}
