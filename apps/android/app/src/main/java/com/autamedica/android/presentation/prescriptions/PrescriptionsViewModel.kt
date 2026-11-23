package com.autamedica.android.presentation.prescriptions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.DownloadedPrescriptionPdf
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.repository.MedicalCertificateRepository
import com.autamedica.android.domain.repository.MedicalOrderRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.logging.SecureLog
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
    ORDENES("Órdenes"),
}

enum class PrescriptionFilter(val label: String) {
    TODAS("Todas"),
    ACTIVAS("Activas"),
    DISPENSADAS("Dispensadas"),
    COMPLETADAS("Completadas"),
}

fun MedicalOrder.isConfirmedOrder(): Boolean =
    status.lowercase() in setOf("active", "activa", "issued", "emitida", "signed", "firmada", "completed", "completada")

data class PrescriptionsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val selectedTab: DocumentTab = DocumentTab.RECETAS,
    val prescriptions: List<Prescription> = emptyList(),
    val certificates: List<MedicalCertificate> = emptyList(),
    val orders: List<MedicalOrder> = emptyList(),
    val selectedFilter: PrescriptionFilter = PrescriptionFilter.TODAS,
    val selectedPrescription: Prescription? = null,
    val selectedCertificate: MedicalCertificate? = null,
    val selectedOrder: MedicalOrder? = null,
    val error: String? = null,
    val downloadedPdf: DownloadedPrescriptionPdf? = null,
    val isDownloadingPdf: Boolean = false,
    val pdfDownloadFailed: Boolean = false,
) {
    val activeCount: Int
        get() = prescriptions.count { it.isActive }

    val activeCertificatesCount: Int
        get() = certificates.count { it.isActive }

    val activeOrdersCount: Int
        get() = orders.count { it.isConfirmedOrder() }

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
    private val medicalOrderRepository: MedicalOrderRepository,
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
        val orderResult = medicalOrderRepository.getPatientMedicalOrders()

        val rxError = rxResult.exceptionOrNull()
        val certificateError = certResult.exceptionOrNull()
        val orderError = orderResult.exceptionOrNull()

        _uiState.update { current ->
            val partialErrors = buildList {
                rxError?.let { add("Recetas: " + (it.message ?: "no se pudieron actualizar")) }
                certificateError?.let { add("Certificados: " + (it.message ?: "no se pudieron actualizar")) }
                orderError?.let { add("Órdenes: " + (it.message ?: "no se pudieron actualizar")) }
            }
            current.copy(
                isLoading = false,
                isRefreshing = false,
                prescriptions = rxResult.getOrElse { current.prescriptions },
                certificates = certResult.getOrElse { current.certificates },
                orders = orderResult.getOrElse { current.orders },
                error = partialErrors.takeIf { it.isNotEmpty() }?.joinToString(". "),
            )
        }
    }

    fun selectTab(tab: DocumentTab) {
        _uiState.update { it.copy(selectedTab = tab) }
    }

    fun selectPrescription(prescription: Prescription) {
        _uiState.update { it.copy(selectedPrescription = prescription) }
    }

    fun clearSelectedPrescription() {
        _uiState.update { it.copy(selectedPrescription = null) }
    }

    fun selectCertificate(certificate: MedicalCertificate) {
        _uiState.update { it.copy(selectedCertificate = certificate) }
    }

    fun clearSelectedCertificate() {
        _uiState.update { it.copy(selectedCertificate = null) }
    }

    fun selectOrder(order: MedicalOrder) {
        _uiState.update { it.copy(selectedOrder = order) }
    }

    fun clearSelectedOrder() {
        _uiState.update { it.copy(selectedOrder = null) }
    }

    fun openCertificatePdf(
        certificate: MedicalCertificate,
        onReady: (String) -> Unit,
        onFailure: () -> Unit,
    ) {
        viewModelScope.launch {
            if (certificate.source == "memed_br") {
                val rowId = certificate.id.removePrefix("memed-")
                prescriptionRepository.downloadPatientPrescriptionPdf("memed:" + rowId)
                    .onSuccess { downloaded -> onReady(downloaded.localPath) }
                    .onFailure { error ->
                        SecureLog.error("[Certificates] Memed atestado PDF download unavailable", error)
                        onFailure()
                    }
            } else {
                certificateRepository.getCertificatePdfDownloadUrl(certificate)
                    .onSuccess(onReady)
                    .onFailure { error ->
                        SecureLog.error("[Certificates] Authenticated PDF download URL unavailable", error)
                        onFailure()
                    }
            }
        }
    }

    fun openMedicalOrderPdf(
        order: MedicalOrder,
        onReady: (String) -> Unit,
        onFailure: () -> Unit,
    ) {
        viewModelScope.launch {
            medicalOrderRepository.getMedicalOrderPdfDownloadUrl(order)
                .onSuccess(onReady)
                .onFailure { error ->
                    SecureLog.error("[MedicalOrders] Authenticated PDF download URL unavailable", error)
                    onFailure()
                }
        }
    }

    fun setFilter(filter: PrescriptionFilter) {
        _uiState.update { it.copy(selectedFilter = filter) }
    }

    fun downloadPrescriptionPdf(prescription: Prescription) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(isDownloadingPdf = true, downloadedPdf = null, pdfDownloadFailed = false)
            }
            val result = prescriptionRepository.downloadPatientPrescriptionPdf(prescription.id)
            _uiState.update {
                it.copy(
                    isDownloadingPdf = false,
                    downloadedPdf = result.getOrNull(),
                    pdfDownloadFailed = result.isFailure,
                )
            }
        }
    }

    fun clearDownloadedPdf() {
        _uiState.update { it.copy(downloadedPdf = null) }
    }

    fun clearPdfDownloadFailure() {
        _uiState.update { it.copy(pdfDownloadFailed = false) }
    }
}
