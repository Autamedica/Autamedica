package com.autamedica.android.presentation.doctors.medicalorders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.CreateMedicalOrderRequest
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.domain.model.PracticeItem
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.model.StudyType
import com.autamedica.android.domain.repository.MedicalOrderRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class OrderFilter(val label: String, val studyType: StudyType?) {
    ALL("Todas", null),
    LABORATORY("Laboratorio", StudyType.LABORATORY),
    IMAGING("Imágenes", StudyType.IMAGING),
    CARDIOLOGY("Cardiología", StudyType.CARDIOLOGY),
    OTHER("Otros", StudyType.OTHER);
}

data class DoctorMedicalOrdersUiState(
    val isLoading: Boolean = false,
    val orders: List<MedicalOrder> = emptyList(),
    val filteredOrders: List<MedicalOrder> = emptyList(),
    val selectedFilter: OrderFilter = OrderFilter.ALL,
    val searchQuery: String = "",
    val totalCount: Int = 0,
    val labCount: Int = 0,
    val imagingCount: Int = 0,
    val cardioCount: Int = 0,
    val otherCount: Int = 0,

    // Patient selection & eligible list
    val selectedPatient: PrescriptionPatientItem? = null,
    val eligiblePatients: List<PrescriptionPatientItem> = emptyList(),
    val isLoadingPatients: Boolean = false,

    // Form fields for creation
    val patientId: String = "",
    val studyType: StudyType = StudyType.LABORATORY,
    val practices: List<String> = listOf(""),
    val diagnosis: String = "",
    val notes: String = "",

    val isSubmitting: Boolean = false,
    val createdOrder: MedicalOrder? = null,
    val userMessage: String? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class DoctorMedicalOrdersViewModel @Inject constructor(
    private val medicalOrderRepository: MedicalOrderRepository,
    private val prescriptionRepository: PrescriptionRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorMedicalOrdersUiState())
    val uiState: StateFlow<DoctorMedicalOrdersUiState> = _uiState.asStateFlow()

    init {
        loadOrders()
        loadEligiblePatients()
    }

    fun loadOrders() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            medicalOrderRepository.getDoctorMedicalOrders()
                .onSuccess { list ->
                    val total = list.size
                    val lab = list.count { it.studyType == StudyType.LABORATORY }
                    val img = list.count { it.studyType == StudyType.IMAGING }
                    val cardio = list.count { it.studyType == StudyType.CARDIOLOGY }
                    val other = list.count { it.studyType == StudyType.OTHER }

                    _uiState.update { current ->
                        val filtered = applyFilterAndSearch(list, current.selectedFilter, current.searchQuery)
                        current.copy(
                            isLoading = false,
                            orders = list,
                            filteredOrders = filtered,
                            totalCount = total,
                            labCount = lab,
                            imagingCount = img,
                            cardioCount = cardio,
                            otherCount = other,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = error.localizedMessage ?: "Error al cargar órdenes médicas",
                        )
                    }
                }
        }
    }

    fun loadEligiblePatients() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingPatients = true) }
            prescriptionRepository.getEligiblePatients()
                .onSuccess { list ->
                    _uiState.update { current ->
                        current.copy(
                            isLoadingPatients = false,
                            eligiblePatients = list,
                            selectedPatient = current.selectedPatient ?: list.firstOrNull { it.patientId == current.patientId },
                        )
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingPatients = false) }
                }
        }
    }

    fun setFilter(filter: OrderFilter) {
        _uiState.update { current ->
            val filtered = applyFilterAndSearch(current.orders, filter, current.searchQuery)
            current.copy(selectedFilter = filter, filteredOrders = filtered)
        }
    }

    fun onSearchQueryChange(query: String) {
        _uiState.update { current ->
            val filtered = applyFilterAndSearch(current.orders, current.selectedFilter, query)
            current.copy(searchQuery = query, filteredOrders = filtered)
        }
    }

    fun selectPatient(patient: PrescriptionPatientItem?) {
        _uiState.update {
            it.copy(
                selectedPatient = patient,
                patientId = patient?.patientId.orEmpty(),
                errorMessage = null,
            )
        }
    }

    fun selectPatientById(id: String) {
        if (id.isBlank()) return
        val currentSelected = _uiState.value.selectedPatient
        if (currentSelected?.patientId == id) return

        val found = _uiState.value.eligiblePatients.firstOrNull { it.patientId == id }
        if (found != null) {
            selectPatient(found)
        } else {
            _uiState.update { it.copy(patientId = id) }
        }
    }

    fun onStudyTypeChange(type: StudyType) {
        _uiState.update { it.copy(studyType = type) }
    }

    fun onDiagnosisChange(diagnosis: String) {
        _uiState.update { it.copy(diagnosis = diagnosis, errorMessage = null) }
    }

    fun onNotesChange(notes: String) {
        _uiState.update { it.copy(notes = notes) }
    }

    fun addPractice(name: String = "") {
        _uiState.update { current ->
            current.copy(practices = current.practices + name)
        }
    }

    fun removePractice(index: Int) {
        _uiState.update { current ->
            if (current.practices.size <= 1) {
                current.copy(practices = listOf(""))
            } else {
                current.copy(practices = current.practices.filterIndexed { i, _ -> i != index })
            }
        }
    }

    fun updatePractice(index: Int, value: String) {
        _uiState.update { current ->
            val updated = current.practices.toMutableList()
            if (index in updated.indices) {
                updated[index] = value
            }
            current.copy(practices = updated, errorMessage = null)
        }
    }

    fun createOrder(onSuccess: (() -> Unit)? = null) {
        val state = _uiState.value
        val patientId = state.selectedPatient?.patientId ?: state.patientId
        if (patientId.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Seleccione un paciente elegible") }
            return
        }

        val practiceItems = state.practices
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .map { PracticeItem(name = it) }

        if (practiceItems.isEmpty()) {
            _uiState.update { it.copy(errorMessage = "Ingrese al menos un estudio o práctica médica") }
            return
        }

        if (state.diagnosis.trim().isBlank()) {
            _uiState.update { it.copy(errorMessage = "Ingrese el diagnóstico presuntivo / código CIE-10") }
            return
        }

        createOrder(
            patientId = patientId,
            studyType = state.studyType,
            practices = practiceItems,
            diagnosis = state.diagnosis.trim(),
            notes = state.notes.trim().ifBlank { null },
            onSuccess = onSuccess,
        )
    }

    fun createOrder(
        patientId: String,
        studyType: StudyType,
        practices: List<PracticeItem>,
        diagnosis: String,
        notes: String? = null,
        onSuccess: (() -> Unit)? = null,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null, userMessage = null) }

            val request = CreateMedicalOrderRequest(
                patientId = patientId,
                studyType = studyType,
                practices = practices,
                diagnosis = diagnosis,
                notes = notes,
            )

            medicalOrderRepository.createMedicalOrder(request)
                .onSuccess { created ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            createdOrder = created,
                            userMessage = "Orden médica emitida con éxito (CUIR: ${created.cuir ?: "Emitida"})",
                            // Reset creation form
                            practices = listOf(""),
                            diagnosis = "",
                            notes = "",
                        )
                    }
                    loadOrders()
                    onSuccess?.invoke()
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            errorMessage = error.localizedMessage ?: "Error al emitir orden médica",
                        )
                    }
                }
        }
    }

    fun cancelOrder(orderId: String, reason: String) {
        if (reason.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Debe especificar un motivo de cancelación") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            medicalOrderRepository.cancelMedicalOrder(orderId, reason)
                .onSuccess {
                    _uiState.update { it.copy(userMessage = "Orden médica cancelada") }
                    loadOrders()
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = error.localizedMessage ?: "No se pudo cancelar la orden",
                        )
                    }
                }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(userMessage = null, errorMessage = null) }
    }

    private fun applyFilterAndSearch(
        list: List<MedicalOrder>,
        filter: OrderFilter,
        query: String,
    ): List<MedicalOrder> {
        val trimmedQuery = query.trim()
        return list.filter { order ->
            val matchesFilter = filter.studyType == null || order.studyType == filter.studyType
            val matchesSearch = if (trimmedQuery.isEmpty()) {
                true
            } else {
                order.patientName?.contains(trimmedQuery, ignoreCase = true) == true ||
                        order.patientDni?.contains(trimmedQuery, ignoreCase = true) == true ||
                        order.cuir?.contains(trimmedQuery, ignoreCase = true) == true ||
                        order.diagnosis?.contains(trimmedQuery, ignoreCase = true) == true ||
                        order.practices.any { it.name.contains(trimmedQuery, ignoreCase = true) }
            }
            matchesFilter && matchesSearch
        }
    }
}
