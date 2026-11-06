package com.autamedica.android.presentation.doctors.prescriptions

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.R
import com.autamedica.android.domain.model.CreatePrescriptionRequest
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionItem
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.presentation.common.UiErrorMapper
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PrescriptionItemFormState(
    val medicationName: String = "",
    val genericName: String = "",
    val dosage: String = "",
    val frequency: String = "",
    val duration: String = "",
    val instructions: String = "",
)

data class DoctorPrescriptionsUiState(
    val isLoading: Boolean = false,
    val prescriptions: List<Prescription> = emptyList(),
    val filteredPrescriptions: List<Prescription> = emptyList(),
    val selectedStatusFilter: String = "todas", // todas, activa, dispensada, cancelada
    val searchQuery: String = "",
    val totalCount: Int = 0,
    val activeCount: Int = 0,
    val dispensedCount: Int = 0,
    val cancelledCount: Int = 0,

    // Cancellation
    val prescriptionToCancel: Prescription? = null,
    val isCancelling: Boolean = false,
    val cancellationError: String? = null,
    @StringRes val cancellationErrorResId: Int? = null,
    val cancellationErrorArgs: List<String> = emptyList(),

    // Creation
    val patientId: String = "",
    val selectedPatient: PrescriptionPatientItem? = null,
    val eligiblePatients: List<PrescriptionPatientItem> = emptyList(),
    val isLoadingPatients: Boolean = false,
    val doctorEligibility: DoctorEligibility? = null,
    val isLoadingEligibility: Boolean = false,
    val items: List<PrescriptionItemFormState> = listOf(PrescriptionItemFormState()),
    val diagnosis: String = "",
    val diagnosisCode: String? = null,
    val notes: String = "",
    val isSubmitting: Boolean = false,
    val createdPrescription: Prescription? = null,
    val createError: String? = null,
    @StringRes val createErrorResId: Int? = null,
    val createErrorArgs: List<String> = emptyList(),
    val userMessage: String? = null,
    @StringRes val userMessageResId: Int? = null,
    val userMessageArgs: List<String> = emptyList(),
)

@HiltViewModel
class DoctorPrescriptionsViewModel @Inject constructor(
    private val prescriptionRepository: PrescriptionRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorPrescriptionsUiState())
    val uiState: StateFlow<DoctorPrescriptionsUiState> = _uiState.asStateFlow()

    init {
        loadPrescriptions()
        loadEligibility()
    }

    fun loadPrescriptions() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, cancellationError = null) }
            prescriptionRepository.getDoctorPrescriptions()
                .onSuccess { list ->
                    val total = list.size
                    val active = list.count { it.isActive }
                    val dispensed = list.count { it.isDispensed || it.isCompleted }
                    val cancelled = list.count { it.isCancelled }

                    _uiState.update { current ->
                        val filtered = applyFilterAndSearch(list, current.selectedStatusFilter, current.searchQuery)
                        current.copy(
                            isLoading = false,
                            prescriptions = list,
                            filteredPrescriptions = filtered,
                            totalCount = total,
                            activeCount = active,
                            dispensedCount = dispensed,
                            cancelledCount = cancelled,
                        )
                    }
                }
                .onFailure { error ->
                    val errMsg = UiErrorMapper.map(error, "Error desconocido")
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            userMessage = "Error al cargar recetas: $errMsg",
                            userMessageResId = R.string.doctor_rx_val_load_error,
                            userMessageArgs = listOf(errMsg),
                        )
                    }
                }
        }
    }

    fun loadEligibility() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEligibility = true, doctorEligibility = null) }
            prescriptionRepository.getDoctorEligibility()
                .onSuccess { eligibility ->
                    _uiState.update {
                        it.copy(
                            doctorEligibility = eligibility,
                            isLoadingEligibility = false,
                        )
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingEligibility = false, doctorEligibility = null) }
                }
        }
    }

    fun onSearchQueryChanged(query: String) {
        _uiState.update { current ->
            val filtered = applyFilterAndSearch(current.prescriptions, current.selectedStatusFilter, query)
            current.copy(searchQuery = query, filteredPrescriptions = filtered)
        }
    }

    fun onStatusFilterChanged(status: String) {
        _uiState.update { current ->
            val filtered = applyFilterAndSearch(current.prescriptions, status, current.searchQuery)
            current.copy(selectedStatusFilter = status, filteredPrescriptions = filtered)
        }
    }

    fun onRequestCancelPrescription(prescription: Prescription) {
        _uiState.update {
            it.copy(
                prescriptionToCancel = prescription,
                cancellationError = null,
                cancellationErrorResId = null,
                cancellationErrorArgs = emptyList(),
            )
        }
    }

    fun onDismissCancelDialog() {
        _uiState.update {
            it.copy(
                prescriptionToCancel = null,
                cancellationError = null,
                cancellationErrorResId = null,
                cancellationErrorArgs = emptyList(),
            )
        }
    }

    fun onConfirmCancelPrescription(reason: String) {
        val target = _uiState.value.prescriptionToCancel ?: return
        if (reason.isBlank()) {
            _uiState.update {
                it.copy(
                    cancellationError = "Debe indicar el motivo clínico de anulación",
                    cancellationErrorResId = R.string.doctor_rx_val_cancel_motive_required,
                    cancellationErrorArgs = emptyList(),
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isCancelling = true,
                    cancellationError = null,
                    cancellationErrorResId = null,
                    cancellationErrorArgs = emptyList(),
                )
            }
            prescriptionRepository.cancelPrescription(target.id, reason.trim())
                .onSuccess {
                    val cuirOrId = target.cuir ?: target.id.take(8)
                    _uiState.update {
                        it.copy(
                            isCancelling = false,
                            prescriptionToCancel = null,
                            userMessage = "Receta $cuirOrId cancelada correctamente",
                            userMessageResId = R.string.doctor_rx_val_cancelled_success,
                            userMessageArgs = listOf(cuirOrId),
                        )
                    }
                    loadPrescriptions()
                }
                .onFailure { error ->
                    val errMsg = UiErrorMapper.map(error, "No se pudo actualizar")
                    _uiState.update {
                        it.copy(
                            isCancelling = false,
                            cancellationError = "Error al cancelar: $errMsg",
                            cancellationErrorResId = R.string.doctor_rx_val_cancel_error,
                            cancellationErrorArgs = listOf(errMsg),
                        )
                    }
                }
        }
    }

    fun initCreatePrescription(preselectedPatientId: String = "") {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    patientId = preselectedPatientId,
                    isLoadingPatients = true,
                    createError = null,
                    createdPrescription = null,
                    items = listOf(PrescriptionItemFormState()),
                    diagnosis = "",
                    diagnosisCode = null,
                    notes = "",
                )
            }

            prescriptionRepository.getEligiblePatients()
                .onSuccess { patients ->
                    val matchedPatient = if (preselectedPatientId.isNotBlank()) {
                        patients.firstOrNull { it.patientId == preselectedPatientId }
                            ?: patients.firstOrNull { it.dni == preselectedPatientId }
                    } else null

                    _uiState.update {
                        it.copy(
                            patientId = matchedPatient?.patientId ?: preselectedPatientId,
                            eligiblePatients = patients,
                            selectedPatient = matchedPatient,
                            isLoadingPatients = false,
                        )
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingPatients = false) }
                }

            loadEligibility()
        }
    }

    fun onSelectPatient(patient: PrescriptionPatientItem) {
        _uiState.update {
            it.copy(
                patientId = patient.patientId,
                selectedPatient = patient,
                createError = null,
            )
        }
    }

    fun onAddMedicationItem() {
        _uiState.update { current ->
            if (current.items.size < 3) {
                current.copy(items = current.items + PrescriptionItemFormState())
            } else current
        }
    }

    fun onRemoveMedicationItem(index: Int) {
        _uiState.update { current ->
            if (current.items.size > 1 && index in current.items.indices) {
                val updated = current.items.toMutableList()
                updated.removeAt(index)
                current.copy(items = updated)
            } else current
        }
    }

    fun onMedicationNameChanged(index: Int, name: String) {
        updateItemAt(index) { it.copy(medicationName = name) }
    }

    fun onGenericNameChanged(index: Int, genericName: String) {
        updateItemAt(index) { it.copy(genericName = genericName) }
    }

    fun onDosageChanged(index: Int, dosage: String) {
        updateItemAt(index) { it.copy(dosage = dosage) }
    }

    fun onFrequencyChanged(index: Int, frequency: String) {
        updateItemAt(index) { it.copy(frequency = frequency) }
    }

    fun onDurationChanged(index: Int, duration: String) {
        updateItemAt(index) { it.copy(duration = duration) }
    }

    fun onInstructionsChanged(index: Int, instructions: String) {
        updateItemAt(index) { it.copy(instructions = instructions) }
    }

    fun onDiagnosisChanged(diagnosis: String, code: String? = null) {
        _uiState.update { it.copy(diagnosis = diagnosis, diagnosisCode = code, createError = null) }
    }

    fun onNotesChanged(notes: String) {
        _uiState.update { it.copy(notes = notes) }
    }

    fun onSubmitPrescription(onSuccess: (Prescription) -> Unit = {}) {
        val state = _uiState.value
        val effectivePatientId = state.patientId.ifBlank { state.selectedPatient?.patientId.orEmpty() }

        // Validations
        if (effectivePatientId.isBlank()) {
            _uiState.update {
                it.copy(
                    createError = "Debe seleccionar un paciente",
                    createErrorResId = R.string.doctor_rx_val_patient_required,
                    createErrorArgs = emptyList(),
                )
            }
            return
        }

        if (state.items.isEmpty()) {
            _uiState.update {
                it.copy(
                    createError = "Debe indicar al menos un medicamento",
                    createErrorResId = R.string.doctor_rx_val_medication_required,
                    createErrorArgs = emptyList(),
                )
            }
            return
        }

        for ((idx, item) in state.items.withIndex()) {
            if (item.medicationName.isBlank()) {
                _uiState.update {
                    it.copy(
                        createError = "Complete el nombre del medicamento #${idx + 1}",
                        createErrorResId = R.string.doctor_rx_val_med_name_required,
                        createErrorArgs = listOf("${idx + 1}"),
                    )
                }
                return
            }
            if (item.dosage.isBlank()) {
                _uiState.update {
                    it.copy(
                        createError = "Indique la dosis para ${item.medicationName}",
                        createErrorResId = R.string.doctor_rx_val_dosage_required,
                        createErrorArgs = listOf(item.medicationName),
                    )
                }
                return
            }
            if (item.frequency.isBlank()) {
                _uiState.update {
                    it.copy(
                        createError = "Indique la frecuencia de toma para ${item.medicationName}",
                        createErrorResId = R.string.doctor_rx_val_frequency_required,
                        createErrorArgs = listOf(item.medicationName),
                    )
                }
                return
            }
        }

        if (state.diagnosis.isBlank()) {
            _uiState.update {
                it.copy(
                    createError = "Indique el diagnóstico clínico (CIE-10)",
                    createErrorResId = R.string.doctor_rx_val_diagnosis_required,
                    createErrorArgs = emptyList(),
                )
            }
            return
        }

        // A registered license does not imply approval; unknown and rejected states fail closed.
        val eligibility = state.doctorEligibility
        if (eligibility?.isEligible != true) {
            _uiState.update {
                it.copy(
                    createError = eligibility?.reason ?: "No fue posible verificar la habilitación profesional. Actualizá e intentá nuevamente.",
                    createErrorResId = null,
                    createErrorArgs = emptyList(),
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isSubmitting = true,
                    createError = null,
                    createErrorResId = null,
                    createErrorArgs = emptyList(),
                )
            }

            val domainItems = state.items.map { item ->
                PrescriptionItem(
                    medicationName = item.medicationName.trim(),
                    genericName = item.genericName.trim().ifBlank { item.medicationName.trim() },
                    dosage = item.dosage.trim(),
                    frequency = item.frequency.trim(),
                    duration = item.duration.trim(),
                    instructions = item.instructions.trim(),
                )
            }

            val request = CreatePrescriptionRequest(
                patientId = effectivePatientId,
                items = domainItems,
                diagnosis = if (state.diagnosisCode != null) "${state.diagnosisCode} - ${state.diagnosis.trim()}" else state.diagnosis.trim(),
                notes = state.notes.trim().takeIf { it.isNotEmpty() },
                countryCode = "AR",
            )

            prescriptionRepository.createPrescription(request)
                .onSuccess { created ->
                    val cuirOrId = created.cuir ?: created.id.take(8)
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            createdPrescription = created,
                            userMessage = "Receta registrada: referencia $cuirOrId. Verificá la firma antes de utilizarla.",
                            userMessageResId = R.string.doctor_rx_val_issued_success,
                            userMessageArgs = listOf(cuirOrId),
                        )
                    }
                    loadPrescriptions()
                    onSuccess(created)
                }
                .onFailure { error ->
                    val errMsg = UiErrorMapper.map(error, "No se pudo completar la emisión")
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            createError = "Error al emitir: ${UiErrorMapper.map(error, "No se pudo emitir la receta")}",
                            createErrorResId = R.string.doctor_rx_val_issue_error,
                            createErrorArgs = listOf(errMsg),
                        )
                    }
                }
        }
    }

    fun clearCreatedPrescription() {
        _uiState.update { it.copy(createdPrescription = null) }
    }

    fun clearUserMessage() {
        _uiState.update {
            it.copy(
                userMessage = null,
                userMessageResId = null,
                userMessageArgs = emptyList(),
            )
        }
    }

    private fun updateItemAt(index: Int, transform: (PrescriptionItemFormState) -> PrescriptionItemFormState) {
        _uiState.update { current ->
            if (index in current.items.indices) {
                val updated = current.items.toMutableList()
                updated[index] = transform(updated[index])
                current.copy(
                    items = updated,
                    createError = null,
                    createErrorResId = null,
                    createErrorArgs = emptyList(),
                )
            } else current
        }
    }

    private fun applyFilterAndSearch(
        list: List<Prescription>,
        statusFilter: String,
        searchQuery: String,
    ): List<Prescription> {
        val filteredByStatus = when (statusFilter.lowercase()) {
            "activa", "activas" -> list.filter { it.isActive }
            "dispensada", "dispensadas" -> list.filter { it.isDispensed || it.isCompleted }
            "cancelada", "canceladas" -> list.filter { it.isCancelled }
            else -> list
        }

        if (searchQuery.isBlank()) return filteredByStatus

        val q = searchQuery.trim().lowercase()
        return filteredByStatus.filter { rx ->
            (rx.patientName?.lowercase()?.contains(q) == true) ||
            (rx.patientDni?.lowercase()?.contains(q) == true) ||
            (rx.cuir?.lowercase()?.contains(q) == true) ||
            (rx.medicationName.lowercase().contains(q)) ||
            (rx.diagnosis?.lowercase()?.contains(q) == true) ||
            rx.items.any { it.medicationName.lowercase().contains(q) || it.genericName.lowercase().contains(q) }
        }
    }
}
