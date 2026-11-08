package com.autamedica.android.presentation.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.model.RenaperIdentity
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
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class ProfileUiState(
    val user: User? = null,
    val patientSnapshot: PatientProfileSnapshot? = null,
    val renaperLoading: Boolean = false,
    val renaperResult: RenaperIdentity? = null,
    val renaperErrorStatus: Int? = null,
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
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    fun onFirstNameChange(value: String) {
        _uiState.update { it.copy(firstName = value, saveSuccess = false, error = null) }
    }

    fun onLastNameChange(value: String) {
        _uiState.update { it.copy(lastName = value, saveSuccess = false, error = null) }
    }

    fun onPhoneChange(value: String) {
        _uiState.update { it.copy(phone = value, saveSuccess = false, error = null) }
    }

    fun saveProfile() {
        val state = _uiState.value
        if (state.firstName.isBlank()) return

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
     * Only an explicit patient action may start a RENAPER consultation. Android
     * never persists the response or uses it to grant clinical access.
     */
    fun lookupRenaper(dni: String, sex: RenaperSexId) {
        if (_uiState.value.user?.role != UserRole.PATIENT || _uiState.value.renaperLoading) return
        val digits = dni.trim()
        if (!digits.matches(Regex("^[0-9]{6,12}$"))) {
            _uiState.update { it.copy(renaperErrorStatus = 400, renaperResult = null) }
            return
        }
        _uiState.update {
            it.copy(renaperLoading = true, renaperErrorStatus = null, renaperResult = null)
        }
        viewModelScope.launch {
            renaperIdentityClient.lookup(digits, sex).fold(
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
        _uiState.update {
            it.copy(renaperResult = null, renaperErrorStatus = null)
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
