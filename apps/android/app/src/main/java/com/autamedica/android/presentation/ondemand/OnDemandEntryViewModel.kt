package com.autamedica.android.presentation.ondemand

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject

enum class OnDemandFlowStep {
    INTAKE_FORM,
    VIRTUAL_QUEUE,
    MATCHED,
}

@Serializable
private data class PatientDniDto(
    @SerialName("dni") val dni: String? = null,
)

data class OnDemandEntryUiState(
    val step: OnDemandFlowStep = OnDemandFlowStep.INTAKE_FORM,
    val patientName: String = "",
    val patientDni: String = "",
    val patientPhone: String = "",
    val selectedTier: String = "general",
    val symptomSummary: String = "Dolor o malestar general",
    val isSubmitting: Boolean = false,
    val isDataAutofilled: Boolean = false,
    val error: String? = null,
    val activeRequest: PharmacyDispatchRequest? = null,
    val isDoctorMatched: Boolean = false,
    val targetRoomId: String? = null,
    val terminalStatus: String? = null,
    val terminalMessage: String? = null,
)

@HiltViewModel
class OnDemandEntryViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val pharmacyDispatchRepository: PharmacyDispatchRepository,
    private val supabaseClient: SupabaseClient,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val prefs by lazy {
        context.getSharedPreferences("autamedica_ondemand_cache", Context.MODE_PRIVATE)
    }

    private val _uiState = MutableStateFlow(OnDemandEntryUiState())
    val uiState: StateFlow<OnDemandEntryUiState> = _uiState.asStateFlow()

    private var observationJob: Job? = null

    init {
        viewModelScope.launch {
            // 1. Cargar desde preferencias locales guardadas previamente en el dispositivo
            val cachedName = prefs.getString("last_name", null)
            val cachedDni = prefs.getString("last_dni", null)
            val cachedPhone = prefs.getString("last_phone", null)

            var name = cachedName.orEmpty()
            var phone = cachedPhone.orEmpty()
            var dni = cachedDni.orEmpty()

            // 2. Si hay sesión activa en la app, autocompletar prioritariamente desde el usuario
            try {
                val user = authRepository.getCurrentUser()
                if (user != null) {
                    val userFullName = listOfNotNull(
                        user.firstName.ifBlank { null },
                        user.lastName.ifBlank { null }
                    ).joinToString(" ").trim()

                    if (userFullName.isNotBlank()) name = userFullName
                    if (!user.phone.isNullOrBlank()) phone = user.phone

                    // Intentar resolver DNI desde la tabla patients de Supabase
                    try {
                        val patientRow = supabaseClient.postgrest
                            .from("patients")
                            .select(Columns.list("dni")) {
                                filter { eq("user_id", user.id) }
                                limit(1)
                            }
                            .decodeList<PatientDniDto>()
                            .firstOrNull()

                        val resolvedDni = patientRow?.dni?.trim()
                        if (!resolvedDni.isNullOrBlank()) {
                            dni = resolvedDni
                        }
                    } catch (e: Exception) {
                        SecureLog.warn("[OnDemandEntry] Could not fetch DNI from patients table: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                SecureLog.warn("[OnDemandEntry] Could not fetch current user: ${e.message}")
            }

            // Fallback por defecto si no hay datos (ej. Marina Gómez en pruebas)
            if (name.isBlank() && cachedName.isNullOrBlank()) {
                name = "Marina Gómez"
            }
            if (dni.isBlank() && cachedDni.isNullOrBlank()) {
                dni = "38492011"
            }
            if (phone.isBlank() && cachedPhone.isNullOrBlank()) {
                phone = "+54 9 11 5555-1234"
            }

            val isComplete = name.isNotBlank() && dni.isNotBlank() && phone.isNotBlank()

            _uiState.update { state ->
                state.copy(
                    patientName = name,
                    patientDni = dni,
                    patientPhone = phone,
                    isDataAutofilled = isComplete,
                )
            }
        }
    }

    fun setInitialTier(tier: String) {
        if (tier.isNotBlank()) {
            _uiState.update { it.copy(selectedTier = tier) }
        }
    }

    fun enterQueue(
        name: String = "Marina Gómez",
        dni: String = "38492011",
        phone: String = "+54 9 11 5555-1234",
    ) {
        _uiState.update {
            it.copy(
                patientName = name,
                patientDni = dni,
                patientPhone = phone,
                step = OnDemandFlowStep.VIRTUAL_QUEUE,
                error = null,
                terminalStatus = null,
                terminalMessage = null,
            )
        }
    }

    fun updateName(name: String) {
        _uiState.update { it.copy(patientName = name, error = null) }
    }

    fun updateDni(dni: String) {
        _uiState.update { it.copy(patientDni = dni, error = null) }
    }

    fun updatePhone(phone: String) {
        _uiState.update { it.copy(patientPhone = phone, error = null) }
    }

    fun selectTier(tier: String) {
        _uiState.update { it.copy(selectedTier = tier, error = null) }
    }

    fun updateSymptomSummary(symptom: String) {
        _uiState.update { it.copy(symptomSummary = symptom, error = null) }
    }

    fun submitIntake() {
        val state = _uiState.value
        if (state.patientDni.isBlank() || state.patientDni.length < 5) {
            _uiState.update { it.copy(error = "Ingresá tu DNI o documento para continuar") }
            return
        }
        if (state.patientPhone.isBlank() || state.patientPhone.length < 6) {
            _uiState.update { it.copy(error = "Ingresá un teléfono celular para recibir la receta") }
            return
        }

        // Persistir en caché local para que en la próxima consulta ya esté 100% autocompletado
        prefs.edit()
            .putString("last_name", state.patientName.trim())
            .putString("last_dni", state.patientDni.trim())
            .putString("last_phone", state.patientPhone.trim())
            .apply()

        _uiState.update { it.copy(isSubmitting = true, error = null) }

        viewModelScope.launch {
            pharmacyDispatchRepository.createPatientDispatchRequest(
                patientDni = state.patientDni,
                patientPhone = state.patientPhone,
                patientName = state.patientName.ifBlank { null },
                tierRequested = state.selectedTier,
                symptomSummary = state.symptomSummary.ifBlank { null },
            ).onSuccess { request ->
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        activeRequest = request,
                        step = OnDemandFlowStep.VIRTUAL_QUEUE,
                        error = null,
                    )
                }
                observeRequest(request.id, request.cloudflareRoomId)
            }.onFailure { err ->
                SecureLog.error("[OnDemandEntry] Failed creating request", err)
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        error = "No pudimos conectar con la guardia médica. Por favor intente nuevamente.",
                    )
                }
            }
        }
    }

    private fun observeRequest(requestId: String, cloudflareRoomId: String) {
        observationJob?.cancel()
        observationJob = viewModelScope.launch {
            pharmacyDispatchRepository.observePatientRequest(requestId)
                .collect { updated ->
                    _uiState.update { it.copy(activeRequest = updated) }
                    val status = updated.status.lowercase()
                    when (status) {
                        "matched", "in_call" -> {
                            val room = updated.cloudflareRoomId.ifBlank { cloudflareRoomId }
                            _uiState.update {
                                it.copy(
                                    step = OnDemandFlowStep.MATCHED,
                                    isDoctorMatched = true,
                                    targetRoomId = room,
                                    terminalStatus = null,
                                    terminalMessage = null,
                                )
                            }
                        }

                        "expired", "cancelled", "completed" -> {
                            observationJob?.cancel()
                            _uiState.update {
                                it.copy(
                                    terminalStatus = status,
                                    terminalMessage = when (status) {
                                        "expired" -> "Se agotó el tiempo de espera para encontrar un médico. Podés volver a intentar."
                                        "cancelled" -> "La solicitud fue cancelada. Podés iniciar una nueva consulta."
                                        else -> "La consulta finalizó. Podés iniciar una nueva consulta."
                                    },
                                    isDoctorMatched = false,
                                    targetRoomId = null,
                                )
                            }
                        }
                    }
                }
        }
    }

    fun retryAfterTerminal() {
        observationJob?.cancel()
        _uiState.update {
            it.copy(
                step = OnDemandFlowStep.INTAKE_FORM,
                isDoctorMatched = false,
                targetRoomId = null,
                terminalStatus = null,
                terminalMessage = null,
                error = null,
                activeRequest = null,
            )
        }
    }

    override fun onCleared() {
        super.onCleared()
        observationJob?.cancel()
    }
}
