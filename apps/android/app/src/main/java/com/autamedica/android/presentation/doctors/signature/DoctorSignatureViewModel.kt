package com.autamedica.android.presentation.doctors.signature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

data class DoctorSignatureState(
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val errorMessage: String? = null,
    val sisaValidated: Boolean = false
)

class DoctorSignatureViewModel : ViewModel() {
    private val _state = MutableStateFlow(DoctorSignatureState())
    val state: StateFlow<DoctorSignatureState> = _state.asStateFlow()

    fun validateWithSisaRefeps(medicalLicense: String) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            delay(1000) // Simulate API call
            if (medicalLicense.isNotBlank()) {
                _state.update { it.copy(isLoading = false, sisaValidated = true) }
            } else {
                _state.update { it.copy(isLoading = false, errorMessage = "Licencia médica inválida") }
            }
        }
    }

    fun saveSignature(signatureData: ByteArray) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            delay(1500) // Simulate saving
            if (_state.value.sisaValidated) {
                _state.update { it.copy(isLoading = false, isSuccess = true) }
            } else {
                _state.update { it.copy(isLoading = false, errorMessage = "Debe validar con SISA antes de guardar") }
            }
        }
    }

    fun clearError() {
        _state.update { it.copy(errorMessage = null) }
    }
}
