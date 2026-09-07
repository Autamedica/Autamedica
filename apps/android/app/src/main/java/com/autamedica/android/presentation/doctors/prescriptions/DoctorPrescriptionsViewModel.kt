package com.autamedica.android.presentation.doctors.prescriptions

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DoctorPrescriptionsUiState(
    val isLoading: Boolean = false,
    val issuedPrescriptions: List<String> = emptyList(),
    val associatedPatients: List<String> = emptyList(),
    val statuses: List<String> = emptyList() // emitida, dispensada, vencida
)

class DoctorPrescriptionsViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(DoctorPrescriptionsUiState())
    val uiState: StateFlow<DoctorPrescriptionsUiState> = _uiState.asStateFlow()

    fun emitPrescription() {
        // Implement logic
    }
}
