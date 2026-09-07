package com.autamedica.android.presentation.doctors.medicalorders

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DoctorMedicalOrdersUiState(
    val isLoading: Boolean = false,
    val orders: List<String> = emptyList() // laboratorio, imágenes, derivaciones
)

class DoctorMedicalOrdersViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(DoctorMedicalOrdersUiState())
    val uiState: StateFlow<DoctorMedicalOrdersUiState> = _uiState.asStateFlow()

    fun createOrder() {
        // Implement logic
    }
}
