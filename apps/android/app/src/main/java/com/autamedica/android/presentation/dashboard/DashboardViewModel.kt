package com.autamedica.android.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.PatientPreventiveProfile
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.HealthRepository
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.domain.model.PortalNotification
import com.autamedica.android.domain.repository.NotificationRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.repository.WalletRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.autamedica.android.presentation.common.UiErrorMapper
import javax.inject.Inject

data class DashboardUiState(
    val appointments: List<Appointment> = emptyList(),
    val joinableAppointmentIds: Set<String> = emptySet(),
    val availableDoctors: List<DoctorBookingInfo> = emptyList(),
    val doctorsLoading: Boolean = false,
    val isLoading: Boolean = true,
    val error: String? = null,
    val telemedicineError: String? = null,
    val preventiveError: String? = null,
    val isRefreshing: Boolean = false,
    val userId: String = "",
    val userRole: String = "patient",
    val userName: String = "",
    val userEmail: String = "",
    val userPhone: String? = null,
    val userAvatarUrl: String? = null,
    val anamnesisSummary: AnamnesisSummary? = null,
    val preventiveProfile: PatientPreventiveProfile? = null,
    val patientSnapshot: PatientProfileSnapshot? = null,
    // Health Reserve Subscription
    val subscriptionTier: String = "free", // "free" | "cuidado"
    val subscriptionStatus: String = "active", // "active" | "past_due"
    // No verified subscription/credit source has been loaded yet. Never invent a balance.
    val benefitBalanceCredits: Int = 0,
    val maxCapCredits: Int = 0,
    val showReserveBanner: Boolean = true,
    // Wallet
    val walletBalanceCents: Long = 0L,
    val freeConsultationsCount: Int = 0,
    val isWalletSheetOpen: Boolean = false,
    val isTopupDialogOpen: Boolean = false,
    val isTopupLoading: Boolean = false,
    val checkoutUrlToLaunch: String? = null,
    // Notifications
    val notifications: List<PortalNotification> = emptyList(),
    val unreadNotificationsCount: Int = 0,
    val isNotificationsSheetOpen: Boolean = false,
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val authRepository: AuthRepository,
    private val healthRepository: HealthRepository,
    private val telemedicineRepository: TelemedicineRepository,
    private val profileRepository: ProfileRepository,
    private val notificationRepository: NotificationRepository,
    private val walletRepository: WalletRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadUserInfo()
        observeNotifications()
        refreshData(initialLoad = true)
    }

    private fun observeNotifications() {
        viewModelScope.launch {
            notificationRepository.observeNotifications().collect { notifs ->
                _uiState.update { it.copy(notifications = notifs) }
            }
        }
        viewModelScope.launch {
            notificationRepository.observeUnreadCount().collect { count ->
                _uiState.update { it.copy(unreadNotificationsCount = count) }
            }
        }
    }

    fun refresh() {
        refreshData(initialLoad = false)
    }

    fun setNotificationsSheetVisible(visible: Boolean) {
        _uiState.update { it.copy(isNotificationsSheetOpen = visible) }
    }

    fun markNotificationAsRead(id: String) {
        viewModelScope.launch {
            notificationRepository.markAsRead(id)
        }
    }

    fun markAllNotificationsAsRead() {
        viewModelScope.launch {
            notificationRepository.markAllAsRead()
        }
    }

    fun clearCheckoutUrl() {
        _uiState.update { it.copy(checkoutUrlToLaunch = null) }
    }

    fun toggleReserveBanner(visible: Boolean) {
        _uiState.update { it.copy(showReserveBanner = visible) }
    }

    fun setWalletSheetVisible(visible: Boolean) {
        _uiState.update { it.copy(isWalletSheetOpen = visible) }
    }

    fun setTopupDialogVisible(visible: Boolean) {
        _uiState.update { it.copy(isTopupDialogOpen = visible) }
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

    private fun loadUserInfo() {
        viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            if (user != null) {
                _uiState.update { state ->
                    state.copy(
                        userId = user.id,
                        userRole = user.role.wireName,
                        userName = listOfNotNull(user.firstName, user.lastName)
                            .joinToString(" ")
                            .ifBlank { user.email },
                        userEmail = user.email,
                        userPhone = user.phone,
                        userAvatarUrl = user.avatarUrl,
                    )
                }
            }
        }
    }

    private fun refreshData(initialLoad: Boolean) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = if (initialLoad) true else it.isLoading,
                    doctorsLoading = true,
                    isRefreshing = !initialLoad,
                    error = null,
                    telemedicineError = null,
                    preventiveError = null,
                )
            }

            coroutineScope {
                launch { notificationRepository.startRealtimeListener() }
                val appointmentsDeferred = async { appointmentRepository.getUpcomingAppointments() }
                val anamnesisDeferred = async { healthRepository.getAnamnesisSummary() }
                val preventiveDeferred = async { healthRepository.getPreventiveProfile() }
                val doctorsDeferred = async { appointmentRepository.getAvailableDoctors() }
                val snapshotDeferred = async { profileRepository.getPatientProfileSnapshot() }
                val profileDeferred = async { profileRepository.getProfile() }
                val notifsDeferred = async { notificationRepository.getNotifications() }
                val walletDeferred = async { walletRepository.getWalletBalance() }

                val appointmentsResult = appointmentsDeferred.await()
                val anamnesisResult = anamnesisDeferred.await()
                val preventiveResult = preventiveDeferred.await()
                val doctorsResult = doctorsDeferred.await()
                val snapshotResult = snapshotDeferred.await()
                val profileResult = profileDeferred.await()
                notifsDeferred.await()
                val balanceResult = walletDeferred.await()

                val appointments = appointmentsResult.getOrNull()
                val resolvedAppointments = appointments ?: _uiState.value.appointments
                val joinableResult = if (appointments != null) {
                    resolveJoinableAppointmentIds(appointments)
                } else {
                    _uiState.value.joinableAppointmentIds to _uiState.value.telemedicineError
                }

                val availableDoctors = doctorsResult.getOrNull() ?: _uiState.value.availableDoctors
                val snapshot = snapshotResult.getOrNull() ?: _uiState.value.patientSnapshot
                val profile = profileResult.getOrNull()

                _uiState.update { current ->
                    val resolvedName = profile?.displayName?.ifBlank { current.userName } ?: current.userName
                    val resolvedEmail = profile?.email?.ifBlank { current.userEmail } ?: current.userEmail
                    val resolvedPhone = profile?.phone ?: current.userPhone
                    val resolvedAvatar = profile?.avatarUrl ?: current.userAvatarUrl

                    current.copy(
                        appointments = resolvedAppointments,
                        joinableAppointmentIds = joinableResult.first,
                        availableDoctors = availableDoctors,
                        doctorsLoading = false,
                        isLoading = false,
                        isRefreshing = false,
                        error = appointmentsResult.exceptionOrNull()?.takeIf { resolvedAppointments.isEmpty() }?.let { sanitizeErrorMessage(it.message) },
                        telemedicineError = joinableResult.second,
                        preventiveError = preventiveResult.exceptionOrNull()?.let { sanitizePreventiveError(it.message) },
                        anamnesisSummary = anamnesisResult.getOrNull() ?: current.anamnesisSummary,
                        preventiveProfile = preventiveResult.getOrNull() ?: current.preventiveProfile,
                        patientSnapshot = snapshot,
                        userName = resolvedName,
                        userEmail = resolvedEmail,
                        userPhone = resolvedPhone,
                        userAvatarUrl = resolvedAvatar,
                        walletBalanceCents = balanceResult.getOrNull() ?: current.walletBalanceCents,
                    )
                }
            }
        }
    }

    private suspend fun resolveJoinableAppointmentIds(
        appointments: List<Appointment>,
    ): Pair<Set<String>, String?> {
        val candidates = appointments.filter { it.isTelemedicineJoinCandidate() }
        if (candidates.isEmpty()) return emptySet<String>() to null

        return telemedicineRepository.getJoinableAppointmentIds(candidates).fold(
            onSuccess = { ids -> ids to null },
            onFailure = { error -> emptySet<String>() to sanitizeTelemedicineError(error.message) },
        )
    }

    private fun sanitizeErrorMessage(raw: String?): String {
        if (raw == null) return "Error al cargar consultas"
        return when {
            "infinite recursion" in raw -> "No se pudieron sincronizar las consultas"
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "Error de conexion. Verifica tu internet."
            "unauthorized" in raw.lowercase() || "JWT" in raw ->
                "Sesion expirada. Inicia sesion nuevamente."
            raw.contains("URL:") || raw.contains("Headers:") -> "Error al cargar consultas"
            else -> raw.lineSequence().firstOrNull()?.take(120) ?: raw.take(120)
        }
    }

    private fun sanitizeTelemedicineError(raw: String?): String {
        if (raw == null) return "No se pudo validar la sala de telemedicina."
        return when {
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "No se pudo validar la sala por un problema de conexion."
            "forbidden" in raw.lowercase() || "unauthorized" in raw.lowercase() ->
                "La sesion de telemedicina requiere validar nuevamente tus permisos."
            else -> "No se pudo confirmar la sala de telemedicina."
        }
    }

    private fun sanitizePreventiveError(raw: String?): String {
        if (raw == null) return "No se pudo cargar tu perfil preventivo."
        return when {
            "network" in raw.lowercase() || "timeout" in raw.lowercase() ->
                "No se pudo conectar el perfil preventivo por un problema de red."
            "unauthorized" in raw.lowercase() || "jwt" in raw.lowercase() ->
                "La sesion expiro antes de cargar tu perfil preventivo."
            else -> "No pudimos actualizar tu informacion preventiva por ahora."
        }
    }
}
