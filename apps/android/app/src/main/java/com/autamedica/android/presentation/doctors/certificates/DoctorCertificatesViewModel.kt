package com.autamedica.android.presentation.doctors.certificates

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.R
import com.autamedica.android.data.repository.MemedMobileBridgeRepository
import com.autamedica.android.data.repository.MemedMobileLaunchSession
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.CreateCertificateRequest
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.repository.MedicalCertificateRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import com.autamedica.android.presentation.common.UiErrorMapper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.ZoneId
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
    val isRegisteringDni: Boolean = false,
    val dniLookupError: String? = null,
    val needsManualName: Boolean = false,
    val doctorEligibility: DoctorEligibility? = null,
    val isLoadingEligibility: Boolean = false,

    val certificateType: CertificateType = CertificateType.REPOSO_LABORAL,
    val daysOfRest: Int = 2,
    val restHours: Int = 0,
    val restPeriodUnit: String = "days",
    val startDate: String = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
    val endDate: String? = LocalDate.now().plusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE),
    val diagnosis: String = "",
    val diagnosisCode: String? = null,
    val hideDiagnosis: Boolean = false,
    val observations: String = "",

    val isSubmitting: Boolean = false,
    val isOpeningMemed: Boolean = false,
    val memedSession: MemedMobileLaunchSession? = null,
    val createdCertificate: MedicalCertificate? = null,
    val createError: String? = null,
    val createErrorRes: Int? = null,
    val createErrorArg: String? = null,
    val userMessage: String? = null,
    val userMessageRes: Int? = null,
    val userMessageArg: String? = null,
)

@HiltViewModel
class DoctorCertificatesViewModel private constructor(
    private val certificateRepository: MedicalCertificateRepository,
    private val prescriptionRepository: PrescriptionRepository,
    private val memedMobileBridgeRepository: MemedMobileBridgeRepository?,
    @Suppress("UNUSED_PARAMETER") nullableMarker: Unit,
) : ViewModel() {

    @Inject
    constructor(
        certificateRepository: MedicalCertificateRepository,
        prescriptionRepository: PrescriptionRepository,
        memedMobileBridgeRepository: MemedMobileBridgeRepository,
    ) : this(certificateRepository, prescriptionRepository, memedMobileBridgeRepository, Unit)

    constructor(
        certificateRepository: MedicalCertificateRepository,
        prescriptionRepository: PrescriptionRepository,
    ) : this(certificateRepository, prescriptionRepository, null, Unit)

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
                    val valid = list.count { it.isActive }
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
                            userMessage = null,
                            userMessageRes = R.string.cert_error_load_failed,
                            userMessageArg = UiErrorMapper.map(error, "No se pudieron cargar los certificados"),
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
            var eligibility = _uiState.value.doctorEligibility
            if (eligibility == null) {
                eligibility = prescriptionRepository.getDoctorEligibility().getOrNull()
                _uiState.update {
                    it.copy(
                        doctorEligibility = eligibility,
                        isLoadingEligibility = false,
                    )
                }
            }
            val countryCode = eligibility?.countryCode
            val zoneId = when (countryCode) {
                "BR" -> ZoneId.of("America/Sao_Paulo")
                "AR" -> ZoneId.of("America/Argentina/Buenos_Aires")
                else -> ZoneId.systemDefault()
            }
            val today = LocalDate.now(zoneId)
            val todayStr = today.format(DateTimeFormatter.ISO_LOCAL_DATE)
            val defaultEndStr = today.plusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE)

            _uiState.update {
                it.copy(
                    patientId = patientId,
                    selectedPatient = null,
                    certificateType = CertificateType.REPOSO_LABORAL,
                    daysOfRest = 2,
                    restHours = 0,
                    restPeriodUnit = "days",
                    startDate = todayStr,
                    endDate = defaultEndStr,
                    diagnosis = "",
                    diagnosisCode = null,
                    hideDiagnosis = countryCode == "BR",
                    observations = "",
                    createError = null,
                    createErrorRes = null,
                    createErrorArg = null,
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
                            createError = null,
                            createErrorRes = R.string.cert_error_load_patients,
                            createErrorArg = UiErrorMapper.map(error, "No se pudieron cargar los pacientes"),
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
                createErrorRes = null,
                createErrorArg = null,
                dniLookupError = null,
                needsManualName = false,
            )
        }
    }

    fun registerEventualPatientByDni(
        dni: String,
        gender: String,
        contact: String,
        manualName: String? = null,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isRegisteringDni = true, dniLookupError = null) }
            prescriptionRepository.registerOrLookupEventualPatient(
                documentNumber = dni,
                gender = gender,
                contact = contact,
                fullNameFallback = manualName,
            ).onSuccess { patient ->
                _uiState.update { current ->
                    val updatedList = listOf(patient) + current.eligiblePatients.filterNot { it.patientId == patient.patientId }
                    current.copy(
                        isRegisteringDni = false,
                        selectedPatient = patient,
                        patientId = patient.patientId,
                        eligiblePatients = updatedList,
                        dniLookupError = null,
                        needsManualName = false,
                        createError = null,
                        createErrorRes = null,
                    )
                }
            }.onFailure { err ->
                val isNeedName = err.message == "NEED_MANUAL_NAME"
                _uiState.update {
                    it.copy(
                        isRegisteringDni = false,
                        needsManualName = isNeedName || it.needsManualName,
                        dniLookupError = if (isNeedName) {
                            "Ingresá Nombre y Apellido para completar el alta rápida por DNI"
                        } else {
                            err.message ?: "No se pudo vincular por DNI"
                        },
                    )
                }
            }
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
                restHours = 0,
                restPeriodUnit = if (defaultDays > 0) "days" else "none",
                endDate = calculatedEnd,
                createError = null,
                createErrorRes = null,
                createErrorArg = null,
            )
        }
    }

    fun onRestPeriodUnitChange(unit: String) {
        require(unit in setOf("days", "hours", "none"))
        _uiState.update { current ->
            val days = if (unit == "days") current.daysOfRest.takeIf { it > 0 } ?: 1 else 0
            val hours = if (unit == "hours") current.restHours.takeIf { it > 0 } ?: 1 else 0
            current.copy(
                restPeriodUnit = unit,
                daysOfRest = days,
                restHours = hours,
                endDate = if (days > 0) calculateEndDate(current.startDate, days) else null,
                createError = null,
                createErrorRes = null,
                createErrorArg = null,
            )
        }
    }

    fun onDaysOfRestChange(days: Int) {
        val safeDays = days.coerceIn(0, 365)
        _uiState.update { current ->
            val calculatedEnd = if (safeDays > 0) calculateEndDate(current.startDate, safeDays) else null
            current.copy(
                daysOfRest = safeDays,
                restHours = 0,
                restPeriodUnit = if (safeDays > 0) "days" else "none",
                endDate = calculatedEnd,
                createError = null,
                createErrorRes = null,
                createErrorArg = null,
            )
        }
    }

    fun onRestHoursChange(hours: Int) {
        val safeHours = hours.coerceIn(1, 8760)
        _uiState.update { current ->
            current.copy(
                daysOfRest = 0,
                restHours = safeHours,
                restPeriodUnit = "hours",
                endDate = null,
                createError = null,
                createErrorRes = null,
                createErrorArg = null,
            )
        }
    }

    fun onStartDateChange(date: String) {
        _uiState.update { current ->
            val calculatedEnd = if (current.restPeriodUnit == "days") {
                calculateEndDate(date, current.daysOfRest)
            } else null
            current.copy(startDate = date, endDate = calculatedEnd)
        }
    }

    fun onDiagnosisChange(diagnosis: String, code: String? = null) {
        _uiState.update {
            it.copy(
                diagnosis = diagnosis,
                diagnosisCode = code?.trim()?.takeIf { value -> value.isNotEmpty() } ?: it.diagnosisCode,
                createError = null,
                createErrorRes = null,
                createErrorArg = null,
            )
        }
    }

    fun onDiagnosisCodeChange(code: String) {
        _uiState.update {
            it.copy(
                diagnosisCode = code.trim().take(8).takeIf { value -> value.isNotEmpty() },
                createError = null,
                createErrorRes = null,
                createErrorArg = null,
            )
        }
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
            _uiState.update {
                it.copy(
                    createError = "Seleccione un paciente de la lista",
                    createErrorRes = R.string.cert_error_select_patient,
                    createErrorArg = null,
                )
            }
            return
        }

        if (state.diagnosis.trim().isBlank()) {
            _uiState.update {
                it.copy(
                    createError = "Ingrese un diagnóstico o motivo clínico de la certificación",
                    createErrorRes = R.string.cert_error_enter_diagnosis,
                    createErrorArg = null,
                )
            }
            return
        }

        val eligibility = state.doctorEligibility
        if (eligibility != null && !eligibility.isEligible) {
            _uiState.update {
                it.copy(
                    createError = eligibility.reason ?: "El profesional no cumple los requisitos para emitir certificados",
                    createErrorRes = if (eligibility.reason == null) R.string.cert_error_not_eligible else null,
                    createErrorArg = null,
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isSubmitting = true,
                    createError = null,
                    createErrorRes = null,
                    createErrorArg = null,
                )
            }

            val countryCode = state.doctorEligibility?.countryCode.orEmpty()
            val request = CreateCertificateRequest(
                patientId = state.patientId,
                certificateType = state.certificateType,
                daysOfRest = state.daysOfRest,
                restHours = state.restHours,
                startDate = state.startDate,
                endDate = if (state.daysOfRest > 0) state.endDate else null,
                diagnosis = state.diagnosis.trim(),
                hideDiagnosis = state.hideDiagnosis || countryCode == "BR",
                observations = state.observations.trim().ifEmpty { null },
                countryCode = countryCode,
                cid10Code = state.diagnosisCode?.trim()?.takeIf { it.isNotEmpty() },
            )

            certificateRepository.createCertificate(request)
                .onSuccess { certificate ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            createdCertificate = certificate,
                            userMessage = if (certificate.isActive) {
                                "Certificado emitido y firmado: ${certificate.cuir}"
                            } else {
                                "Borrador de certificado guardado, pendiente de firma: ${certificate.cuir}"
                            },
                            userMessageRes = if (certificate.isActive) {
                                R.string.cert_success_signed_cuir
                            } else {
                                R.string.cert_success_issued_cuir
                            },
                            userMessageArg = certificate.cuir,
                        )
                    }
                    loadCertificates()
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            createError = null,
                            createErrorRes = R.string.cert_error_issue_failed,
                            createErrorArg = UiErrorMapper.map(error, "No se pudo emitir el certificado"),
                        )
                    }
                }
        }
    }

    fun openCertificatePdf(
        certificate: MedicalCertificate,
        onReady: (String) -> Unit,
        onFailure: () -> Unit,
    ) {
        viewModelScope.launch {
            certificateRepository.getCertificatePdfDownloadUrl(certificate)
                .onSuccess(onReady)
                .onFailure { error ->
                    com.autamedica.android.logging.SecureLog.error(
                        "[Certificates] Authenticated doctor PDF download URL unavailable",
                        error,
                    )
                    onFailure()
                }
        }
    }

    fun openMemedForBrazilCertificate() {
        val patientId = _uiState.value.selectedPatient?.patientId ?: _uiState.value.patientId
        if (patientId.isBlank()) {
            _uiState.update {
                it.copy(
                    createError = "Seleccione un paciente antes de abrir Memed",
                    createErrorRes = R.string.cert_create_memed_select_patient,
                    createErrorArg = null,
                )
            }
            return
        }
        val bridge = memedMobileBridgeRepository ?: return
        if (_uiState.value.isOpeningMemed) return
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isOpeningMemed = true,
                    createError = null,
                    createErrorRes = null,
                    createErrorArg = null,
                )
            }
            bridge.createLaunchForPatient(patientId)
                .onSuccess { session ->
                    _uiState.update {
                        it.copy(
                            isOpeningMemed = false,
                            memedSession = session,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isOpeningMemed = false,
                            createError = UiErrorMapper.map(error, "No se pudo abrir Memed ICP-Brasil"),
                            createErrorRes = null,
                            createErrorArg = null,
                        )
                    }
                }
        }
    }

    suspend fun retryMemedHandoff(forceRefreshSession: Boolean): Result<String> {
        val bridge = memedMobileBridgeRepository
            ?: return Result.failure(IllegalStateException("Emissor digital indisponível"))
        val session = _uiState.value.memedSession
            ?: return Result.failure(IllegalStateException("Sessão Memed não iniciada"))
        return bridge.createSessionExchangeForLaunchUrl(
            canonicalLaunchUrl = session.canonicalLaunchUrl,
            forceRefreshSession = forceRefreshSession,
        ).onSuccess { freshExchangeUrl ->
            _uiState.update { state ->
                state.copy(memedSession = session.copy(exchangeUrl = freshExchangeUrl))
            }
        }
    }

    fun onMemedClosed() {
        _uiState.update {
            it.copy(
                memedSession = null,
            )
        }
        loadCertificates()
    }

    fun clearCreatedCertificate() {
        _uiState.update { it.copy(createdCertificate = null) }
    }

    fun clearUserMessage() {
        _uiState.update {
            it.copy(
                userMessage = null,
                userMessageRes = null,
                userMessageArg = null,
            )
        }
    }

    private fun calculateEndDate(startDateStr: String, days: Int): String {
        if (days <= 0) return startDateStr
        return runCatching {
            val start = LocalDate.parse(startDateStr)
            start.plusDays(days.toLong() - 1).format(DateTimeFormatter.ISO_LOCAL_DATE)
        }.getOrDefault(startDateStr)
    }

    private fun applyFilterAndSearch(
        list: List<MedicalCertificate>,
        statusFilter: String,
        searchQuery: String,
    ): List<MedicalCertificate> {
        return list.filter { cert ->
            val matchesFilter = when (statusFilter) {
                "validos" -> cert.isActive
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
