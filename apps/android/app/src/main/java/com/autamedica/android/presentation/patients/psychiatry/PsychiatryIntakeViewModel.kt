package com.autamedica.android.presentation.patients.psychiatry

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject

data class PsychiatryIntakeUiState(
    val reasonForVisit: String = "",
    val currentMedication: String = "",
    val previousHistory: String = "",
    val isLoading: Boolean = false,
    val isSubmitted: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class PsychiatryIntakeViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(PsychiatryIntakeUiState())
    val uiState: StateFlow<PsychiatryIntakeUiState> = _uiState.asStateFlow()

    fun onReasonForVisitChanged(reason: String) {
        _uiState.update { it.copy(reasonForVisit = reason) }
    }

    fun onCurrentMedicationChanged(medication: String) {
        _uiState.update { it.copy(currentMedication = medication) }
    }

    fun onPreviousHistoryChanged(history: String) {
        _uiState.update { it.copy(previousHistory = history) }
    }

    fun submitIntake() {
        _uiState.update { it.copy(isLoading = true) }
        // Simulate network request
        _uiState.update { it.copy(isLoading = false, isSubmitted = true) }
    }
}
