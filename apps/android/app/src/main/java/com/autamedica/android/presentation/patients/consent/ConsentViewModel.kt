package com.autamedica.android.presentation.patients.consent

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConsentUiState(
    val hasReadConsent: Boolean = false,
    val isAccepted: Boolean = false,
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

class ConsentViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(ConsentUiState())
    val uiState: StateFlow<ConsentUiState> = _uiState.asStateFlow()

    fun onReadConsentChanged(hasRead: Boolean) {
        _uiState.update { it.copy(hasReadConsent = hasRead) }
    }

    fun onAcceptedChanged(isAccepted: Boolean) {
        _uiState.update { it.copy(isAccepted = isAccepted) }
    }

    fun submitConsent() {
        if (!_uiState.value.hasReadConsent || !_uiState.value.isAccepted) return
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                // Simulate network call
                delay(1000)
                _uiState.update { it.copy(isLoading = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}
