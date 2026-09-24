package com.autamedica.android.presentation.doctors.consultations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

data class ConsultationReportState(
    val isLoading: Boolean = false,
    val isSaved: Boolean = false,
    val error: String? = null,
    val errorRes: Int? = null,
)

class DoctorConsultationReportViewModel : ViewModel() {
    private val _state = MutableStateFlow(ConsultationReportState())
    val state: StateFlow<ConsultationReportState> = _state.asStateFlow()

    fun saveReport(appointmentId: String, notes: String, diagnosis: String, treatmentPlan: String) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null, errorRes = null) }
            delay(1500)
            if (notes.isNotBlank() && diagnosis.isNotBlank()) {
                _state.update { it.copy(isLoading = false, isSaved = true) }
            } else {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = null,
                        errorRes = R.string.report_error_missing_data
                    )
                }
            }
        }
    }
}
