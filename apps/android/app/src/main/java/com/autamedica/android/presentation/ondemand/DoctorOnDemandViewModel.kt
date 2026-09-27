package com.autamedica.android.presentation.ondemand

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.DispatchClaimResult
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DoctorOnDemandUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val doctorId: String = "",
    val isOnDuty: Boolean = false,
    val dutyActiveTiers: List<String> = listOf("general"),
    val isDutyLoading: Boolean = false,
    val searchingRequests: List<PharmacyDispatchRequest> = emptyList(),
    val claimingId: String? = null,
    val activeRequestId: String? = null,
)

@HiltViewModel
class DoctorOnDemandViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val doctorRepository: DoctorRepository,
    private val pharmacyDispatchRepository: PharmacyDispatchRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorOnDemandUiState())
    val uiState: StateFlow<DoctorOnDemandUiState> = _uiState.asStateFlow()

    private val _navigateToCall = MutableStateFlow<DispatchClaimResult?>(null)
    val navigateToCall: StateFlow<DispatchClaimResult?> = _navigateToCall.asStateFlow()

    private val _newRequestEvents = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val newRequestEvents: SharedFlow<String> = _newRequestEvents.asSharedFlow()

    private val seenRequestIds = mutableSetOf<String>()

    init {
        viewModelScope.launch {
            loadIdentityAndDuty()
            observeSearchingQueue()
        }
    }

    fun consumeNavigateToCall() {
        _navigateToCall.value = null
    }

    fun refresh() {
        viewModelScope.launch {
            loadIdentityAndDuty()
        }
    }

    fun toggleDuty() {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank() || _uiState.value.isDutyLoading) return

        val target = !_uiState.value.isOnDuty
        _uiState.update { it.copy(isDutyLoading = true) }

        viewModelScope.launch {
            pharmacyDispatchRepository.setDoctorDutyStatus(
                doctorId = doctorId,
                isOnDuty = target,
                activeTiers = _uiState.value.dutyActiveTiers,
            ).onSuccess {
                _uiState.update { it.copy(isOnDuty = target, isDutyLoading = false) }
            }.onFailure { error ->
                SecureLog.error("[DoctorOnDemand] Failed toggling duty", error)
                _uiState.update {
                    it.copy(isDutyLoading = false, error = "No se pudo actualizar el estado de guardia")
                }
            }
        }
    }

    fun accept(request: PharmacyDispatchRequest) {
        val doctorId = _uiState.value.doctorId
        if (doctorId.isBlank() || _uiState.value.claimingId != null) return

        _uiState.update { it.copy(claimingId = request.id) }

        viewModelScope.launch {
            pharmacyDispatchRepository.claimPharmacyRequest(request.id, doctorId)
                .onSuccess { claim ->
                    if (claim.success && !claim.cloudflareRoomId.isNullOrBlank()) {
                        pharmacyDispatchRepository.updateDispatchRequestStatus(request.id, "in_call")
                        _uiState.update { state ->
                            state.copy(
                                claimingId = null,
                                activeRequestId = claim.requestId ?: request.id,
                            )
                        }
                        _navigateToCall.value = claim
                    } else {
                        _uiState.update {
                            it.copy(
                                claimingId = null,
                                error = claim.code.takeIf { it.isNotBlank() } ?: "La consulta ya no está disponible",
                            )
                        }
                    }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorOnDemand] Failed claiming request", error)
                    _uiState.update {
                        it.copy(claimingId = null, error = "No se pudo aceptar la consulta")
                    }
                }
        }
    }

    fun finishCurrent() {
        val doctorId = _uiState.value.doctorId
        val requestId = _uiState.value.activeRequestId ?: return
        if (doctorId.isBlank()) return

        viewModelScope.launch {
            pharmacyDispatchRepository.finishPharmacyRequest(doctorId, requestId)
                .onSuccess {
                    _uiState.update { it.copy(activeRequestId = null) }
                }
                .onFailure { error ->
                    SecureLog.error("[DoctorOnDemand] Failed finishing request", error)
                }
        }
    }

    private suspend fun loadIdentityAndDuty() {
        val user = authRepository.getCurrentUser()
        if (user == null) {
            _uiState.update { it.copy(isLoading = false, error = "Error de autenticación") }
            return
        }

        doctorRepository.getDoctorProfile(user.id)
            .onSuccess { profile ->
                _uiState.update {
                    it.copy(doctorId = profile.id, isLoading = false, error = null)
                }
                pharmacyDispatchRepository.getDoctorDutyStatus(profile.id)
                    .onSuccess { duty ->
                        _uiState.update {
                            it.copy(
                                isOnDuty = duty.isOnDuty,
                                dutyActiveTiers = duty.activeTiers,
                                activeRequestId = duty.currentActiveRequestId,
                                isLoading = false,
                            )
                        }
                    }
                    .onFailure { error ->
                        SecureLog.error("[DoctorOnDemand] Failed loading duty status", error)
                        _uiState.update { it.copy(isLoading = false, error = null) }
                    }
            }
            .onFailure { error ->
                SecureLog.error("[DoctorOnDemand] Failed loading doctor profile", error)
                _uiState.update {
                    it.copy(isLoading = false, error = "No se pudo cargar el perfil del doctor")
                }
            }
    }

    private suspend fun observeSearchingQueue() {
        // StateFlow is hot and never completes: catch is a no-op (deprecated).
        // Wrap the whole collect instead so an upstream failure is logged once
        // and observation aborts exactly as the old catch did.
        try {
            pharmacyDispatchRepository.observeSearchingRequests()
                .collect { requests ->
                    _uiState.update { it.copy(searchingRequests = requests) }
                    emittedArrivalEvents(requests)
                }
        } catch (error: Throwable) {
            SecureLog.error("[DoctorOnDemand] Error observing searching queue", error)
        }
    }

    fun expireRequest(requestId: String) {
        val current = _uiState.value.searchingRequests
        if (current.none { it.id == requestId }) return
        _uiState.update {
            it.copy(searchingRequests = it.searchingRequests.filter { r -> r.id != requestId })
        }
    }

    private fun emittedArrivalEvents(requests: List<PharmacyDispatchRequest>) {
        for (request in requests) {
            if (seenRequestIds.add(request.id)) {
                _newRequestEvents.tryEmit(request.id)
            }
        }
        seenRequestIds.retainAll(requests.map { it.id })
    }
}