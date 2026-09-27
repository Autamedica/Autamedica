package com.autamedica.android.presentation.patients.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.presentation.common.UiErrorMapper
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConsultationReport(
    val id: String,
    val date: String,
    val diagnosis: String,
    val instructions: String,
    val doctorName: String
)

data class ConsultationReportsUiState(
    val isLoading: Boolean = true,
    val reports: List<ConsultationReport> = emptyList(),
    val error: String? = null
)

class ConsultationReportsViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(ConsultationReportsUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadReports()
    }

    private fun loadReports() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                delay(1000)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        reports = listOf(
                            ConsultationReport(
                                id = "1",
                                date = "2026-08-15T10:00:00Z",
                                diagnosis = "Hipertensión Arterial",
                                instructions = "Continuar con Enalapril 10mg. Control de PA semanal.",
                                doctorName = "Dr. Silva"
                            ),
                            ConsultationReport(
                                id = "2",
                                date = "2026-07-10T15:30:00Z",
                                diagnosis = "Chequeo General",
                                instructions = "Laboratorio completo en ayunas.",
                                doctorName = "Dra. Gómez"
                            )
                        )
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = UiErrorMapper.map(e, "No se pudieron cargar los reportes")) }
            }
        }
    }
}
