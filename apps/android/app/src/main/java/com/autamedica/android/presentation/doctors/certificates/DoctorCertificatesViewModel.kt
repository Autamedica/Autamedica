package com.autamedica.android.presentation.doctors.certificates

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.CreateCertificateRequest
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.repository.MedicalCertificateRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.presentation.common.UiErrorMapper
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class DoctorCertificatesUiState(
    val isLoading: Boolean = false,
    val certificates: List<MedicalCertificate> = emptyList(),
    val filteredCertificates: List<MedicalCertificate> = emptyList(),
    val selectedStatusFilter: String = "todos", // todos, validos, cancelados
    val searchQuery: String = "",
    val totalCount: Int = 0,
    val validCount: Int = 0,
    val cancelledCount: Int = 0,

    // Formulario de emisión
    val patientId: String = "",
    val selectedPatient: PrescriptionPatientItem? = null,
    val eligiblePatients: List<PrescriptionPatientItem> = emptyList(),
    val isLoadingPatients: Boolean = false,
    val doctorEligibility: DoctorEligibility? = null,
    val isLoadingEligibility: Boolean = false,

    val certificateType: CertificateType = CertificateType.REPOSO_LABORAL,
    val daysOfRest: Int = 2,
    val startDate: String = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
    val endDate: String = LocalDate.now().plusDays(2).format(DateTimeFormatter.ISO_LOCAL_DATE),
    val diagnosis: String = "",
    val diagnosisCode: String? = null,
    val hideDiagnosis: Boolean = false,
    val observations: String = "",

    val isSubmitting: Boolean = false,
    val createdCertificate: MedicalCertificate? = null,
    val createError: String? = null,
    val userMessage: String? = null,
)

@HiltViewModel
class DoctorCertificatesViewModel @Inject constructor(
    private val certificateRepository: MedicalCertificateRepository,
    private val prescriptionRepository: PrescriptionRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorCertificatesUiState())
    val uiState: StateFlow<DoctorCertificatesUiState> = _uiState.asStateFlow()

    init {
        loadCertificates()
        loadEligibility()
    }

    fun loadCertificates() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            certificateRepository.getDoctorCertificates()
                .onSuccess { list ->
                    val total = list.size
                    val valid = list.count { it.status == "signed" }
                    val cancelled = list.count { it.status == "cancelled" }

                    _uiState.update { current ->
                        val filtered = applyFilterAndSearch(list, current.selectedStatusFilter, current.searchQuery)
                        current.copy(
                            isLoading = false,
                            certificates = list,
                            filteredCertificates = filtered,
                            totalCount = total,
                            validCount = valid,
                            cancelledCount = cancelled,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            userMessage = "No se pudieron cargar los atestados: ${error.localizedMessage ?: "Error de red"}",
                        )
                    }
                }
        }
    }

    fun loadEligibility() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEligibility = true) }
            prescriptionRepository.getDoctorEligibility()
                .onSuccess { eligibility ->
                    _uiState.update { it.copy(isLoadingEligibility = false, doctorEligibility = eligibility) }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingEligibility = false) }
                }
        }
    }

    fun onSearchQueryChange(query: String) {
        _uiState.update { current ->
            val filtered = applyFilterAndSearch(current.certificates, current.selectedStatusFilter, query)
            current.copy(searchQuery = query, filteredCertificates = filtered)
        }
    }

    fun onSelectStatusFilter(filter: String) {
        _uiState.update { current ->
            val filtered = applyFilterAndSearch(current.certificates, filter, current.searchQuery)
            current.copy(selectedStatusFilter = filter, filteredCertificates = filtered)
        }
    }

    fun initCreateCertificate(patientId: String = "") {
        viewModelScope.launch {
            val todayStr = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)
            val defaultEndStr = LocalDate.now().plusDays(2).format(DateTimeFormatter.ISO_LOCAL_DATE)

            _uiState.update {
                it.copy(
                    patientId = patientId,
                    selectedPatient = null,
                    certificateType = CertificateType.REPOSO_LABORAL,
                    daysOfRest = 2,
                    startDate = todayStr,
                    endDate = defaultEndStr,
                    diagnosis = "",
                    diagnosisCode = null,
                    hideDiagnosis = false,
                    observations = "",
                    createError = null,
                    createdCertificate = null,
                    isLoadingPatients = true,
                )
            }

            certificateRepository.getEligiblePatients()
                .onSuccess { patients ->
                    val preselected = if (patientId.isNotBlank()) {
                        patients.firstOrNull { it.patientId == patientId }
                    } else null

                    _uiState.update {
                        it.copy(
                            isLoadingPatients = false,
                            eligiblePatients = patients,
                            selectedPatient = preselected,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoadingPatients = false,
                            createError = "Error al cargar lista de pacientes: ${UiErrorMapper.map(error, "Fallo de conexión")}",
                        )
                    }
                }
        }
    }

    fun onSelectPatient(patient: PrescriptionPatientItem) {
        _uiState.update {
            it.copy(
                selectedPatient = patient,
                patientId = patient.patientId,
                createError = null,
            )
        }
    }

    fun onSelectType(type: CertificateType) {
        _uiState.update { current ->
            val defaultDays = when (type) {
                CertificateType.REPOSO_LABORAL -> 2
                CertificateType.REPOSO_ESCOLAR -> 2
                CertificateType.APTITUD_FISICA -> 0
                CertificateType.CONSTANCIA_ATENCION -> 0
                CertificateType.TRATAMIENTO -> 30
                CertificateType.OTRO -> 1
            }
            val calculatedEnd = calculateEndDate(current.startDate, defaultDays)
            current.copy(
                certificateType = type,
                daysOfRest = defaultDays,
                endDate = calculatedEnd,
                createError = null,
            )
        }
    }

    fun onDaysOfRestChange(days: Int) {
        val safeDays = days.coerceIn(0, 365)
        _uiState.update { current ->
            val calculatedEnd = calculateEndDate(current.startDate, safeDays)
            current.copy(daysOfRest = safeDays, endDate = calculatedEnd, createError = null)
        }
    }

    fun onStartDateChange(date: String) {
        _uiState.update { current ->
            val calculatedEnd = calculateEndDate(date, current.daysOfRest)
            current.copy(startDate = date, endDate = calculatedEnd)
        }
    }

    fun onDiagnosisChange(diagnosis: String, code: String? = null) {
        _uiState.update { it.copy(diagnosis = diagnosis, diagnosisCode = code, createError = null) }
    }

    fun onToggleHideDiagnosis(hide: Boolean) {
        _uiState.update { it.copy(hideDiagnosis = hide) }
    }

    fun onObservationsChange(observations: String) {
        _uiState.update { it.copy(observations = observations) }
    }

    fun onSubmitCertificate() {
        val state = _uiState.value

        val patient = state.selectedPatient
        if (patient == null || state.patientId.isBlank()) {
            _uiState.update { it.copy(createError = "Seleccione un paciente de la lista") }
            return
        }

        if (state.diagnosis.trim().isBlank()) {
            _uiState.update { it.copy(createError = "Ingrese un diagnóstico o motivo clínico de la certificación") }
            return
        }

        val eligibility = state.doctorEligibility
        if (eligibility != null && !eligibility.isEligible) {
            _uiState.update {
                it.copy(
                    createError = eligibility.reason
                        ?: "No posee habilitación profesional activa para emitir certificados oficiales"
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, createError = null) }

            val request = CreateCertificateRequest(
                patientId = state.patientId,
                certificateType = state.certificateType,
                daysOfRest = state.daysOfRest,
                startDate = state.startDate,
                endDate = if (state.daysOfRest > 0) state.endDate else null,
                diagnosis = state.diagnosis.trim(),
                hideDiagnosis = state.hideDiagnosis,
                observations = state.observations.trim().ifEmpty { null },
                countryCode = "AR",
            )

            certificateRepository.createCertificate(request)
                .onSuccess { certificate ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            createdCertificate = certificate,
                            userMessage = "Atestado médico emitido con éxito. CUIR: ${certificate.cuir}",
                        )
                    }
                    loadCertificates()
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            createError = "Error al emitir el certificado: ${UiErrorMapper.map(error, "Fallo de conexión")}",
                        )
                    }
                }
        }
    }

    fun clearCreatedCertificate() {
        _uiState.update { it.copy(createdCertificate = null) }
    }

    fun clearUserMessage() {
        _uiState.update { it.copy(userMessage = null) }
    }

    private fun calculateEndDate(startDateStr: String, days: Int): String {
        if (days <= 0) return startDateStr
        return runCatching {
            val start = LocalDate.parse(startDateStr)
            start.plusDays(days.toLong()).format(DateTimeFormatter.ISO_LOCAL_DATE)
        }.getOrDefault(startDateStr)
    }

    private fun applyFilterAndSearch(
        list: List<MedicalCertificate>,
        statusFilter: String,
        searchQuery: String,
    ): List<MedicalCertificate> {
        return list.filter { cert ->
            val matchesFilter = when (statusFilter) {
                "validos" -> cert.status == "signed"
                "cancelados" -> cert.status == "cancelled"
                else -> true
            }

            val query = searchQuery.trim().lowercase()
            val matchesSearch = if (query.isEmpty()) {
                true
            } else {
                cert.cuir.lowercase().contains(query) ||
                    (cert.patientName?.lowercase()?.contains(query) == true) ||
                    (cert.patientDni?.lowercase()?.contains(query) == true) ||
                    (cert.diagnosis?.lowercase()?.contains(query) == true) ||
                    cert.certificateType.displayName.lowercase().contains(query)
            }

            matchesFilter && matchesSearch
        }
    }
}
