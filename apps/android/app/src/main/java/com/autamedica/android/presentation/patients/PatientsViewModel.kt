package com.autamedica.android.presentation.patients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.ExternalPatientRecord
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.RegisterExternalPatientRequest
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorPatientWorkspaceRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.presentation.health.isPortugueseRuntime
import com.autamedica.android.presentation.health.localizedCopy
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PatientsUiState(
    val patients: List<PatientSummary> = emptyList(),
    val searchQuery: String = "",
    val filter: PatientFilter = PatientFilter.ALL,
    val groups: PatientGroups = PatientGroups(),
    val totalCount: Int = 0,
    val upcomingCount: Int = 0,
    val recentCount: Int = 0,
    val externalCount: Int = 0,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isCreatingExternal: Boolean = false,
    val createExternalError: String? = null,
    val doctorCountryCode: String? = null,
    val error: String? = null,
)

@HiltViewModel
class PatientsViewModel @Inject constructor(
    private val doctorRepository: DoctorRepository,
    private val workspaceRepository: DoctorPatientWorkspaceRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PatientsUiState())
    val uiState: StateFlow<PatientsUiState> = _uiState.asStateFlow()

    init {
        loadPatients()
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadPatients()
    }

    fun onSearchQueryChange(query: String) {
        _uiState.update { recompute(it.copy(searchQuery = query)) }
    }

    fun onFilterSelected(filter: PatientFilter) {
        _uiState.update { recompute(it.copy(filter = filter)) }
    }

    fun clearCreateExternalError() {
        _uiState.update { it.copy(createExternalError = null) }
    }

    fun registerExternalPatient(
        fullName: String,
        documentNumber: String,
        gender: String,
        birthDate: String?,
        contact: String?,
        onCreated: (String) -> Unit,
    ) {
        viewModelScope.launch {
            val isPt = isPortugueseRuntime()
            _uiState.update { it.copy(isCreatingExternal = true, createExternalError = null) }
            workspaceRepository.registerExternalPatient(
                RegisterExternalPatientRequest(
                    fullName = fullName,
                    documentNumber = documentNumber,
                    gender = gender,
                    birthDate = birthDate,
                    contact = contact,
                ),
            ).onSuccess { created ->
                _uiState.update { it.copy(isCreatingExternal = false, createExternalError = null) }
                loadPatients()
                onCreated(created.patientId)
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        isCreatingExternal = false,
                        createExternalError = err.message ?: localizedCopy(
                            "No se pudo registrar el paciente externo",
                            "Não foi possível cadastrar o paciente externo",
                            isPt,
                        ),
                    )
                }
            }
        }
    }

    private fun loadPatients() {
        viewModelScope.launch {
            val isPt = isPortugueseRuntime()
            val user = authRepository.getCurrentUser()
            if (user == null) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = localizedCopy(
                            "Error de autenticacion",
                            "Erro de autenticação",
                            isPt,
                        ),
                    )
                }
                return@launch
            }

            doctorRepository.getDoctorProfile(user.id).onSuccess { profile ->
                val assignedDeferred = async { doctorRepository.getDoctorPatients(profile.id) }
                val externalDeferred = async { workspaceRepository.getExternalPatients() }

                val assignedResult = assignedDeferred.await()
                val externalList = externalDeferred.await().getOrDefault(emptyList())

                assignedResult.onSuccess { assigned ->
                    val merged = mergePatients(assigned, externalList)
                    _uiState.update {
                        recompute(
                            it.copy(
                                patients = merged,
                                doctorCountryCode = profile.countryCode,
                                isLoading = false,
                                isRefreshing = false,
                                error = null,
                            ),
                        )
                    }
                }.onFailure { error ->
                    if (externalList.isNotEmpty()) {
                        val merged = mergePatients(emptyList(), externalList)
                        _uiState.update {
                            recompute(
                                it.copy(
                                    patients = merged,
                                    doctorCountryCode = profile.countryCode,
                                    isLoading = false,
                                    isRefreshing = false,
                                    error = null,
                                ),
                            )
                        }
                    } else {
                        SecureLog.error("[Patients] Failed fetching patients", error)
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                isRefreshing = false,
                                error = localizedCopy(
                                    "Error al cargar pacientes",
                                    "Erro ao carregar pacientes",
                                    isPt,
                                ),
                            )
                        }
                    }
                }
            }.onFailure { error ->
                SecureLog.error("[Patients] Failed fetching doctor profile", error)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = localizedCopy(
                            "No se pudo identificar al doctor",
                            "Não foi possível identificar o médico",
                            isPt,
                        ),
                    )
                }
            }
        }
    }

    private fun mergePatients(
        assigned: List<PatientSummary>,
        external: List<ExternalPatientRecord>,
    ): List<PatientSummary> {
        val byId = LinkedHashMap<String, PatientSummary>()
        for (p in assigned) {
            byId[p.id] = p
        }
        for (ext in external) {
            val parts = ext.fullName.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
            val firstName = parts.firstOrNull().orEmpty()
            val lastName = if (parts.size > 1) parts.drop(1).joinToString(" ") else ""
            val existing = byId[ext.patientId]
            if (existing != null) {
                byId[ext.patientId] = existing.copy(
                    firstName = existing.firstName.ifBlank { firstName },
                    lastName = existing.lastName.ifBlank { lastName },
                    birthDate = existing.birthDate ?: ext.birthDate,
                    gender = existing.gender ?: ext.gender,
                    documentNumber = existing.documentNumber ?: ext.dni,
                    isExternal = true,
                    contact = existing.contact ?: ext.contact,
                )
            } else {
                byId[ext.patientId] = PatientSummary(
                    id = ext.patientId,
                    userId = "",
                    firstName = firstName,
                    lastName = lastName,
                    birthDate = ext.birthDate,
                    gender = ext.gender,
                    appointmentCount = 0,
                    documentNumber = ext.dni,
                    isExternal = true,
                    contact = ext.contact,
                )
            }
        }
        return byId.values.toList()
    }

    private fun recompute(state: PatientsUiState): PatientsUiState {
        val groups = PatientListLogic.buildResults(state.patients, state.searchQuery, state.filter)
        return state.copy(
            groups = groups,
            totalCount = state.patients.size,
            upcomingCount = PatientListLogic.upcomingCount(state.patients),
            recentCount = PatientListLogic.recentCount(state.patients),
            externalCount = PatientListLogic.externalCount(state.patients),
        )
    }
}
