package com.autamedica.android.presentation.videocall

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.model.VideoCallStateHolder
import com.autamedica.android.domain.model.ChatMessage
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.domain.model.StreamQualitySummary
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.domain.signaling.SignalingClient
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.videocall.webrtc.TurnManager
import com.autamedica.android.presentation.videocall.webrtc.WebRTCEngine
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
import timber.log.Timber
import javax.inject.Inject

data class VideoCallUiState(
    val connectionState: ConnectionState = ConnectionState.CONNECTING,
    val isVideoEnabled: Boolean = true,
    val isAudioEnabled: Boolean = true,
    val isSpeakerOn: Boolean = true,
    val chatMessages: List<ChatMessage> = emptyList(),
    val isChatOpen: Boolean = false,
    val chatReady: Boolean = false,
    val qualitySummary: StreamQualitySummary = StreamQualitySummary(
        "", StreamQualityLevel.UNKNOWN, emptyList()
    ),
    val callDurationSeconds: Long = 0,
    val showControls: Boolean = true,
    val hasRemoteVideo: Boolean = false,
    val isWaitingRoom: Boolean = true,
    val isPreviewOnlyMode: Boolean = false,
    val sessionStatusMessage: String? = "Esperando al médico...",
    val isDoctor: Boolean = false,
    val appointmentNotes: String? = null,
    val consultationNotes: String = "",
    val isSavingNotes: Boolean = false,
    val notesSaved: Boolean = false,
    val isClinicalNotesOpen: Boolean = false,
    val activeCallId: String? = null,
    val showSoapEvolution: Boolean = false,
    val soapData: SoapEvolutionData = SoapEvolutionData(),
    val isSavingSoap: Boolean = false,
    val soapSaved: Boolean = false,
    val soapError: String? = null,
    val doctorName: String = "Profesional Médico",
    val doctorRole: String = "Clínica Médica & Telemedicina",
    val doctorCrm: String = "",
    val patientId: String = "",
    val patientName: String = "",
    val clinicName: String = "AutaMedica",
    val preconsultationReason: String = "",
    val preconsultationSymptoms: String = "",
    val preconsultationEvolution: String = "",
    val isPreconsultationSaved: Boolean = false,
    val isAutoDegradedToAudio: Boolean = false,
)

@HiltViewModel
class VideoCallViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val peerConnectionFactory: PeerConnectionFactory,
    private val eglBase: EglBase,
    private val json: Json,
    savedStateHandle: SavedStateHandle,
    private val authRepository: AuthRepository,
    private val signalingClient: SignalingClient,
    private val telemedicineRepository: TelemedicineRepository,
    private val appointmentRepository: AppointmentRepository,
    private val doctorRepository: DoctorRepository,
    private val videoCallStateHolder: VideoCallStateHolder,
    private val supabaseClient: SupabaseClient,
) : ViewModel() {

    val appointmentId: String = savedStateHandle["appointmentId"] ?: ""
    /** roomId real de la call (room_XXXX). Si está vacío, se usa appointmentId como fallback. */
    private val incomingRoomId: String = savedStateHandle["roomId"] ?: ""
    private val previewOnlyMode: Boolean = appointmentId == VIDEO_PREVIEW_APPOINTMENT_ID

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    val engine = WebRTCEngine(
        context = context,
        peerConnectionFactory = peerConnectionFactory,
        eglBase = eglBase,
        signalingClient = signalingClient,
        scope = viewModelScope,
        json = json,
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

    init {
        _uiState.update {
            it.copy(
                connectionState = ConnectionState.DISCONNECTED,
                isWaitingRoom = true,
                sessionStatusMessage = null,
            )
        }
        setupAudioForCall()
    }

    fun startCall(isIncomingCall: Boolean = false) {
        if (callStarted) return
        callStarted = true
        callRequestedByPatient = isIncomingCall
        _uiState.update {
            it.copy(
                connectionState = if (it.isDoctor || isIncomingCall) ConnectionState.CONNECTING else ConnectionState.DISCONNECTED,
                isWaitingRoom = !it.isDoctor,
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

                var apptNotes: String? = null
                var docName = ""
                var docRole = ""
                var docCrm = ""
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

                if (resolvedPatientId.isNotBlank() && isDoc) {
                    resolvedPatientName = runCatching {
                        doctorRepository.resolvePatientNames(listOf(resolvedPatientId)).getOrNull()?.get(resolvedPatientId).orEmpty()
                    }.getOrDefault("")
                }

                if (isDoc) {
                    val profile = runCatching { doctorRepository.getDoctorProfile(currentUser.id).getOrNull() }.getOrNull()
                    docName = currentUser.displayName.ifBlank { "Dr. ${currentUser.lastName}".trim().ifBlank { "Médico Tratante" } }
                    docRole = profile?.specialty?.takeIf { it.isNotBlank() } ?: "Clínica Médica & Telemedicina"
                    docCrm = profile?.licenseNumber?.takeIf { it.isNotBlank() } ?: "Matrícula profesional"
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
                        appointmentNotes = apptNotes,
                        consultationNotes = apptNotes.orEmpty(),
                        isWaitingRoom = !isDoc,
                        sessionStatusMessage = when {
                            isDoc -> "Conectando consultorio y llamando al paciente..."
                            callRequestedByPatient -> "Conectando con tu consulta..."
                            else -> "Esperando al médico..."
                        },
                        doctorName = docName,
                        doctorRole = docRole,
                        doctorCrm = docCrm,
                        preconsultationReason = if (preReason.isNotBlank()) preReason else it.preconsultationReason,
                        isPreconsultationSaved = preSaved || it.isPreconsultationSaved,
                    )
                }

                engine.initialize(
                    WebRTCEngine.Config(
                        roomId = appointmentId,
                        userId = callUserId,
                        userType = callUserType,
                        userName = callUserName,
                    )
                )
                observeEngine()
                engine.startLocalMedia()
            }.onFailure { error ->
                SecureLog.error("Failed to start telemedicine preview", error)
                _uiState.update {
                    it.copy(
                        connectionState = ConnectionState.FAILED,
                        isWaitingRoom = false,
                        sessionStatusMessage = "No se pudo activar la camara.",
                    )
                }
                CallNotificationService.stop(context)
                videoCallStateHolder.setInVideoCall(false)
                callStarted = false
            }.onSuccess {
                if (_uiState.value.isDoctor) {
                    videoCallStateHolder.setInVideoCall(true)
                    CallNotificationService.start(context)
                    attemptSessionConnection(manualRetry = false)
                } else if (callRequestedByPatient) {
                    // Llamada entrante aceptada (paciente): conectarse directo a la sala
                    // del médico, sin pasar por el botón "Llamar al médico".
                    videoCallStateHolder.setInVideoCall(true)
                    attemptSessionConnection(manualRetry = false)
                } else {
                    // Paciente: Sala de espera en reposo con cámara local activa.
                    // No llama automáticamente al médico hasta presionar "Llamar al médico".
                    _uiState.update {
                        it.copy(
                            connectionState = ConnectionState.DISCONNECTED,
                            isWaitingRoom = true,
                            sessionStatusMessage = null,
                        )
                    }
                }
            }
        }
    }

    fun endCall() {
        disconnectCallMedia()
    }

    fun disconnectCallMedia() {
        val callId = _uiState.value.activeCallId ?: appointmentId
        if (callId.isNotBlank() && !previewOnlyMode) {
            viewModelScope.launch {
                telemedicineRepository.updateCallStatus(callId, "ended")
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
        if (targetAppointmentId.isBlank() || previewOnlyMode) {
            _uiState.update { it.copy(showSoapEvolution = false, soapSaved = true) }
            onSuccess?.invoke()
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSavingSoap = true, soapError = null) }
            runCatching {
                var resolvedPatientId: String? = null
                var resolvedDoctorId: String? = null

                val appt = appointmentRepository.getAppointmentById(targetAppointmentId).getOrNull()
                if (appt != null) {
                    resolvedPatientId = appt.patientId
                    resolvedDoctorId = appt.doctorId
                }

                if (resolvedDoctorId == null && callUserId.isNotBlank()) {
                    resolvedDoctorId = runCatching {
                        supabaseClient.postgrest.from("doctors")
                            .select(Columns.list("id")) { filter { eq("user_id", callUserId) } }
                            .decodeSingleOrNull<DoctorRecordIdDto>()?.id
                    }.getOrNull()
                }

                if (resolvedPatientId == null) {
                    val session = runCatching {
                        supabaseClient.postgrest.from("telemedicine_sessions")
                            .select(Columns.list("patient_id", "doctor_id")) {
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
                        resolvedPatientId = session.patientId
                        if (resolvedDoctorId == null) resolvedDoctorId = session.doctorId
                    }
                }

                val soapContent = buildJsonObject {
                    put("subjective", soapData.subjective)
                    put("objective", soapData.objective)
                    put("assessment", soapData.assessment)
                    put("plan", soapData.plan)
                    put("cie10_code", soapData.cie10Code)
                    put("cie10_description", soapData.cie10Description)
                }

                val insertPayload = buildJsonObject {
                    if (resolvedPatientId != null) put("patient_id", resolvedPatientId)
                    if (resolvedDoctorId != null) put("doctor_id", resolvedDoctorId)
                    put("type", "consultation")
                    put("title", "Evolución SOAP - Consulta Telemedicina")
                    put("content", soapContent)
                }

                supabaseClient.postgrest
                    .from("medical_records")
                    .insert(insertPayload)

                supabaseClient.postgrest
                    .from("appointments")
                    .update(mapOf("status" to "completed")) {
                        filter { eq("id", targetAppointmentId) }
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
                        soapError = "Error al guardar evolución: ${error.message ?: "Intente nuevamente"}",
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

    fun toggleClinicalNotes() {
        _uiState.update { it.copy(isClinicalNotesOpen = !it.isClinicalNotesOpen) }
    }

    fun updateConsultationNotes(text: String) {
        _uiState.update { it.copy(consultationNotes = text, notesSaved = false) }
    }

    fun saveConsultationNotes() {
        val notes = _uiState.value.consultationNotes
        if (appointmentId.isBlank() || previewOnlyMode) return

        viewModelScope.launch {
            _uiState.update { it.copy(isSavingNotes = true) }
            appointmentRepository.updateAppointmentNotes(appointmentId, notes)
                .onSuccess {
                    _uiState.update { it.copy(isSavingNotes = false, notesSaved = true) }
                }
                .onFailure {
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
        _uiState.update { it.copy(isChatOpen = !it.isChatOpen) }
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
                    videoCallStateHolder.setInVideoCall(true)
                    CallNotificationService.start(context)
                    val callId = _uiState.value.activeCallId ?: appointmentId
                    if (callId.isNotBlank() && !previewOnlyMode) {
                        viewModelScope.launch {
                            telemedicineRepository.updateCallStatus(callId, "connected")
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
                    state.copy(chatMessages = state.chatMessages + msg)
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

        _uiState.update { current ->
            current.copy(
                connectionState = ConnectionState.CONNECTING,
                isPreviewOnlyMode = false,
                isWaitingRoom = !current.isDoctor,
                sessionStatusMessage = if (!current.isDoctor) {
                    patientStatusMessage(manualRetry)
                } else if (manualRetry) {
                    "Intentando conectar con la sala..."
                } else {
                    current.sessionStatusMessage ?: "Conectando con la sala..."
                },
            )
        }

        // Fast path: si tenemos el roomId real de la llamada entrante, conectar directamente
        // sin hacer lookup en Supabase. Evita el bug donde appointmentId != roomId de la call.
        if (incomingRoomId.isNotBlank()) {
            sessionRetryJob?.cancel()
            _uiState.update {
                it.copy(
                    activeCallId = incomingRoomId,
                    connectionState = ConnectionState.CONNECTING,
                    isPreviewOnlyMode = false,
                    isWaitingRoom = !it.isDoctor,
                    sessionStatusMessage = if (it.isDoctor) "Conectando con la sala..." else patientStatusMessage(manualRetry),
                )
            }
            viewModelScope.launch {
                telemedicineRepository.getIceServers().onSuccess { servers ->
                    val dynamicIce = servers.map { it.toPeerConnectionIceServer() }
                    if (dynamicIce.isNotEmpty()) {
                        engine.updateIceServers(dynamicIce)
                    }
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
            engine.connect(incomingRoomId, null)
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

                val dynamicIce = sessionInfo.iceServers.map { it.toPeerConnectionIceServer() }
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
}

@Serializable
private data class DoctorRecordIdDto(val id: String)

@Serializable
private data class SessionParticipantDto(
    @SerialName("patient_id") val patientId: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
)
