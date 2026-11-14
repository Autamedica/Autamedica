package com.autamedica.android.presentation.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.model.RenaperIdentity
import com.autamedica.android.domain.model.RenaperLookupPolicy
import com.autamedica.android.domain.model.RenaperLookupException
import com.autamedica.android.domain.model.RenaperSexId
import com.autamedica.android.data.repository.RenaperIdentityClient
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.domain.repository.WalletRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class ProfileUiState(
    val user: User? = null,
    val patientSnapshot: PatientProfileSnapshot? = null,
    val renaperLoading: Boolean = false,
    val renaperResult: RenaperIdentity? = null,
    val renaperErrorStatus: Int? = null,
    val renaperConfirming: Boolean = false,
    val renaperConfirmErrorStatus: Int? = null,
    val editableAddress: String = "",
    val isAddressSaving: Boolean = false,
    val addressSaveSuccess: Boolean = false,
    val isLoading: Boolean = true,
    val error: String? = null,
    val isSaving: Boolean = false,
    val saveSuccess: Boolean = false,
    val firstName: String = "",
    val lastName: String = "",
    val phone: String = "",
    val walletBalanceCents: Long = 0L,
    val isTopupLoading: Boolean = false,
    val checkoutUrlToLaunch: String? = null,
    val isTopupDialogOpen: Boolean = false,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
    private val walletRepository: WalletRepository,
    private val authRepository: AuthRepository,
    private val renaperIdentityClient: RenaperIdentityClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    private var renaperLookupJob: Job? = null
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    fun onFirstNameChange(value: String) {
        if (_uiState.value.patientSnapshot?.renaperConfirmedAt != null) return
        _uiState.update { it.copy(firstName = value, saveSuccess = false, error = null) }
    }

    fun onLastNameChange(value: String) {
        if (_uiState.value.patientSnapshot?.renaperConfirmedAt != null) return
        _uiState.update { it.copy(lastName = value, saveSuccess = false, error = null) }
    }

    fun onPhoneChange(value: String) {
        _uiState.update { it.copy(phone = value, saveSuccess = false, error = null) }
    }

    fun saveProfile() {
        val state = _uiState.value
        if (state.firstName.isBlank()) return
        if (state.patientSnapshot?.renaperConfirmedAt != null &&
            (state.firstName.trim() != state.user?.firstName ||
                state.lastName.trim() != state.user?.lastName)) return

        _uiState.update { it.copy(isSaving = true, error = null) }

        viewModelScope.launch {
            profileRepository.updateProfile(
                firstName = state.firstName.trim(),
                lastName = state.lastName.trim(),
                phone = state.phone.trim().ifBlank { null },
            ).fold(
                onSuccess = { user ->
                    _uiState.update {
                        it.copy(
                            user = user,
                            phone = user.phone.orEmpty(),
                            isSaving = false,
                            saveSuccess = true,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            error = UiErrorMapper.map(error, "Error al guardar"),
                        )
                    }
                },
            )
        }
    }

    private fun loadProfile() {
        viewModelScope.launch {
            val walletDeferred = async { walletRepository.getWalletBalance() }
            val profileDeferred = async { profileRepository.getProfile() }

            val profileResult = profileDeferred.await()
            val walletResult = walletDeferred.await()

            profileResult.fold(
                onSuccess = { user ->
                    val patientSnapshot = if (user.role == UserRole.PATIENT) {
                        profileRepository.getPatientProfileSnapshot().getOrNull()
                    } else {
                        null
                    }

                    _uiState.update {
                        it.copy(
                            user = user,
                            patientSnapshot = patientSnapshot,
                            editableAddress = "", // Never prefill a readable official address; type a replacement.
                            firstName = user.firstName,
                            lastName = user.lastName,
                            phone = user.phone.orEmpty(),
                            walletBalanceCents = walletResult.getOrNull() ?: it.walletBalanceCents,
                            isLoading = false,
                            error = null,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = UiErrorMapper.map(error, "Error cargando perfil"),
                        )
                    }
                },
            )
        }
    }

    /**
     * The DNI and jurisdiction are read from the authenticated patient profile.
     * A caller cannot replace the registered DNI with somebody else's number.
     * This is defence-in-depth; the server MUST repeat the ownership check.
     */
    fun lookupRenaper(sex: RenaperSexId) {
        val state = _uiState.value
        if (state.user?.role != UserRole.PATIENT || state.renaperLoading) return

        val patient = state.patientSnapshot
        val dni = RenaperLookupPolicy.registeredArgentineDni(patient)
        if (dni == null || !RenaperLookupPolicy.sexMatchesPatient(patient, sex)) {
            _uiState.update { it.copy(renaperErrorStatus = 400, renaperResult = null) }
            return
        }

        _uiState.update {
            it.copy(renaperLoading = true, renaperErrorStatus = null, renaperResult = null)
        }
        renaperLookupJob?.cancel()
        renaperLookupJob = viewModelScope.launch {
            val result = renaperIdentityClient.lookup(dni, sex)
            if (!isActive) return@launch
            result.fold(
                onSuccess = { identity ->
                    _uiState.update {
                        it.copy(renaperLoading = false, renaperResult = identity, renaperErrorStatus = null)
                    }
                },
                onFailure = { failure ->
                    _uiState.update {
                        it.copy(
                            renaperLoading = false,
                            renaperResult = null,
                            renaperErrorStatus = (failure as? RenaperLookupException)?.httpStatus ?: 500,
                        )
                    }
                },
            )
        }
    }

    fun clearRenaperResponse() {
        renaperLookupJob?.cancel()
        renaperLookupJob = null
        _uiState.update {
            it.copy(renaperLoading = false, renaperResult = null, renaperErrorStatus = null, renaperConfirmErrorStatus = null)
        }
    }

    fun confirmRenaper(sex: RenaperSexId) {
        val state = _uiState.value
        val patient = state.patientSnapshot
        if (state.user?.role != UserRole.PATIENT || state.renaperLoading ||
            state.renaperConfirming || patient?.careCountry != "AR" ||
            patient.renaperConfirmedAt != null || state.renaperResult?.hasPaid != true ||
            !RenaperLookupPolicy.sexMatchesPatient(patient, sex)) return

        _uiState.update {
            it.copy(renaperConfirming = true, renaperConfirmErrorStatus = null)
        }
        viewModelScope.launch {
            renaperIdentityClient.confirm(sex).fold(
                onSuccess = {
                    val refreshed = profileRepository.getPatientProfileSnapshot().getOrNull()
                    val user = profileRepository.getProfile().getOrNull()
                    _uiState.update { previous ->
                        if (refreshed?.renaperConfirmedAt != null) {
                            previous.copy(
                                patientSnapshot = refreshed,
                                user = user ?: previous.user,
                                editableAddress = "",
                                renaperResult = null,
                                renaperConfirming = false,
                                renaperConfirmErrorStatus = null,
                            )
                        } else {
                            previous.copy(
                                renaperConfirming = false,
                                renaperConfirmErrorStatus = 409,
                            )
                        }
                    }
                },
                onFailure = { failure ->
                    _uiState.update {
                        it.copy(
                            renaperConfirming = false,
                            renaperConfirmErrorStatus =
                                (failure as? RenaperLookupException)?.httpStatus ?: 500,
                        )
                    }
                },
            )
        }
    }

    fun onAddressChange(value: String) {
        val patient = _uiState.value.patientSnapshot
        if (patient?.careCountry != "AR" || patient.renaperConfirmedAt == null) return
        _uiState.update {
            it.copy(editableAddress = value.take(240), addressSaveSuccess = false, error = null)
        }
    }

    fun saveAddress() {
        val state = _uiState.value
        val patient = state.patientSnapshot
        val address = state.editableAddress.trim()
        if (patient?.careCountry != "AR" || patient.renaperConfirmedAt == null ||
            state.isAddressSaving || address.isBlank() || address.length > 240) return
        _uiState.update { it.copy(isAddressSaving = true, addressSaveSuccess = false, error = null) }
        viewModelScope.launch {
            profileRepository.updatePatientAddress(address).fold(
                onSuccess = { updated ->
                    _uiState.update {
                        it.copy(
                            patientSnapshot = updated,
                            editableAddress = "",
                            isAddressSaving = false,
                            addressSaveSuccess = true,
                        )
                    }
                },
                onFailure = { failure ->
                    _uiState.update {
                        it.copy(
                            isAddressSaving = false,
                            addressSaveSuccess = false,
                            error = UiErrorMapper.map(failure, "No se pudo actualizar el domicilio"),
                        )
                    }
                },
            )
        }
    }

    fun refreshWallet() {
        viewModelScope.launch {
            walletRepository.getWalletBalance().onSuccess { balance ->
                _uiState.update { it.copy(walletBalanceCents = balance) }
            }
        }
    }

    fun setTopupDialogVisible(visible: Boolean) {
        _uiState.update { it.copy(isTopupDialogOpen = visible) }
    }

    fun clearCheckoutUrl() {
        _uiState.update { it.copy(checkoutUrlToLaunch = null) }
    }

    fun topupWallet(amountArs: Double) {
        viewModelScope.launch {
            _uiState.update { it.copy(isTopupLoading = true) }
            walletRepository.createTopupPreference(amountArs).fold(
                onSuccess = { checkoutUrl ->
                    _uiState.update {
                        it.copy(
                            checkoutUrlToLaunch = checkoutUrl,
                            isTopupLoading = false,
                            isTopupDialogOpen = false,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isTopupLoading = false,
                            error = UiErrorMapper.map(error, "Error al generar enlace de recarga"),
                        )
                    }
                }
            )
        }
    }

    fun logout(onComplete: () -> Unit) {
        clearRenaperResponse()
        viewModelScope.launch {
            authRepository.logout()
            onComplete()
        }
    }
}
