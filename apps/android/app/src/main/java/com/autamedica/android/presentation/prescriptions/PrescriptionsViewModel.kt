package com.autamedica.android.presentation.prescriptions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionDispensation
import com.autamedica.android.domain.repository.MedicalCertificateRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.presentation.common.UiErrorMapper
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class DocumentTab(val label: String) {
    RECETAS("Recetas"),
    ATESTADOS("Atestados"),
}

enum class PrescriptionFilter(val label: String) {
    TODAS("Todas"),
    ACTIVAS("Activas"),
    DISPENSADAS("Dispensadas"),
    COMPLETADAS("Completadas"),
}

data class PrescriptionsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val selectedTab: DocumentTab = DocumentTab.RECETAS,
    val prescriptions: List<Prescription> = emptyList(),
    val certificates: List<MedicalCertificate> = emptyList(),
    val selectedFilter: PrescriptionFilter = PrescriptionFilter.TODAS,
    val selectedPrescription: Prescription? = null,
    val selectedCertificate: MedicalCertificate? = null,
    val dispensation: PrescriptionDispensation? = null,
    val dispensationLoading: Boolean = false,
    val dispensationError: String? = null,
    val error: String? = null,
) {
    val activeCount: Int
        get() = prescriptions.count { it.isActive }

    val activeCertificatesCount: Int
        get() = certificates.count { it.isActive }

    val filteredPrescriptions: List<Prescription>
        get() = when (selectedFilter) {
            PrescriptionFilter.TODAS -> prescriptions
            PrescriptionFilter.ACTIVAS -> prescriptions.filter { it.isActive }
            PrescriptionFilter.DISPENSADAS -> prescriptions.filter { it.isDispensed }
            PrescriptionFilter.COMPLETADAS -> prescriptions.filter { it.isCompleted }
        }
}

@HiltViewModel
class PrescriptionsViewModel @Inject constructor(
    private val prescriptionRepository: PrescriptionRepository,
    private val certificateRepository: MedicalCertificateRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PrescriptionsUiState())
    val uiState: StateFlow<PrescriptionsUiState> = _uiState.asStateFlow()

    init {
        loadDocuments()
    }

    fun loadDocuments() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            fetchDocumentsInternal()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            fetchDocumentsInternal()
        }
    }

    private suspend fun fetchDocumentsInternal() {
        val rxResult = prescriptionRepository.getPatientPrescriptions()
        val certResult = certificateRepository.getPatientCertificates()

        val prescriptions = rxResult.getOrDefault(emptyList())
        val certificates = certResult.getOrDefault(emptyList())

        val error = if (rxResult.isFailure && certResult.isFailure) {
            rxResult.exceptionOrNull()?.message ?: "No se pudieron cargar los documentos."
        } else null

        _uiState.update {
            it.copy(
                isLoading = false,
                isRefreshing = false,
                prescriptions = prescriptions,
                certificates = certificates,
                error = error,
            )
        }
    }

    fun selectTab(tab: DocumentTab) {
        _uiState.update { it.copy(selectedTab = tab) }
    }

    fun selectPrescription(prescription: Prescription) {
        _uiState.update { it.copy(selectedPrescription = prescription) }
        loadDispensation(prescription.id)
    }

    private fun loadDispensation(prescriptionId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(dispensation = null, dispensationLoading = true, dispensationError = null) }
            val result = prescriptionRepository.getPrescriptionDispensation(prescriptionId)
            _uiState.update { state ->
                result.fold(
                    onSuccess = { dispensation ->
                        state.copy(dispensation = dispensation, dispensationLoading = false, dispensationError = null)
                    },
                    onFailure = { failure ->
                        state.copy(dispensation = null, dispensationLoading = false, dispensationError = UiErrorMapper.map(failure, "No se pudo completar la dispensación"))
                    },
                )
            }
        }
    }

    fun clearSelectedPrescription() {
        _uiState.update {
            it.copy(
                selectedPrescription = null,
                dispensation = null,
                dispensationLoading = false,
                dispensationError = null,
            )
        }
    }

    fun selectCertificate(certificate: MedicalCertificate) {
        _uiState.update { it.copy(selectedCertificate = certificate) }
    }

    fun clearSelectedCertificate() {
        _uiState.update { it.copy(selectedCertificate = null) }
    }

    fun setFilter(filter: PrescriptionFilter) {
        _uiState.update { it.copy(selectedFilter = filter) }
    }
}
