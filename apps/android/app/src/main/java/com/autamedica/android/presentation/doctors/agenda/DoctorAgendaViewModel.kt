package com.autamedica.android.presentation.doctors.agenda

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DoctorAgendaUiState(
    val isLoading: Boolean = false,
    val timeSlots: List<String> = emptyList(),
    val activeDays: List<String> = emptyList(),
    val scheduledAppointments: List<String> = emptyList(),
    val onCallShifts: List<String> = emptyList()
)

class DoctorAgendaViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(DoctorAgendaUiState())
    val uiState: StateFlow<DoctorAgendaUiState> = _uiState.asStateFlow()

    fun toggleDay(day: String) {
        // Implementation for active days
    }

    fun saveAvailability() {
        // Save to Supabase
    }
}
