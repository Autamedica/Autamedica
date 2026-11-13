package com.autamedica.android.presentation.videocall

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.VideoCallStateHolder
import com.autamedica.android.domain.model.CallClinicalGuidance
import com.autamedica.android.domain.model.CallClinicalGuidanceBuilder
import com.autamedica.android.domain.model.ChatMessage
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.domain.model.StreamQualitySummary
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.CreateCertificateRequest
import com.autamedica.android.domain.model.CreatePrescriptionRequest
import com.autamedica.android.domain.model.InCallDocumentPolicy
import com.autamedica.android.domain.model.PrescriptionItem
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.MedicalCertificateRepository
import com.autamedica.android.domain.repository.PrescriptionRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.telemetry.CallTelemetry
import kotlinx.coroutines.Dispatchers
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.common.UiErrorMapper
import com.autamedica.android.presentation.dashboard.cleanPatientName
import com.autamedica.android.presentation.videocall.webrtc.TurnManager
import com.autamedica.android.presentation.videocall.webrtc.sfu.CloudflareCallsEngine
import com.autamedica.android.presentation.videocall.webrtc.sfu.cloudflareAuthorizationMessage
import com.autamedica.android.service.CallNotificationService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.webrtc.EglBase
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.VideoTrack
import com.autamedica.android.domain.repository.IceServerInfo
import com.autamedica.android.presentation.videocall.components.SoapEvolutionData
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.ZoneId
import javax.inject.Inject

data class VideoCallUiState(
    val connectionState: ConnectionState = ConnectionState.CONNECTING,
    val isVideoEnabled: Boolean = true,
    val isAudioEnabled: Boolean = true,
    val isSpeakerOn: Boolean = true,
    val chatMessages: List<ChatMessage> = emptyList(),
    val isChatOpen: Boolean = false,
    val chatReady: Boolean = false,
    val unreadChatMessages: Int = 0,
    val qualitySummary: StreamQualitySummary = StreamQualitySummary(
        "", StreamQualityLevel.UNKNOWN, emptyList()
    ),
    val callDurationSeconds: Long = 0,
    val showControls: Boolean = true,
    val hasRemoteVideo: Boolean = false,
    val isWaitingRoom: Boolean = true,
    val isPreviewOnlyMode: Boolean = false,
    val sessionStatusMessage: String? = "Esperando al médico...",
    val isAuthorizationBlocked: Boolean = false,
    val isDoctor: Boolean = false,
    val appointmentNotes: String? = null,
    val consultationNotes: String = "",
    val isSavingNotes: Boolean = false,
    val notesSaved: Boolean = false,
    val clinicalSheetPanel: ClinicalSheetPanel = ClinicalSheetPanel.GUIDANCE,
    val isActionsOverflowOpen: Boolean = false,
    val patientClinicalContext: PatientClinicalContext? = null,
    val clinicalGuidance: CallClinicalGuidance = CallClinicalGuidance(),
    val isLoadingClinicalContext: Boolean = false,
    val activeCallId: String? = null,
    val showSoapEvolution: Boolean = false,
    val soapData: SoapEvolutionData = SoapEvolutionData(),
    val isSavingSoap: Boolean = false,
    val soapSaved: Boolean = false,
    val soapError: String? = null,
    val doctorName: String = "Profesional Médico",
    val doctorRole: String = "Clínica Médica & Telemedicina",
    val doctorCrm: String = "",
    val doctorCountryCode: String? = null,
    val patientCareCountryCode: String? = null,
    val patientId: String = "",
    val patientName: String = "",
    val clinicName: String = "AutaMedica",
    val preconsultationReason: String = "",
    val preconsultationSymptoms: String = "",
    val preconsultationEvolution: String = "",
    val isPreconsultationSaved: Boolean = false,
    val isAutoDegradedToAudio: Boolean = false,
    val isIssuingPrescription: Boolean = false,
    val isIssuingCertificate: Boolean = false,
    val lastIssuedDocumentCuir: String? = null,
    val inCallClinicalError: String? = null,
) {
    val chiefComplaintPeek: String?
        get() = patientClinicalContext?.chiefComplaint?.takeIf { it.isNotBlank() }
            ?: appointmentNotes?.takeIf { it.isNotBlank() }
            ?: preconsultationReason.takeIf { it.isNotBlank() }

    val allergyAlerts: List<String>
        get() = patientClinicalContext?.allergies.orEmpty().filter { it.isNotBlank() }

    val safetyAlertLabel: String?
        get() = when {
            allergyAlerts.isEmpty() -> clinicalGuidance.redFlags.firstOrNull()
            allergyAlerts.size == 1 -> allergyAlerts.first()
            else -> "${allergyAlerts.size} alergias"
        }

    val safetyAlertCount: Int
        get() = allergyAlerts.size +
            (patientClinicalContext?.chronicDiseases.orEmpty().count { it.isNotBlank() })

    val isClinicalSheetExpanded: Boolean
        get() = clinicalSheetPanel != ClinicalSheetPanel.GUIDANCE
}

@HiltViewModel
class VideoCallViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val peerConnectionFactory: PeerConnectionFactory,
    private val eglBase: EglBase,
    private val json: Json,
    savedStateHandle: SavedStateHandle,
    private val authRepository: AuthRepository,
    private val telemedicineRepository: TelemedicineRepository,
    private val appointmentRepository: AppointmentRepository,
    private val doctorRepository: DoctorRepository,
    private val videoCallStateHolder: VideoCallStateHolder,
    private val supabaseClient: SupabaseClient,
    private val prescriptionRepository: PrescriptionRepository,
    private val medicalCertificateRepository: MedicalCertificateRepository,
    private val pharmacyDispatchRepository: PharmacyDispatchRepository,
) : ViewModel() {

    val appointmentId: String = savedStateHandle["appointmentId"] ?: ""
    /** roomId real de la call (room_XXXX). Si está vacío, se usa appointmentId como fallback. */
    private val incomingRoomId: String = savedStateHandle["roomId"] ?: ""
    private val previewOnlyMode: Boolean = appointmentId == VIDEO_PREVIEW_APPOINTMENT_ID

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    val engine = CloudflareCallsEngine(
        context = context,
        peerConnectionFactory = peerConnectionFactory,
        eglBase = eglBase,
        supabaseClient = supabaseClient,
        scope = viewModelScope,
        json = json,
        guestTokenProvider = { roomId ->
            pharmacyDispatchRepository.getGuestAccessTokenForRoom(roomId)
        },
        onAuthorizationError = { error ->
            val message = cloudflareAuthorizationMessage(error.httpStatus)
            if (message != null) {
                _uiState.update {
                    it.copy(
                        connectionState = ConnectionState.FAILED,
                        isWaitingRoom = true,
                        isAuthorizationBlocked = true,
                        sessionStatusMessage = message,
                    )
                }
                videoCallStateHolder.setInVideoCall(false)
                CallNotificationService.stop(context)
            }
        },
    )

    private val turnManager = TurnManager(
        fetchTurnServers = {
            telemedicineRepository.getIceServers().getOrDefault(emptyList())
        }
    )

    private val _uiState = MutableStateFlow(VideoCallUiState())
    val uiState: StateFlow<VideoCallUiState> = _uiState.asStateFlow()

    val localVideoTrack: StateFlow<VideoTrack?> = engine.localVideoTrack
    val remoteVideoTrack: StateFlow<VideoTrack?> = engine.remoteVideoTrack
    val eglContext: EglBase.Context get() = eglBase.eglBaseContext
    val currentUserId: String
        get() = callUserId

    private var callStartTimeMs: Long = 0L
    private var timerJob: kotlinx.coroutines.Job? = null
    private var sessionRetryJob: kotlinx.coroutines.Job? = null
    private var engineObserversBound = false
    private var callStarted = false
    private var callRequestedByPatient = false
    private var callUserId: String = ""
    private var callUserType: String = ""
    private var callUserName: String = ""
    private var explicitRoomId: String = ""
    private var activePharmacyDispatchId: String? = null
    private var consultationMonitorJob: kotlinx.coroutines.Job? = null

    init {
        viewModelScope.launch {
            val currentUser = runCatching { authRepository.getCurrentUser() }.getOrNull()
            if (currentUser?.role == UserRole.DOCTOR) {
                _uiState.update { it.copy(isDoctor = true, isWaitingRoom = false) }
            }
        }
        _uiState.update {
            it.copy(
                connectionState = ConnectionState.DISCONNECTED,
                isWaitingRoom = true,
                sessionStatusMessage = null,
            )
        }
        setupAudioForCall()
    }

    fun startCall(roomId: String = "", isIncomingCall: Boolean = false) {
        if (callStarted) return
        callStarted = true
        callRequestedByPatient = isIncomingCall
        if (roomId.isNotBlank()) explicitRoomId = roomId

        val effectiveRoomId = explicitRoomId.takeIf { it.isNotBlank() }
            ?: incomingRoomId.takeIf { it.isNotBlank() }
            ?: appointmentId

        CallTelemetry.recordMilestone(null, "T2_START_CALL")

        _uiState.update {
            it.copy(
                connectionState = if (it.isDoctor || isIncomingCall) ConnectionState.CONNECTING else ConnectionState.DISCONNECTED,
                isWaitingRoom = !it.isDoctor,
                isAuthorizationBlocked = false,
                sessionStatusMessage = when {
                    it.isDoctor -> "Conectando consultorio..."
                    isIncomingCall -> "Conectando con tu consulta..."
                    else -> null
                },
            )
        }

        viewModelScope.launch {
            runCatching {
                val currentUser = authRepository.getCurrentUser()
                    ?: throw IllegalStateException("No authenticated user available for video call")
                callUserId = currentUser.id
                callUserType = currentUser.role.wireName
                callUserName = currentUser.displayName
                val isDoc = currentUser.role == UserRole.DOCTOR

                // 1. INICIALIZAR Y ENCENDER MEDIOS DE INMEDIATO (T0 -> T3 < 200ms)
                // Cero bloqueo por queries de base de datos
                engine.initialize(
                    CloudflareCallsEngine.Config(
                        roomId = effectiveRoomId,
                        userId = callUserId,
                        userType = callUserType,
                        userName = callUserName,
                    )
                )
                observeEngine()
                engine.startLocalMedia()
                CallTelemetry.recordMilestone(null, "T3_CAMERA_STARTED")

                val isPharmacyCall = !activePharmacyDispatchId.isNullOrBlank() || effectiveRoomId.startsWith("cf-room") || effectiveRoomId.startsWith("room_pharmacy")

                if (isDoc) {
                    videoCallStateHolder.setInVideoCall(true)
                    CallNotificationService.start(context)
                    attemptSessionConnection(manualRetry = false)
                } else if (isIncomingCall || isPharmacyCall) {
                    videoCallStateHolder.setInVideoCall(true)
                    _uiState.update { it.copy(isWaitingRoom = false) }
                    attemptSessionConnection(manualRetry = false)
                } else {
                    _uiState.update {
                        it.copy(
                            connectionState = ConnectionState.DISCONNECTED,
                            isWaitingRoom = true,
                            sessionStatusMessage = null,
                        )
                    }
                }

                // 2. CARGA ASÍNCRONA DE CONTEXTO CLÍNICO EN SEGUNDO PLANO
                // Corre en paralelo mientras el video ya se negocia y conecta con el SFU
                viewModelScope.launch(Dispatchers.IO) {
                    loadClinicalDataInBackground(currentUser, isDoc, effectiveRoomId)
                }
            }.onFailure { error ->
                SecureLog.error("Failed to start telemedicine preview", error)
                _uiState.update {
                    it.copy(
                        connectionState = ConnectionState.FAILED,
                        isWaitingRoom = false,
                        sessionStatusMessage = UiErrorMapper.map(error, "No se pudo iniciar la videollamada"),
                    )
                }
                CallNotificationService.stop(context)
                videoCallStateHolder.setInVideoCall(false)
                callStarted = false
            }
        }
    }

    private suspend fun loadClinicalDataInBackground(
        currentUser: User,
        isDoc: Boolean,
        effectiveRoomId: String,
    ) {
        var apptNotes: String? = null
        var docName = ""
        var docRole = ""
        var docCrm = ""
        var resolvedDoctorCountry: String? = null
        var preReason = ""
        var preSaved = false
        var resolvedPatientId = ""
        var resolvedPatientName = ""

        if (!previewOnlyMode && appointmentId.isNotBlank()) {
            runCatching {
                val appt = appointmentRepository.getAppointmentById(appointmentId).getOrNull()
                if (appt != null) {
                    resolvedPatientId = appt.patientId.orEmpty()
                    apptNotes = appt.notes
                    appt.doctorName?.takeIf { it.isNotBlank() }?.let { docName = it }
                    appt.doctorSpecialty?.takeIf { it.isNotBlank() }?.let { docRole = it }
                    appt.doctorLicenseNumber?.takeIf { it.isNotBlank() }?.let { docCrm = it }
                    if (!appt.notes.isNullOrBlank()) {
                        preReason = appt.notes
                        preSaved = true
                    }
                }
            }
        }

        // Guardia on-demand: el doctor entra directo a una sala de dispatch (sin cita).
        // Cargar identidad y motivo del paciente desde pharmacy_dispatch_requests.
        var synthesizedContext: PatientClinicalContext? = null
        if (isDoc && resolvedPatientId.isBlank() && !previewOnlyMode) {
            val dispatchRoom = explicitRoomId.takeIf { it.isNotBlank() }
                ?: incomingRoomId.takeIf { it.isNotBlank() }
                ?: appointmentId
            if (dispatchRoom.startsWith("cf-room") || dispatchRoom.startsWith("room_pharmacy")) {
                runCatching {
                    val dispatchPatient = supabaseClient.postgrest
                        .from("pharmacy_dispatch_requests")
                        .select(Columns.list("id", "patient_name", "patient_dni", "patient_cpf", "patient_phone", "symptom_summary", "tier_requested", "requested_by_user_id", "patient_id")) {
                            filter { eq("cloudflare_room_id", dispatchRoom) }
                            limit(1)
                        }
                        .decodeSingleOrNull<DispatchPatientContextDto>()
                    if (dispatchPatient != null) {
                        activePharmacyDispatchId = dispatchPatient.id
                        if (dispatchPatient.patientName.isNullOrBlank().not()) {
                            resolvedPatientName = cleanPatientName(dispatchPatient.patientName.orEmpty())
                        }
                        // A DNI/CPF or a claimed user ID from kiosk triage is not proof of
                        // patient ownership. Only a patient record explicitly linked by
                        // the trusted dispatch backend may enable clinical document actions.
                        resolvedPatientId = dispatchPatient.patientId.orEmpty()
                        if (preReason.isBlank()) {
                            preReason = dispatchPatient.symptomSummary.orEmpty()
                        }
                        val dniFormatted = dispatchPatient.patientDni?.takeIf { it.isNotBlank() }?.let { "DNI: $it" }
                        val phoneFormatted = dispatchPatient.patientPhone?.takeIf { it.isNotBlank() }?.let { "Tel: $it" }
                        val contactInfo = listOfNotNull(dniFormatted, phoneFormatted).joinToString(" • ")
                        apptNotes = listOfNotNull(contactInfo.takeIf { it.isNotBlank() }, preReason.takeIf { it.isNotBlank() }).joinToString(" | ")
                        preSaved = preReason.isNotBlank()

                        synthesizedContext = PatientClinicalContext(
                            hasAnamnesis = true,
                            chiefComplaint = preReason.ifBlank { "Consulta de guardia on-demand" },
                            presentIllness = contactInfo.ifBlank { "Paciente on-demand" },
                            medications = if (preReason.contains("Receta", ignoreCase = true)) "Solicita renovación de prescripción médica" else null,
                        )

                        if (isDoc) {
                            val currentDocId = currentUser.id
                            runCatching {
                                val rpcParams = buildJsonObject {
                                    put("p_request_id", dispatchPatient.id)
                                    put("p_doctor_id", currentDocId)
                                }
                                supabaseClient.postgrest.rpc("claim_pharmacy_request_tier", rpcParams)
                            }
                        }
                    }
                }.onFailure {
                    SecureLog.error("[VideoCallVM] Failed resolving dispatch patient context", it)
                }
            }
        }

        if (resolvedPatientId.isNotBlank() && isDoc && resolvedPatientName.isBlank()) {
            resolvedPatientName = runCatching {
                doctorRepository.resolvePatientNames(listOf(resolvedPatientId)).getOrNull()?.get(resolvedPatientId).orEmpty()
            }.getOrDefault("")
        }

        val resolvedPatientCareCountry = if (isDoc && resolvedPatientId.isNotBlank()) {
            runCatching {
                supabaseClient.postgrest.from("patients")
                    .select(Columns.list("care_country")) {
                        filter { eq("id", resolvedPatientId) }
                        limit(1)
                    }.decodeSingleOrNull<CallPatientCareCountryDto>()?.careCountry
            }.getOrNull()
        } else null

        if (isDoc) {
            val profile = runCatching { doctorRepository.getDoctorProfile(currentUser.id).getOrNull() }.getOrNull()
            docName = currentUser.displayName.ifBlank { "Dr. ${currentUser.lastName}".trim().ifBlank { "Médico Tratante" } }
            docRole = profile?.specialty?.takeIf { it.isNotBlank() } ?: "Clínica Médica & Telemedicina"
            docCrm = profile?.licenseNumber?.takeIf { it.isNotBlank() } ?: "Matrícula profesional"
            // SSS/SISA is Argentina-only. Brazilian CRM doctors must not be
            // disabled merely because they have no Argentinian registry status.
            resolvedDoctorCountry = when {
                profile?.active != true -> null
                profile.countryCode == "BR" -> "BR"
                profile.countryCode == "AR" && profile.sssValidationStatus in setOf("valid", "exempt") -> "AR"
                else -> null
            }
        } else {
            if (docName.isBlank()) docName = "Profesional Médico"
            if (docRole.isBlank()) docRole = "Telemedicina"
            if (docCrm.isBlank()) docCrm = ""
        }

        _uiState.update {
            it.copy(
                isDoctor = isDoc,
                patientId = resolvedPatientId,
                patientName = resolvedPatientName,
                patientClinicalContext = synthesizedContext,
                appointmentNotes = apptNotes,
                consultationNotes = apptNotes.orEmpty(),
                doctorName = docName,
                doctorRole = docRole,
                doctorCrm = docCrm,
                doctorCountryCode = resolvedDoctorCountry,
                patientCareCountryCode = resolvedPatientCareCountry,
                preconsultationReason = if (preReason.isNotBlank()) preReason else it.preconsultationReason,
                isPreconsultationSaved = preSaved || it.isPreconsultationSaved,
                isLoadingClinicalContext = isDoc && resolvedPatientId.isNotBlank(),
                clinicalGuidance = if (isDoc) {
                    CallClinicalGuidanceBuilder.fromLocalContext(
                        context = synthesizedContext,
                        appointmentNotes = apptNotes,
                        preconsultationReason = preReason,
                    )
                } else {
                    CallClinicalGuidance()
                },
            )
        }

        if (isDoc && resolvedPatientId.isNotBlank()) {
            loadPatientClinicalContext(resolvedPatientId)
        }

        startConsultationStatusMonitor(effectiveRoomId, activePharmacyDispatchId)
    }

    fun endCall() {
        disconnectCallMedia()
    }

    fun disconnectCallMedia() {
        runCatching { engine.sendCallEnded() }
        consultationMonitorJob?.cancel()
        consultationMonitorJob = null
        val callId = _uiState.value.activeCallId ?: appointmentId
        if (callId.isNotBlank() && !previewOnlyMode) {
            viewModelScope.launch {
                telemedicineRepository.updateCallStatus(callId, "ended")
            }
        }
        val isDoc = _uiState.value.isDoctor
        val dispatchRoom = explicitRoomId.ifBlank { incomingRoomId.ifBlank { appointmentId } }
        val isPharmacyCall = !activePharmacyDispatchId.isNullOrBlank() || dispatchRoom.startsWith("cf-room") || dispatchRoom.startsWith("room_pharmacy")
        if (isDoc && isPharmacyCall) {
            val reqId = activePharmacyDispatchId
            val docId = callUserId
            @OptIn(kotlinx.coroutines.DelicateCoroutinesApi::class)
            kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                runCatching {
                    val effectiveReqId = reqId ?: runCatching {
                        supabaseClient.postgrest.from("pharmacy_dispatch_requests")
                            .select(Columns.list("id")) { filter { eq("cloudflare_room_id", dispatchRoom) }; limit(1) }
                            .decodeSingleOrNull<DispatchStatusDto>()?.id
                    }.getOrNull()

                    val params = buildJsonObject {
                        if (docId.isNotBlank()) put("p_doctor_id", docId)
                        if (!effectiveReqId.isNullOrBlank()) put("p_request_id", effectiveReqId)
                    }
                    supabaseClient.postgrest.rpc("finish_pharmacy_consultation", params)
                    SecureLog.info("[VideoCall] finish_pharmacy_consultation RPC succeeded for doctor=$docId req=$effectiveReqId")
                }.onFailure { e ->
                    SecureLog.error("[VideoCall] Failed releasing doctor pharmacy duty via finish_pharmacy_consultation", e)
                }
            }
        }
        callStarted = false
        timerJob?.cancel()
        sessionRetryJob?.cancel()
        turnManager.stopTurnCredentialRefresh()
        engine.disconnect()
        restoreAudio()
        CallNotificationService.stop(context)
        videoCallStateHolder.setInVideoCall(false)
    }

    fun handleCallEnd(onNavigateBack: () -> Unit) {
        val isDoc = _uiState.value.isDoctor
        if (isDoc && !previewOnlyMode && !_uiState.value.soapSaved) {
            disconnectCallMedia()
            _uiState.update {
                it.copy(
                    showSoapEvolution = true,
                    connectionState = ConnectionState.DISCONNECTED,
                    isWaitingRoom = false,
                )
            }
        } else {
            endCall()
            onNavigateBack()
        }
    }

    fun updateSoapData(data: SoapEvolutionData) {
        _uiState.update { it.copy(soapData = data, soapError = null) }
    }

    fun openSoapEvolution() {
        _uiState.update { it.copy(showSoapEvolution = true) }
    }

    fun dismissSoapEvolution() {
        _uiState.update { it.copy(showSoapEvolution = false) }
    }

    fun saveSoapEvolution(
        targetAppointmentId: String = this.appointmentId,
        soapData: SoapEvolutionData = _uiState.value.soapData,
        onSuccess: (() -> Unit)? = null,
    ) {
        if (previewOnlyMode) {
            _uiState.update { it.copy(showSoapEvolution = false, soapSaved = true) }
            onSuccess?.invoke()
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSavingSoap = true, soapError = null) }
            runCatching {
                var resolvedPatientId: String? = _uiState.value.patientId.takeIf { it.isNotBlank() }
                var resolvedDoctorId: String? = null
                var resolvedAppointmentId: String? = null

                if (targetAppointmentId.isNotBlank()) {
                    val appt = appointmentRepository.getAppointmentById(targetAppointmentId).getOrNull()
                    if (appt != null) {
                        resolvedAppointmentId = appt.id
                        resolvedPatientId = appt.patientId
                        resolvedDoctorId = appt.doctorId
                    }
                }

                // Prioritize authenticated doctor record to strictly satisfy RLS medical_records_insert_doctor
                val uid = callUserId.ifBlank { authRepository.getCurrentUser()?.id.orEmpty() }
                val myDoctorProfile = if (uid.isNotBlank()) doctorRepository.getDoctorProfile(uid).getOrNull() else null
                if (myDoctorProfile != null) {
                    resolvedDoctorId = myDoctorProfile.id
                } else if (resolvedDoctorId == null && callUserId.isNotBlank()) {
                    resolvedDoctorId = runCatching {
                        supabaseClient.postgrest.from("doctors")
                            .select(Columns.list("id")) { filter { eq("user_id", callUserId) } }
                            .decodeSingleOrNull<DoctorRecordIdDto>()?.id
                    }.getOrNull()
                }

                if ((resolvedPatientId == null || resolvedAppointmentId == null) && targetAppointmentId.isNotBlank()) {
                    val session = runCatching {
                        supabaseClient.postgrest.from("telemedicine_sessions")
                            .select(Columns.list("patient_id", "doctor_id", "appointment_id")) {
                                filter {
                                    or {
                                        eq("appointment_id", targetAppointmentId)
                                        eq("id", targetAppointmentId)
                                        eq("room_id", targetAppointmentId)
                                    }
                                }
                                limit(1)
                            }
                            .decodeSingleOrNull<SessionParticipantDto>()
                    }.getOrNull()
                    if (session != null) {
                        if (resolvedPatientId == null) resolvedPatientId = session.patientId
                        if (resolvedDoctorId == null) resolvedDoctorId = session.doctorId
                        if (resolvedAppointmentId == null) resolvedAppointmentId = session.appointmentId
                    }
                }

                if (resolvedAppointmentId == null && targetAppointmentId.isNotBlank() && runCatching { java.util.UUID.fromString(targetAppointmentId) }.isSuccess) {
                    resolvedAppointmentId = targetAppointmentId
                }

                // Fallback para guardia on-demand (sin appointmentId pero con cloudflare_room_id)
                var resolvedDispatchId: String? = null
                var kioskPatientDni: String? = null
                val effectiveRoom: String = explicitRoomId.ifBlank { _uiState.value.activeCallId.orEmpty() }
                if (effectiveRoom.isNotBlank()) {
                    val dispatch = runCatching {
                        supabaseClient.postgrest.from("pharmacy_dispatch_requests")
                            .select(Columns.list("id", "assigned_doctor_id", "patient_dni", "patient_cpf", "patient_id", "symptom_summary", "requested_by_user_id")) {
                                filter { eq("cloudflare_room_id", effectiveRoom) }
                                limit(1)
                            }
                            .decodeSingleOrNull<DispatchRecordDto>()
                    }.getOrNull()
                    if (dispatch != null) {
                        resolvedDispatchId = dispatch.id
                        kioskPatientDni = dispatch.patientDni
                        if (resolvedDoctorId == null) resolvedDoctorId = dispatch.assignedDoctorId

                        if (resolvedPatientId == null) {
                            resolvedPatientId = dispatch.patientId
                                ?.takeIf { it.isNotBlank() }
                                ?: runCatching {
                                    supabaseClient.postgrest.from("patients")
                                        .select(Columns.list("id")) {
                                            filter {
                                                if (!dispatch.requestedByUserId.isNullOrBlank()) {
                                                    eq("user_id", dispatch.requestedByUserId)
                                                } else if (!dispatch.patientDni.isNullOrBlank()) {
                                                    eq("dni", dispatch.patientDni)
                                                } else if (!dispatch.patientCpf.isNullOrBlank()) {
                                                    eq("cpf", dispatch.patientCpf)
                                                }
                                            }
                                            limit(1)
                                        }.decodeSingleOrNull<PatientRecordIdDto>()?.id
                                }.getOrNull()
                        }

                        // Actualizar resumen en pharmacy_dispatch_requests
                        runCatching {
                            supabaseClient.postgrest.from("pharmacy_dispatch_requests").update(
                                buildJsonObject {
                                    put("symptom_summary", "${dispatch.symptomSummary.orEmpty()}\n[Evolución médica]: ${soapData.subjective} - ${soapData.assessment}".trim())
                                }
                            ) {
                                filter { eq("id", dispatch.id) }
                            }
                        }
                    }
                }

                // Asegurar que resolvedPatientId sea el UUID de patients.id (y no auth.users.id)
                if (resolvedPatientId != null) {
                    val verifiedPatId = runCatching {
                        supabaseClient.postgrest.from("patients")
                            .select(Columns.list("id")) {
                                filter {
                                    or {
                                        eq("id", resolvedPatientId)
                                        eq("user_id", resolvedPatientId)
                                    }
                                }
                                limit(1)
                            }.decodeSingleOrNull<PatientRecordIdDto>()?.id
                    }.getOrNull()
                    if (verifiedPatId != null) {
                        resolvedPatientId = verifiedPatId
                    }
                }

                val soapContent = buildJsonObject {
                    put("subjective", soapData.subjective)
                    put("objective", soapData.objective)
                    put("assessment", soapData.assessment)
                    put("plan", soapData.plan)
                    put("cie10_code", soapData.cie10Code)
                    put("cie10_description", soapData.cie10Description)
                    put("source", if (resolvedDispatchId != null) "on_demand_dispatch" else "telemedicine")
                    if (resolvedDispatchId != null || kioskPatientDni != null) {
                        put("dispatch_metadata", buildJsonObject {
                            if (resolvedDispatchId != null) put("dispatch_id", resolvedDispatchId)
                            if (kioskPatientDni != null) put("patient_dni", kioskPatientDni)
                        })
                    }
                }

                val insertPayload = buildJsonObject {
                    if (resolvedPatientId != null) put("patient_id", resolvedPatientId)
                    if (resolvedDoctorId != null) put("doctor_id", resolvedDoctorId)
                    if (resolvedAppointmentId != null) put("appointment_id", resolvedAppointmentId)
                    put("type", "consultation")
                    put("title", "Evolución SOAP - Consulta Telemedicina")
                    put("content", soapContent)
                }

                if (resolvedPatientId != null && resolvedDoctorId != null) {
                    runCatching {
                        supabaseClient.postgrest.from("patient_care_team")
                            .upsert(buildJsonObject {
                                put("patient_id", resolvedPatientId)
                                put("doctor_id", resolvedDoctorId)
                                put("role", "consultant")
                                put("active", true)
                            })
                    }
                    runCatching {
                        supabaseClient.postgrest.from("doctor_patient")
                            .upsert(buildJsonObject {
                                put("patient_id", resolvedPatientId)
                                put("doctor_id", resolvedDoctorId)
                            })
                    }
                }

                val existingRecordId = if (resolvedAppointmentId != null) {
                    runCatching {
                        supabaseClient.postgrest.from("medical_records")
                            .select(Columns.list("id")) {
                                filter {
                                    eq("appointment_id", resolvedAppointmentId)
                                    exact("deleted_at", null)
                                }
                                limit(1)
                            }.decodeSingleOrNull<DoctorRecordIdDto>()?.id
                    }.getOrNull()
                } else null

                if (existingRecordId != null) {
                    supabaseClient.postgrest
                        .from("medical_records")
                        .update(insertPayload) {
                            filter { eq("id", existingRecordId) }
                        }
                } else {
                    supabaseClient.postgrest
                        .from("medical_records")
                        .insert(insertPayload)
                }

                val finalAppointmentIdToComplete = resolvedAppointmentId ?: targetAppointmentId.takeIf {
                    runCatching { java.util.UUID.fromString(it) }.isSuccess
                }
                if (finalAppointmentIdToComplete != null) {
                    supabaseClient.postgrest
                        .from("appointments")
                        .update(mapOf("status" to "completed")) {
                            filter { eq("id", finalAppointmentIdToComplete) }
                        }
                }

                val callId = _uiState.value.activeCallId ?: targetAppointmentId
                if (callId.isNotBlank()) {
                    telemedicineRepository.updateCallStatus(callId, "ended")
                }

                appointmentRepository.clearCachedAppointmentsForCurrentUser()
            }.onSuccess {
                SecureLog.info("[Telemedicine] SOAP evolution saved successfully for appointment=$targetAppointmentId")
                _uiState.update {
                    it.copy(
                        isSavingSoap = false,
                        soapSaved = true,
                        showSoapEvolution = false,
                    )
                }
                onSuccess?.invoke()
            }.onFailure { error ->
                SecureLog.error("[Telemedicine] Failed saving SOAP evolution", error)
                _uiState.update {
                    it.copy(
                        isSavingSoap = false,
                        soapError = "Error al guardar evolución: ${UiErrorMapper.map(error, "Intente nuevamente")}",
                    )
                }
            }
        }
    }

    fun joinConsultation() {
        callRequestedByPatient = true
        sessionRetryJob?.cancel()
        _uiState.update {
            it.copy(
                connectionState = ConnectionState.CONNECTING,
                isAuthorizationBlocked = false,
                sessionStatusMessage = "Llamando al médico...",
            )
        }
        if (!callStarted) {
            startCall()
            return
        }
        if (previewOnlyMode) return
        viewModelScope.launch {
            attemptSessionConnection(manualRetry = true)
        }
    }

    fun cancelCallRequest() {
        callRequestedByPatient = false
        sessionRetryJob?.cancel()
        if (!previewOnlyMode) {
            engine.disconnect()
        }
        _uiState.update {
            it.copy(
                connectionState = ConnectionState.DISCONNECTED,
                sessionStatusMessage = null,
            )
        }
    }

    fun retryConnection() {
        if (!callStarted || previewOnlyMode) return
        sessionRetryJob?.cancel()
        viewModelScope.launch {
            attemptSessionConnection(manualRetry = true)
        }
    }

    fun switchCamera() {
        engine.switchCamera()
    }

    fun toggleClinicalSheet() {
        val next = if (_uiState.value.isClinicalSheetExpanded) {
            ClinicalSheetPanel.GUIDANCE
        } else {
            ClinicalSheetPanel.RESUMEN
        }
        setClinicalSheetPanel(next)
    }

    fun setClinicalSheetPanel(panel: ClinicalSheetPanel) {
        _uiState.update {
            it.copy(
                clinicalSheetPanel = panel,
                isActionsOverflowOpen = false,
            )
        }
    }

    fun updateConsultationNotes(text: String) {
        _uiState.update { it.copy(consultationNotes = text, notesSaved = false) }
    }

    fun saveConsultationNotes() {
        val notes = _uiState.value.consultationNotes
        if (previewOnlyMode || notes.isBlank()) return

        viewModelScope.launch {
            _uiState.update { it.copy(isSavingNotes = true) }
            runCatching {
                if (appointmentId.isNotBlank()) {
                    appointmentRepository.updateAppointmentNotes(appointmentId, notes)
                } else {
                    val effectiveRoom: String = explicitRoomId.ifBlank { _uiState.value.activeCallId.orEmpty() }
                    if (effectiveRoom.isNotBlank()) {
                        runCatching {
                            supabaseClient.postgrest.from("pharmacy_dispatch_requests").update(
                                buildJsonObject {
                                    put("symptom_summary", "[Notas]: $notes")
                                }
                            ) {
                                filter { eq("cloudflare_room_id", effectiveRoom) }
                            }
                        }
                    }
                }

                _uiState.update { current ->
                    current.copy(
                        soapData = current.soapData.copy(
                            subjective = if (current.soapData.subjective.isBlank()) notes else current.soapData.subjective
                        )
                    )
                }

                val uid = callUserId.ifBlank { authRepository.getCurrentUser()?.id.orEmpty() }
                val myDoctorProfile = if (uid.isNotBlank()) doctorRepository.getDoctorProfile(uid).getOrNull() else null
                var resolvedDoctorId = myDoctorProfile?.id
                if (resolvedDoctorId == null && uid.isNotBlank()) {
                    resolvedDoctorId = runCatching {
                        supabaseClient.postgrest.from("doctors")
                            .select(Columns.list("id")) { filter { eq("user_id", uid) } }
                            .decodeSingleOrNull<DoctorRecordIdDto>()?.id
                    }.getOrNull()
                }

                var resolvedPatientId = _uiState.value.patientId.takeIf { it.isNotBlank() }
                var resolvedAppointmentId: String? = appointmentId.takeIf {
                    runCatching { java.util.UUID.fromString(it) }.isSuccess
                }

                if (resolvedPatientId == null || resolvedAppointmentId == null) {
                    val appt = appointmentRepository.getAppointmentById(appointmentId).getOrNull()
                    if (appt != null) {
                        resolvedPatientId = appt.patientId
                        resolvedAppointmentId = appt.id
                    }
                }

                if (resolvedPatientId != null && resolvedDoctorId != null) {
                    runCatching {
                        supabaseClient.postgrest.from("patient_care_team")
                            .upsert(buildJsonObject {
                                put("patient_id", resolvedPatientId)
                                put("doctor_id", resolvedDoctorId)
                                put("role", "consultant")
                                put("active", true)
                            })
                    }

                    val contentJson = buildJsonObject {
                        put("notes", notes)
                        put("subjective", notes)
                    }
                    val insertPayload = buildJsonObject {
                        put("patient_id", resolvedPatientId)
                        put("doctor_id", resolvedDoctorId)
                        if (resolvedAppointmentId != null) put("appointment_id", resolvedAppointmentId)
                        put("type", "consultation")
                        put("title", "Evolución Clínica - Consulta Telemedicina")
                        put("content", contentJson)
                    }

                    val existingRecordId = if (resolvedAppointmentId != null) {
                        runCatching {
                            supabaseClient.postgrest.from("medical_records")
                                .select(Columns.list("id")) {
                                    filter {
                                        eq("appointment_id", resolvedAppointmentId)
                                        exact("deleted_at", null)
                                    }
                                    limit(1)
                                }.decodeSingleOrNull<DoctorRecordIdDto>()?.id
                        }.getOrNull()
                    } else null

                    if (existingRecordId != null) {
                        supabaseClient.postgrest
                            .from("medical_records")
                            .update(insertPayload) {
                                filter { eq("id", existingRecordId) }
                            }
                    } else {
                        supabaseClient.postgrest
                            .from("medical_records")
                            .insert(insertPayload)
                    }
                }
            }.onSuccess {
                _uiState.update { it.copy(isSavingNotes = false, notesSaved = true) }
            }.onFailure { error ->
                SecureLog.error("[Telemedicine] Failed saving clinical notes", error)
                _uiState.update { it.copy(isSavingNotes = false) }
            }
        }
    }

    fun toggleVideo() {
        engine.toggleVideo()
    }

    fun toggleAudio() {
        engine.toggleAudio()
    }

    fun toggleSpeaker() {
        val newState = !_uiState.value.isSpeakerOn
        setSpeakerEnabled(newState)
        _uiState.update { it.copy(isSpeakerOn = newState) }
    }

    @Suppress("DEPRECATION")
    private fun setSpeakerEnabled(enabled: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (enabled) {
                val speaker = audioManager.availableCommunicationDevices
                    .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                if (speaker != null) audioManager.setCommunicationDevice(speaker)
            } else {
                audioManager.clearCommunicationDevice()
            }
        } else {
            audioManager.isSpeakerphoneOn = enabled
        }
    }

    fun toggleChat() {
        _uiState.update { state ->
            val opening = !state.isChatOpen
            state.copy(
                isChatOpen = opening,
                unreadChatMessages = if (opening) 0 else state.unreadChatMessages,
                isActionsOverflowOpen = false,
            )
        }
    }

    fun toggleActionsOverflow() {
        _uiState.update { state ->
            state.copy(
                isActionsOverflowOpen = !state.isActionsOverflowOpen,
                clinicalSheetPanel = ClinicalSheetPanel.GUIDANCE,
            )
        }
    }

    fun closeActionsOverflow() {
        _uiState.update { it.copy(isActionsOverflowOpen = false) }
    }

    private fun loadPatientClinicalContext(patientId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingClinicalContext = true) }
            val context = doctorRepository.getPatientClinicalContext(patientId).getOrNull()
            _uiState.update { state ->
                val effectiveContext = context?.takeIf { it.hasAnamnesis } ?: state.patientClinicalContext
                val guidance = CallClinicalGuidanceBuilder.fromLocalContext(
                    context = effectiveContext,
                    appointmentNotes = state.appointmentNotes,
                    preconsultationReason = state.preconsultationReason,
                )
                state.copy(
                    patientClinicalContext = effectiveContext,
                    clinicalGuidance = guidance,
                    isLoadingClinicalContext = false,
                )
            }
        }
    }

    fun sendMessage(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return

        if (engine.sendChatMessage(trimmed)) {
            val msg = ChatMessage(
                id = "local-${System.currentTimeMillis()}",
                text = trimmed,
                senderId = callUserId,
                senderType = callUserType,
                senderName = callUserName,
                timestamp = System.currentTimeMillis(),
            )
            _uiState.update { state ->
                state.copy(chatMessages = state.chatMessages + msg)
            }
        } else {
            val systemMessage = ChatMessage(
                id = "system-${System.currentTimeMillis()}",
                text = "No se pudo enviar. Verifica la conexion del chat.",
                senderId = "system",
                senderType = "system",
                senderName = "Sistema",
                timestamp = System.currentTimeMillis(),
            )
            _uiState.update { state ->
                state.copy(chatMessages = state.chatMessages + systemMessage)
            }
        }
    }

    fun toggleControlsVisibility() {
        _uiState.update { it.copy(showControls = !it.showControls) }
    }

    private fun setupAudioForCall() {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        setSpeakerEnabled(true)
    }

    private fun restoreAudio() {
        audioManager.mode = AudioManager.MODE_NORMAL
        setSpeakerEnabled(false)
    }

    private fun observeEngine() {
        if (engineObserversBound) return
        engineObserversBound = true

        viewModelScope.launch {
            engine.connectionState.collect { state ->
                _uiState.update { current ->
                    val isPatientWaiting = !current.isDoctor && engine.remoteVideoTrack.value == null
                    val effectiveState = if (!current.isDoctor && !callRequestedByPatient) {
                        ConnectionState.DISCONNECTED
                    } else if (isPatientWaiting && state == ConnectionState.DISCONNECTED && callRequestedByPatient) {
                        ConnectionState.CONNECTING
                    } else {
                        state
                    }
                    current.copy(
                        connectionState = effectiveState,
                        // isWaitingRoom derivado y no monotónico: cuando el estado llega a CONNECTED
                        // (médico en sala) la sala de espera cede paso a la llamada activa.
                        isWaitingRoom = isPatientWaiting && effectiveState != ConnectionState.CONNECTED,
                        sessionStatusMessage = when {
                            !current.isDoctor && !callRequestedByPatient -> null
                            effectiveState == ConnectionState.CONNECTING -> "Llamando al médico..."
                            effectiveState == ConnectionState.CONNECTED -> null
                            effectiveState == ConnectionState.RECONNECTING -> "Recuperando la conexión..."
                            else -> current.sessionStatusMessage
                        },
                    )
                }
                if (state == ConnectionState.CONNECTED) {
                    CallTelemetry.recordMilestone(null, "T4_SFU_MEDIA_CONNECTED")
                    videoCallStateHolder.setInVideoCall(true)
                    CallNotificationService.start(context)
                    val callId = _uiState.value.activeCallId ?: appointmentId
                    if (callId.isNotBlank() && !previewOnlyMode) {
                        viewModelScope.launch {
                            telemedicineRepository.updateCallStatus(callId, "connected")
                        }
                    }
                    val currentDispatchId = activePharmacyDispatchId
                    if (!currentDispatchId.isNullOrBlank()) {
                        viewModelScope.launch {
                            runCatching {
                                supabaseClient.postgrest
                                    .from("pharmacy_dispatch_requests")
                                    .update(mapOf(
                                        "status" to "in_call",
                                        "call_started_at" to java.time.OffsetDateTime.now().toString()
                                    )) {
                                        filter { eq("id", currentDispatchId) }
                                    }
                            }
                        }
                    }
                    if (callStartTimeMs == 0L) {
                        sessionRetryJob?.cancel()
                        callStartTimeMs = System.currentTimeMillis()
                        startTimer()
                    }
                }
            }
        }

        viewModelScope.launch {
            engine.isVideoEnabled.collect { enabled ->
                _uiState.update { it.copy(isVideoEnabled = enabled) }
            }
        }

        viewModelScope.launch {
            engine.isAudioEnabled.collect { enabled ->
                _uiState.update { it.copy(isAudioEnabled = enabled) }
            }
        }

        viewModelScope.launch {
            engine.chatReady.collect { ready ->
                _uiState.update { it.copy(chatReady = ready) }
            }
        }

        viewModelScope.launch {
            engine.chatMessages.collect { msg ->
                _uiState.update { state ->
                    val isOwnMessage = msg.senderId == callUserId
                    val unreadDelta = if (!state.isChatOpen && !isOwnMessage && msg.senderType != "system") 1 else 0
                    state.copy(
                        chatMessages = state.chatMessages + msg,
                        unreadChatMessages = state.unreadChatMessages + unreadDelta,
                    )
                }
            }
        }

        viewModelScope.launch {
            engine.qualitySummary.collect { summary ->
                _uiState.update { it.copy(qualitySummary = summary) }
            }
        }

        viewModelScope.launch {
            engine.remoteVideoTrack.collect { track ->
                _uiState.update { it.copy(hasRemoteVideo = track != null) }
            }
        }

        viewModelScope.launch {
            engine.isAutoDegradedToAudio.collect { autoDegraded ->
                _uiState.update { it.copy(isAutoDegradedToAudio = autoDegraded) }
            }
        }
    }

    fun reactivateVideo() {
        engine.reactivateVideoAfterAutoDegrade()
    }

    fun updatePreconsultationReason(reason: String) {
        _uiState.update { it.copy(preconsultationReason = reason, isPreconsultationSaved = false) }
    }

    fun updatePreconsultationSymptoms(symptoms: String) {
        _uiState.update { it.copy(preconsultationSymptoms = symptoms, isPreconsultationSaved = false) }
    }

    fun updatePreconsultationEvolution(evolution: String) {
        _uiState.update { it.copy(preconsultationEvolution = evolution, isPreconsultationSaved = false) }
    }

    fun savePreconsultation() {
        val state = _uiState.value
        val reason = state.preconsultationReason.ifBlank { "Control o chequeo" }
        val symptoms = if (state.preconsultationSymptoms.isNotBlank()) "\nSíntomas: ${state.preconsultationSymptoms}" else ""
        val formattedSummary = "Motivo: $reason$symptoms"

        _uiState.update {
            it.copy(
                isPreconsultationSaved = true,
                consultationNotes = if (it.consultationNotes.isBlank()) formattedSummary else "${it.consultationNotes}\n\n$formattedSummary",
            )
        }

        if (appointmentId.isNotBlank() && !previewOnlyMode) {
            viewModelScope.launch {
                appointmentRepository.updateAppointmentNotes(appointmentId, formattedSummary)
            }
        }
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (true) {
                val elapsed = (System.currentTimeMillis() - callStartTimeMs) / 1000
                _uiState.update { it.copy(callDurationSeconds = elapsed) }
                kotlinx.coroutines.delay(1000)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        disconnectCallMedia()
    }

    private fun patientStatusMessage(manualRetry: Boolean): String = when {
        manualRetry -> "Llamando al médico..."
        callRequestedByPatient -> "Conectando con tu consulta..."
        else -> "Esperando al médico..."
    }

    private suspend fun attemptSessionConnection(manualRetry: Boolean) {
        if (!callStarted) return

        val effectiveRoom = explicitRoomId.takeIf { it.isNotBlank() } ?: incomingRoomId
        val isPharmacyRoom = effectiveRoom.startsWith("cf-room") || effectiveRoom.startsWith("room_pharmacy")

        _uiState.update { current ->
            current.copy(
                connectionState = ConnectionState.CONNECTING,
                isAuthorizationBlocked = false,
                isPreviewOnlyMode = false,
                isWaitingRoom = !current.isDoctor && !isPharmacyRoom,
                sessionStatusMessage = if (!current.isDoctor) {
                    if (isPharmacyRoom) "Conectando con la sala de guardia..." else patientStatusMessage(manualRetry)
                } else if (manualRetry) {
                    "Intentando conectar con la sala..."
                } else {
                    current.sessionStatusMessage ?: "Conectando con la sala..."
                },
            )
        }

        if (effectiveRoom.isNotBlank()) {
            sessionRetryJob?.cancel()
            _uiState.update {
                it.copy(
                    activeCallId = effectiveRoom,
                    connectionState = ConnectionState.CONNECTING,
                    isPreviewOnlyMode = false,
                    isWaitingRoom = !it.isDoctor && !isPharmacyRoom,
                    sessionStatusMessage = if (it.isDoctor) "Conectando con la sala..." else if (isPharmacyRoom) "Conectando con la sala de guardia..." else patientStatusMessage(manualRetry),
                )
            }
            // Run ICE server fetching asynchronously in background so engine.connect starts immediately
            viewModelScope.launch {
                val dynamicIce = telemedicineRepository.getIceServers().getOrNull()?.map { it.toPeerConnectionIceServer() }
                if (!dynamicIce.isNullOrEmpty()) {
                    engine.updateIceServers(dynamicIce)
                }
            }
            turnManager.startTurnCredentialRefresh(
                scope = viewModelScope,
                onRefreshed = { freshServers ->
                    val ice = freshServers.map { it.toPeerConnectionIceServer() }
                    if (ice.isNotEmpty()) {
                        engine.updateIceServers(ice)
                    }
                }
            )
            engine.connect(effectiveRoom, null)
            return
        }

        val sessionResult = if (_uiState.value.isDoctor && !previewOnlyMode && appointmentId.isNotBlank()) {
            telemedicineRepository.startDoctorCall(appointmentId, _uiState.value.patientId.takeIf { it.isNotBlank() })
        } else {
            telemedicineRepository.getSession(appointmentId)
        }

        sessionResult
            .onSuccess { sessionInfo ->
                sessionRetryJob?.cancel()

                val dynamicIce = if (sessionInfo.iceServers.isNotEmpty()) {
                    sessionInfo.iceServers.map { it.toPeerConnectionIceServer() }
                } else {
                    telemedicineRepository.getIceServers().getOrNull()?.map { it.toPeerConnectionIceServer() } ?: emptyList()
                }
                if (dynamicIce.isNotEmpty()) {
                    engine.updateIceServers(dynamicIce)
                }

                turnManager.startTurnCredentialRefresh(
                    scope = viewModelScope,
                    onRefreshed = { freshServers ->
                        val ice = freshServers.map { it.toPeerConnectionIceServer() }
                        if (ice.isNotEmpty()) {
                            engine.updateIceServers(ice)
                        }
                    }
                )

                _uiState.update {
                    it.copy(
                        activeCallId = sessionInfo.sessionId,
                        connectionState = ConnectionState.CONNECTING,
                        isPreviewOnlyMode = false,
                        isWaitingRoom = !it.isDoctor,
                        sessionStatusMessage = if (it.isDoctor) "Conectando con la sala y llamando al paciente..." else patientStatusMessage(manualRetry),
                    )
                }
                engine.connect(sessionInfo.roomId, sessionInfo.signalingUrl)
            }
            .onFailure { error ->
                val logContext = if (manualRetry) {
                    "Failed resolving telemedicine session after manual retry"
                } else {
                    "Telemedicine session unavailable, keeping local preview active"
                }
                SecureLog.warn(logContext, error)
                enterWaitingRoom(error)
            }
    }

    private fun enterWaitingRoom(error: Throwable) {
        _uiState.update {
            it.copy(
                connectionState = if (it.isDoctor || callRequestedByPatient) ConnectionState.CONNECTING else ConnectionState.DISCONNECTED,
                isPreviewOnlyMode = false,
                isWaitingRoom = true,
                sessionStatusMessage = if (it.isDoctor || callRequestedByPatient) "Llamando al médico..." else null,
            )
        }
        if (_uiState.value.isDoctor || callRequestedByPatient) {
            scheduleSessionRetry()
        }
    }

    private fun scheduleSessionRetry() {
        if (!_uiState.value.isDoctor && !callRequestedByPatient) return
        if (sessionRetryJob?.isActive == true) return

        sessionRetryJob = viewModelScope.launch {
            while (callStarted && (callRequestedByPatient || _uiState.value.isDoctor)) {
                kotlinx.coroutines.delay(8_000)
                if (!_uiState.value.isWaitingRoom) break
                attemptSessionConnection(manualRetry = false)
            }
        }
    }

    private fun startConsultationStatusMonitor(effectiveRoomId: String, dispatchId: String?) {
        consultationMonitorJob?.cancel()
        if (previewOnlyMode) return

        consultationMonitorJob = viewModelScope.launch {
            var targetDispatchId = dispatchId
            val isPharmacyRoom = effectiveRoomId.startsWith("cf-room") || effectiveRoomId.startsWith("room_pharmacy")

            while (callStarted) {
                kotlinx.coroutines.delay(2_000)
                if (!callStarted) break

                if (isPharmacyRoom || !targetDispatchId.isNullOrBlank()) {
                    val status = runCatching {
                        supabaseClient.postgrest.from("pharmacy_dispatch_requests")
                            .select(Columns.list("id", "status")) {
                                filter {
                                    if (!targetDispatchId.isNullOrBlank()) {
                                        eq("id", targetDispatchId)
                                    } else {
                                        eq("cloudflare_room_id", effectiveRoomId)
                                    }
                                }
                                limit(1)
                            }.decodeSingleOrNull<DispatchStatusDto>()
                    }.getOrNull()

                    if (status != null) {
                        targetDispatchId = status.id
                        if (status.status == "completed" || status.status == "cancelled") {
                            SecureLog.info("[VideoCallVM] Pharmacy dispatch request reached ${status.status} in DB. Terminating call.")
                            _uiState.update {
                                it.copy(
                                    connectionState = ConnectionState.DISCONNECTED,
                                    sessionStatusMessage = "La consulta ha finalizado.",
                                )
                            }
                            disconnectCallMedia()
                            break
                        }
                    }
                } else if (appointmentId.isNotBlank()) {
                    val appt = runCatching {
                        supabaseClient.postgrest.from("appointments")
                            .select(Columns.list("status")) {
                                filter { eq("id", appointmentId) }
                                limit(1)
                            }.decodeSingleOrNull<DispatchStatusDto>()
                    }.getOrNull()

                    if (appt != null && (appt.status == "completed" || appt.status == "cancelled")) {
                        SecureLog.info("[VideoCallVM] Appointment reached ${appt.status} in DB. Terminating call.")
                        _uiState.update {
                            it.copy(
                                connectionState = ConnectionState.DISCONNECTED,
                                sessionStatusMessage = "La consulta ha finalizado.",
                            )
                        }
                        disconnectCallMedia()
                        break
                    }
                }
            }
        }
    }

    private fun waitingRoomMessage(raw: String?): String {
        val normalized = raw?.lowercase().orEmpty()
        return when {
            "network" in normalized || "timeout" in normalized ->
                "Consultorio virtual conectado. Reintentando enlace en segundo plano..."
            "no telemedicine call found" in normalized || "no telemedicine" in normalized ->
                "Consultorio conectado. El profesional está revisando tu ficha clínica previa."
            else ->
                "Sala de espera activa. El profesional ingresará a la consulta en unos momentos."
        }
    }

    private fun IceServerInfo.toPeerConnectionIceServer(): PeerConnection.IceServer {
        val builder = PeerConnection.IceServer.builder(urls)
        if (username != null) builder.setUsername(username)
        if (credential != null) builder.setPassword(credential)
        return builder.createIceServer()
    }

    fun issueInCallPrescription(
        medicationName: String,
        dosage: String,
        instructions: String,
        diagnosis: String,
        onResult: (Boolean, String?) -> Unit,
    ) {
        val trimmedMed = medicationName.trim()
        val trimmedDosage = dosage.trim()
        val trimmedInstructions = instructions.trim()
        val trimmedDiagnosis = diagnosis.trim()

        if (trimmedMed.isEmpty() || trimmedDiagnosis.isEmpty()) {
            onResult(false, "Medicamento y diagnóstico clínico son obligatorios")
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isIssuingPrescription = true, inCallClinicalError = null) }
            runCatching {
                val country = InCallDocumentPolicy.requireCountry(_uiState.value.doctorCountryCode)
                if (!InCallDocumentPolicy.canUseNativePrescriptionIssuer(country)) {
                    throw IllegalStateException("Recetas de Brasil: emitir mediante Memed desde el portal médico. El emisor Android aún no está homologado.")
                }
                var targetPatientId = _uiState.value.patientId.takeIf { it.isNotBlank() }
                if (targetPatientId == null && appointmentId.isNotBlank() && !previewOnlyMode) {
                    val appt = runCatching { appointmentRepository.getAppointmentById(appointmentId).getOrNull() }.getOrNull()
                    targetPatientId = appt?.patientId
                    if (!targetPatientId.isNullOrBlank()) {
                        _uiState.update { it.copy(patientId = targetPatientId) }
                    }
                }
                if (targetPatientId.isNullOrBlank()) {
                    throw IllegalStateException("No se pudo identificar al paciente de la llamada")
                }

                val item = PrescriptionItem(
                    medicationName = trimmedMed,
                    genericName = trimmedMed,
                    dosage = trimmedDosage.ifBlank { "Según indicación médica" },
                    frequency = "Según indicación",
                    duration = "Tratamiento ambulatorio",
                    instructions = trimmedInstructions.ifBlank { "Tomar según indicaciones clínicas durante la videoconsulta." },
                )

                val request = CreatePrescriptionRequest(
                    patientId = targetPatientId,
                    items = listOf(item),
                    diagnosis = trimmedDiagnosis,
                    notes = "Registro durante videollamada AutaMedica; firma externa pendiente de verificación",
                    countryCode = country,
                )

                prescriptionRepository.createPrescription(request).getOrThrow()
            }.onSuccess { prescription ->
                val cuir = prescription.cuir ?: prescription.id.take(8)
                val chatMsg = "📋 Receta registrada en AutaMedica (verificación de firma pendiente). Referencia: $cuir"
                engine.sendChatMessage(chatMsg)
                val localMsg = ChatMessage(
                    id = "local-rx-${System.currentTimeMillis()}",
                    text = chatMsg,
                    senderId = callUserId,
                    senderType = callUserType,
                    senderName = callUserName,
                    timestamp = System.currentTimeMillis(),
                )
                _uiState.update { state ->
                    state.copy(
                        isIssuingPrescription = false,
                        lastIssuedDocumentCuir = cuir,
                        chatMessages = state.chatMessages + localMsg,
                    )
                }
                onResult(true, cuir)
            }.onFailure { err ->
                val errorMsg = UiErrorMapper.map(err, "Error al emitir la receta")
                SecureLog.error("[Telemedicine] Failed issuing prescription in-call", err)
                _uiState.update { state ->
                    state.copy(
                        isIssuingPrescription = false,
                        inCallClinicalError = errorMsg,
                    )
                }
                onResult(false, errorMsg)
            }
        }
    }

    fun issueInCallCertificate(
        type: CertificateType,
        daysOfRest: Int,
        diagnosis: String,
        onResult: (Boolean, String?) -> Unit,
    ) {
        val trimmedDiagnosis = diagnosis.trim()
        val effectiveRest = daysOfRest

        viewModelScope.launch {
            _uiState.update { it.copy(isIssuingCertificate = true, inCallClinicalError = null) }
            runCatching {
                val country = InCallDocumentPolicy.requireCountry(_uiState.value.doctorCountryCode)
                require(effectiveRest in 0..365) { "Los días de reposo deben estar entre 0 y 365" }
                require(effectiveRest == 0 || trimmedDiagnosis.isNotBlank()) {
                    "El médico debe indicar el diagnóstico para justificar el reposo"
                }
                var targetPatientId = _uiState.value.patientId.takeIf { it.isNotBlank() }
                if (targetPatientId == null && appointmentId.isNotBlank() && !previewOnlyMode) {
                    val appt = runCatching { appointmentRepository.getAppointmentById(appointmentId).getOrNull() }.getOrNull()
                    targetPatientId = appt?.patientId
                    if (!targetPatientId.isNullOrBlank()) {
                        _uiState.update { it.copy(patientId = targetPatientId) }
                    }
                }
                if (targetPatientId.isNullOrBlank()) {
                    throw IllegalStateException("No se pudo identificar al paciente de la llamada")
                }

                val zoneId = if (country == "BR") ZoneId.of("America/Sao_Paulo")
                    else ZoneId.of("America/Argentina/Buenos_Aires")
                val today = java.time.LocalDate.now(zoneId)
                val startDateStr = today.toString()
                val endDateStr = InCallDocumentPolicy.inclusiveEndDate(today, effectiveRest)?.toString()

                val request = CreateCertificateRequest(
                    patientId = targetPatientId,
                    certificateType = type,
                    daysOfRest = effectiveRest,
                    startDate = startDateStr,
                    endDate = endDateStr,
                    diagnosis = trimmedDiagnosis.takeIf { it.isNotBlank() },
                    hideDiagnosis = country == "BR",
                    observations = "Borrador preparado durante videoconsulta AutaMedica; pendiente de firma",
                    countryCode = country,
                )

                medicalCertificateRepository.createCertificate(request).getOrThrow()
            }.onSuccess { certificate ->
                val cuir = certificate.cuir.ifBlank { certificate.id.take(8) }
                val restText = if (effectiveRest > 0) "$effectiveRest días de reposo" else "Sin reposo"
                val chatMsg = "📋 Borrador de certificado preparado: ${type.displayName} ($restText). Referencia: $cuir. Pendiente de firma médica."
                engine.sendChatMessage(chatMsg)
                val localMsg = ChatMessage(
                    id = "local-cert-${System.currentTimeMillis()}",
                    text = chatMsg,
                    senderId = callUserId,
                    senderType = callUserType,
                    senderName = callUserName,
                    timestamp = System.currentTimeMillis(),
                )
                _uiState.update { state ->
                    state.copy(
                        isIssuingCertificate = false,
                        lastIssuedDocumentCuir = cuir,
                        chatMessages = state.chatMessages + localMsg,
                    )
                }
                onResult(true, cuir)
            }.onFailure { err ->
                val errorMsg = UiErrorMapper.map(err, "Error al emitir el certificado")
                SecureLog.error("[Telemedicine] Failed issuing certificate in-call", err)
                _uiState.update { state ->
                    state.copy(
                        isIssuingCertificate = false,
                        inCallClinicalError = errorMsg,
                    )
                }
                onResult(false, errorMsg)
            }
        }
    }
}

@Serializable
private data class CallPatientCareCountryDto(
    @SerialName("care_country") val careCountry: String? = null,
)

@Serializable
private data class DoctorRecordIdDto(val id: String)

@Serializable
private data class SessionParticipantDto(
    @SerialName("patient_id") val patientId: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("appointment_id") val appointmentId: String? = null,
)

@Serializable
private data class PatientRecordIdDto(val id: String)

@Serializable
private data class DispatchRecordDto(
    val id: String,
    @SerialName("assigned_doctor_id") val assignedDoctorId: String? = null,
    @SerialName("patient_dni") val patientDni: String? = null,
    @SerialName("patient_cpf") val patientCpf: String? = null,
    @SerialName("patient_id") val patientId: String? = null,
    @SerialName("symptom_summary") val symptomSummary: String? = null,
    @SerialName("requested_by_user_id") val requestedByUserId: String? = null,
)

@Serializable
private data class DispatchPatientContextDto(
    val id: String? = null,
    @SerialName("patient_name") val patientName: String? = null,
    @SerialName("patient_dni") val patientDni: String? = null,
    @SerialName("patient_cpf") val patientCpf: String? = null,
    @SerialName("patient_id") val patientId: String? = null,
    @SerialName("patient_phone") val patientPhone: String? = null,
    @SerialName("symptom_summary") val symptomSummary: String? = null,
    @SerialName("tier_requested") val tierRequested: String? = null,
    @SerialName("requested_by_user_id") val requestedByUserId: String? = null,
)

@Serializable
private data class DispatchStatusDto(
    val id: String = "",
    val status: String = "",
)
