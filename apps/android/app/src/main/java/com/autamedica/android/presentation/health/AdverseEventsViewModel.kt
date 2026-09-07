package com.autamedica.android.presentation.health

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

@HiltViewModel
class AdverseEventsViewModel @Inject constructor() : ViewModel() {
    private val _uiState = MutableStateFlow(AdverseEventsUiState())
    val uiState = _uiState.asStateFlow()

    fun onMedicationChange(value: String) {
        _uiState.value = _uiState.value.copy(medication = value)
    }

    fun onSeverityChange(value: String) {
        _uiState.value = _uiState.value.copy(severity = value)
    }

    fun onDescriptionChange(value: String) {
        _uiState.value = _uiState.value.copy(description = value)
    }
}

data class AdverseEventsUiState(
    val medication: String = "",
    val severity: String = "Leve",
    val description: String = ""
)
