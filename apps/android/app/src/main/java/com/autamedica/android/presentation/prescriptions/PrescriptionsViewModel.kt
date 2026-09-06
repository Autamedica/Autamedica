package com.autamedica.android.presentation.prescriptions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PrescriptionsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val prescriptions: List<Prescription> = emptyList(),
    val selectedPrescription: Prescription? = null,
    val error: String? = null,
)

@HiltViewModel
class PrescriptionsViewModel @Inject constructor(
    private val prescriptionRepository: PrescriptionRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PrescriptionsUiState())
    val uiState: StateFlow<PrescriptionsUiState> = _uiState.asStateFlow()

    init {
        loadPrescriptions()
    }

    fun loadPrescriptions() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            fetchPrescriptionsInternal()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            fetchPrescriptionsInternal()
        }
    }

    private suspend fun fetchPrescriptionsInternal() {
        prescriptionRepository.getPatientPrescriptions()
            .onSuccess { list ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        prescriptions = list,
                        error = null,
                    )
                }
            }
            .onFailure { err ->
                SecureLog.error("[PrescriptionsVM] Error fetching prescriptions", err)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = err.message ?: "No se pudieron cargar las recetas.",
                    )
                }
            }
    }

    fun selectPrescription(prescription: Prescription) {
        _uiState.update { it.copy(selectedPrescription = prescription) }
    }

    fun clearSelectedPrescription() {
        _uiState.update { it.copy(selectedPrescription = null) }
    }
}
