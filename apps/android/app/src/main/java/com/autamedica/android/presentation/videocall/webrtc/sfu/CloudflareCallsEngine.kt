package com.autamedica.android.presentation.videocall.webrtc.sfu

import android.content.Context
import com.autamedica.android.domain.model.ChatMessage
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.domain.model.StreamQualityMetrics
import com.autamedica.android.domain.model.StreamQualitySummary
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.presentation.videocall.webrtc.AutoDegradeService
import com.autamedica.android.presentation.videocall.webrtc.MedicalVideoQualityManager
import com.autamedica.android.presentation.videocall.webrtc.QualityMonitor
import io.github.jan.supabase.SupabaseClient
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.webrtc.AudioTrack
import org.webrtc.CameraVideoCapturer
import org.webrtc.EglBase
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoTrack
import timber.log.Timber

/**
 * Motor de videollamada sobre Cloudflare Calls SFU. Port de
 * packages/telemedicine/src/usecases/call-session/ + webrtc-client.ts aplicado
 * al modelo SFU (una sola PeerConnection al SFU con tracks por sesión remota,
 * señalización vía Supabase Realtime y chat sobre broadcast, no data channel).
 *
 * Expone la misma superficie pública que WebRTCEngine para que la UI no cambie.
 */
class CloudflareCallsEngine(
    private val context: Context,
    private val peerConnectionFactory: PeerConnectionFactory,
    private val eglBase: EglBase,
    private val supabaseClient: SupabaseClient,
    private val scope: CoroutineScope,
    private val json: Json = Json { ignoreUnknownKeys = true },
    private val guestTokenProvider: suspend (String) -> String? = { null },
    private val onAuthorizationError: (CloudflareCallsApiException) -> Unit = {},
) {
    data class Config(
        val iceServers: List<PeerConnection.IceServer> = emptyList(),
        val roomId: String = "default-room",
        val userId: String,
        val userType: String,
        val userName: String? = null,
    )

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _remoteVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val remoteVideoTrack: StateFlow<VideoTrack?> = _remoteVideoTrack.asStateFlow()

    private val _localVideoTrack = MutableStateFlow<VideoTrack?>(null)
    val localVideoTrack: StateFlow<VideoTrack?> = _localVideoTrack.asStateFlow()

    private val _chatMessages = MutableSharedFlow<ChatMessage>(extraBufferCapacity = 64)
    val chatMessages: SharedFlow<ChatMessage> = _chatMessages.asSharedFlow()

    private val _chatReady = MutableStateFlow(false)
    val chatReady: StateFlow<Boolean> = _chatReady.asStateFlow()

    private val _qualitySummary = MutableStateFlow(
        StreamQualitySummary("", StreamQualityLevel.UNKNOWN, emptyList())
    )
    val qualitySummary: StateFlow<StreamQualitySummary> = _qualitySummary.asStateFlow()

    private val _isVideoEnabled = MutableStateFlow(true)
    val isVideoEnabled: StateFlow<Boolean> = _isVideoEnabled.asStateFlow()

    private val _isAudioEnabled = MutableStateFlow(true)
    val isAudioEnabled: StateFlow<Boolean> = _isAudioEnabled.asStateFlow()

    private val _isAutoDegradedToAudio = MutableStateFlow(false)
    val isAutoDegradedToAudio: StateFlow<Boolean> = _isAutoDegradedToAudio.asStateFlow()

    private val autoDegradeService = AutoDegradeService(
        poorQualityThresholdMs = 30_000L,
        recoveryThresholdMs = 15_000L,
        onDegrade = {
            Timber.w("[SFU] Quality poor for 30s: auto-degrading to audio-only")
            _isAutoDegradedToAudio.value = true
            toggleVideo(false)
        },
        onRecover = {
            Timber.i("[SFU] Quality recovered for 15s")
            adaptCaptureFormat(lowPressure = false)
        },
    )

    lateinit var config: Config
    private var signaling: SfuSignaling? = null
    private var session: CloudflareCallsSession? = null
    private var activeRoomId: String? = null
    private var observersBound = false

    private var localAudioTrack: AudioTrack? = null
    private var localVideoTrackInternal: VideoTrack? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var qualityJob: Job? = null
    private val qualityMonitor = QualityMonitor()
    private val qualityManager = MedicalVideoQualityManager()
    private var remoteVideoOwnerId: String? = null

    /** userId -> Session ID SFU real del peer remoto (lo anuncia cada peer vía cf-session). */
    private val userIdToSessionId = ConcurrentHashMap<String, String>()

    /** Sesiones remotas anunciadas antes de que nuestra sesión SFU estuviera ready. */
    private val pendingRemoteSessionIds = CopyOnWriteArrayList<Pair<String, String>>()

    /** Peers que se unieron mientras aún conectábamos; se les re-anuncia cf-session. */
    private val pendingPeerAnnouncements = CopyOnWriteArrayList<String>()

    private var videoSource: org.webrtc.VideoSource? = null
    private var audioSource: org.webrtc.AudioSource? = null
    private var currentIceServers: List<PeerConnection.IceServer> = emptyList()

    private val resubscribeAttempts = ConcurrentHashMap<String, Int>()
    private val resubscribeJobs = ConcurrentHashMap<String, Job>()
    private val activeSubscribeJobs = ConcurrentHashMap<String, Job>()

    /** mid del transceiver remoto -> userId que lo publica. */
    private val midOwner = ConcurrentHashMap<String, String>()

    /** Peers cuyo último subscribe retornó 0 tracks; permite reintentar cuando llegue otro cf-session. */
    private val remoteSubscribeNoTracks = ConcurrentHashMap.newKeySet<String>()

    fun initialize(config: Config) {
        this.config = config
    }

    fun connect(roomId: String? = null, signalingUrl: String? = null) {
        val state = _connectionState.value
        if (state == ConnectionState.CONNECTING || state == ConnectionState.CONNECTED
            || state == ConnectionState.RECONNECTING) return

        setConnectionState(ConnectionState.CONNECTING)
        val finalRoomId = roomId?.takeIf { it.isNotBlank() } ?: config.roomId

        if (signaling == null || activeRoomId != finalRoomId) {
            activeRoomId = finalRoomId
            signaling = SupabaseRealtimeSignaling(
                supabaseClient = supabaseClient,
                json = json,
                scope = scope,
                roomId = finalRoomId,
                userId = config.userId,
                userType = config.userType,
            )
            bindSignalingObservers()
        }

        scope.launch {
            try {
                signaling?.open()
            } catch (err: Throwable) {
                SecureLog.warn("[SFU] Signaling open failed", err)
                setConnectionState(ConnectionState.FAILED)
            }
        }
    }

    private fun bindSignalingObservers() {
        if (observersBound) return
        observersBound = true

        scope.launch {
            signaling?.messages?.collect { message ->
                handleSignalingMessage(message)
            }
        }

        scope.launch {
            signaling?.status?.collect { state ->
                when (state) {
                    SfuSignalingStatus.CONNECTED -> {
                        if (_connectionState.value != ConnectionState.CONNECTED) {
                            launchSfuSession()
                        }
                    }
                    SfuSignalingStatus.FAILED -> {
                        if (_connectionState.value != ConnectionState.FAILED) {
                            setConnectionState(ConnectionState.FAILED)
                        }
                    }
                    SfuSignalingStatus.CONNECTING -> {}
                    SfuSignalingStatus.DISCONNECTED -> {
                        if (_connectionState.value != ConnectionState.DISCONNECTED &&
                            _connectionState.value != ConnectionState.CONNECTING
                        ) {
                            setConnectionState(ConnectionState.DISCONNECTED)
                            cleanup()
                        }
                    }
                }
            }
        }
    }

    /**
     * El SFU provee candidatos ICE dentro del SDP; no hay ICE servers externos
     * que refrescar. Se conserva la firma para no tocar la UI.
     */
    fun updateIceServers(newServers: List<PeerConnection.IceServer>) {
        if (newServers.isNotEmpty()) {
            currentIceServers = newServers
            Timber.i("[SFU] Actualizados ${newServers.size} ICE servers para la sesión SFU")
        }
    }

    fun disconnect() {
        Timber.i("[SFU] Disconnect requested")
        signaling?.close()
        signaling = null
        activeRoomId = null
        observersBound = false
        session?.let { scope.launch { it.close() } }
        session = null
        midOwner.clear()
        userIdToSessionId.clear()
        pendingRemoteSessionIds.clear()
        pendingPeerAnnouncements.clear()
        setConnectionState(ConnectionState.DISCONNECTED)
        cleanup()
    }

    private var mediaInitJob: Job? = null

    fun startLocalMedia() {
        mediaInitJob?.cancel()

        // 1. Audio initialization (instantaneous, ~5ms)
        if (localAudioTrack == null) {
            val audioConstraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("echoCancellation", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("noiseSuppression", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("autoGainControl", "true"))
            }
            val aSource = peerConnectionFactory.createAudioSource(audioConstraints)
            audioSource = aSource
            localAudioTrack = peerConnectionFactory.createAudioTrack("audio0", aSource)
            Timber.i("[SFU] Local audio track initialized")
        }

        // 2. Video source & track instantiation (instantaneous, attached to capturer observer)
        if (localVideoTrackInternal == null) {
            val vSource = peerConnectionFactory.createVideoSource(false)
            videoSource = vSource
            localVideoTrackInternal = peerConnectionFactory.createVideoTrack("video0", vSource)
            _localVideoTrack.value = localVideoTrackInternal
            Timber.i("[SFU] Local video track created")
        }

        // 3. Immediately publish to SFU session if already connected
        session?.let { sfuSession ->
            scope.launch {
                sfuSession.replacePublishedAudioTrack(localAudioTrack?.takeIf { it.enabled() })
                sfuSession.replacePublishedVideoTrack(localVideoTrackInternal?.takeIf { it.enabled() })
            }
        }

        // 4. Parallel hardware camera start in background (does not block audio/session setup)
        mediaInitJob = scope.launch(kotlinx.coroutines.Dispatchers.Default) {
            try {
                val vSource = videoSource ?: return@launch
                val sth = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
                surfaceTextureHelper = sth

                val enumerator = org.webrtc.Camera2Enumerator(context)
                val (cameraName, isBack) = qualityManager.selectBestCamera(enumerator)

                if (cameraName != null && isActive) {
                    val capturer = enumerator.createCapturer(cameraName, null) as? CameraVideoCapturer
                    videoCapturer = capturer
                    capturer?.initialize(sth, context, vSource.capturerObserver)
                    val initialProfile = qualityManager.getInitialProfile()
                    capturer?.startCapture(initialProfile.width, initialProfile.height, initialProfile.fps)
                    Timber.i("[SFU] Started video capture on $cameraName (isBack=$isBack) at ${initialProfile.name}")
                }
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Timber.w(e, "[SFU] Error initializing camera hardware in background")
            }
        }
    }

    fun stopLocalMedia() {
        mediaInitJob?.cancel()
        mediaInitJob = null
        videoCapturer?.stopCapture()
        videoCapturer?.dispose()
        videoCapturer = null
        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null
        localVideoTrackInternal?.dispose()
        localVideoTrackInternal = null
        videoSource?.dispose()
        videoSource = null
        localAudioTrack?.dispose()
        localAudioTrack = null
        audioSource?.dispose()
        audioSource = null
        _localVideoTrack.value = null
    }

    fun toggleVideo(enabled: Boolean? = null) {
        val track = localVideoTrackInternal ?: return
        val newState = enabled ?: !track.enabled()
        track.setEnabled(newState)
        _isVideoEnabled.value = newState
        session?.let { sfuSession ->
            scope.launch {
                sfuSession.replacePublishedVideoTrack(if (newState) localVideoTrackInternal else null)
            }
        }
    }

    fun toggleAudio(enabled: Boolean? = null) {
        val track = localAudioTrack ?: return
        val newState = enabled ?: !track.enabled()
        track.setEnabled(newState)
        _isAudioEnabled.value = newState
        session?.let { sfuSession ->
            scope.launch {
                sfuSession.replacePublishedAudioTrack(if (newState) localAudioTrack else null)
            }
        }
    }

    fun switchCamera() {
        videoCapturer?.switchCamera(null)
    }

    fun adaptCaptureFormat(lowPressure: Boolean) {
        val level = if (lowPressure) StreamQualityLevel.POOR else StreamQualityLevel.GOOD
        adaptCaptureQuality(level)
    }

    fun adaptCaptureQuality(level: StreamQualityLevel) {
        qualityManager.adaptCaptureFormat(videoCapturer, level)
    }

    fun reactivateVideoAfterAutoDegrade() {
        autoDegradeService.manualOverrideReset()
        _isAutoDegradedToAudio.value = false
        toggleVideo(true)
    }

    fun sendChatMessage(text: String): Boolean {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return false

        val msg = ChatMessage(
            id = "${config.userId}-${System.currentTimeMillis()}-${(Math.random() * 1000000).toInt()}",
            text = trimmed,
            senderId = config.userId,
            senderType = config.userType,
            senderName = config.userName,
            timestamp = System.currentTimeMillis(),
        )

        val messagePayload = json.encodeToJsonElement(ChatMessage.serializer(), msg).jsonObject
        val payload = buildJsonObject {
            put("message", messagePayload)
        }
        if (signaling?.status?.value != SfuSignalingStatus.CONNECTED) return false
        signaling?.send(SfuSignalingMessage(type = "chat", from = config.userId, data = payload))
        return true
    }

    fun sendCallEnded(reason: String = "completed") {
        if (signaling?.status?.value != SfuSignalingStatus.CONNECTED) return
        Timber.i("[SFU] Enviando señal call-ended a la sala (reason=$reason)")
        sendSignal(
            SfuSignalingMessage(
                type = "call-ended",
                from = config.userId,
                data = buildJsonObject {
                    put("reason", reason)
                },
            )
        )
    }

    private fun sendSignal(message: SfuSignalingMessage) {
        if (signaling?.status?.value != SfuSignalingStatus.CONNECTED) return
        signaling?.send(message)
    }

    // -- Signaling --

    private fun handleSignalingMessage(message: SfuSignalingMessage) {
        when (message.type) {
            "room-state" -> handleRoomState(message)
            "user-joined" -> message.from?.let { handleUserJoined(it) }
            "user-left" -> message.from?.let { handleUserLeft(it) }
            "call-ended" -> handleCallEnded(message)
            "cf-session" -> handleRemoteSessionAnnounced(message)
            "chat" -> handleChatMessage(message)
            else -> Unit
        }
    }

    private fun handleCallEnded(message: SfuSignalingMessage) {
        Timber.i("[SFU] Señal call-ended recibida de ${message.from}. Desconectando llamada...")
        setConnectionState(ConnectionState.DISCONNECTED)
    }

    private fun handleRoomState(message: SfuSignalingMessage) {
        val users = message.data?.get("users")
            ?: return
        val decoded = runCatching {
            json.decodeFromJsonElement(
                kotlinx.serialization.builtins.ListSerializer(RoomUserData.serializer()),
                users,
            )
        }.getOrNull() ?: return

        var hasRemoteUsers = false
        for (user in decoded) {
            val peerId = user.id.takeIf { it.isNotBlank() } ?: continue
            if (peerId == config.userId) continue
            hasRemoteUsers = true
            handleUserJoined(peerId)
        }
        if (hasRemoteUsers && session?.isReady() == true) {
            Timber.i("[SFU] room-state recibido con peers y sesión SFU lista: re-anunciando cf-session")
            announceOurSession()
        }
    }

    private fun handleUserJoined(userId: String) {
        if (userId == config.userId) return
        val sfu = session
        if (sfu?.isReady() == true) {
            Timber.i("[SFU] user-joined ($userId) recibido con sesión SFU lista: re-anunciando cf-session")
            announceOurSession()
        } else {
            Timber.i("[SFU] user-joined ($userId) recibido antes de que sesión SFU esté lista: encolando en pendingPeerAnnouncements")
            if (!pendingPeerAnnouncements.contains(userId)) {
                pendingPeerAnnouncements.add(userId)
            }
        }
    }

    private fun announceOurSession() {
        val mySessionId = session?.sessionId ?: return
        sendSignal(
            SfuSignalingMessage(
                type = "cf-session",
                from = config.userId,
                data = buildJsonObject {
                    put("sessionId", mySessionId)
                    put("userType", config.userType)
                },
            )
        )
    }

    private fun handleUserLeft(userId: String) {
        if (userId == config.userId) return
        Timber.i("[SFU] Peer remoto salió (user-left): userId=$userId")
        userIdToSessionId.remove(userId)
        pendingRemoteSessionIds.removeAll { it.second == userId }
        pendingPeerAnnouncements.removeAll { it == userId }
        forgetRemotePeer(userId)
        if (_connectionState.value == ConnectionState.CONNECTED) {
            Timber.i("[SFU] Peer remoto abandonó la sala durante llamada activa -> DISCONNECTED")
            setConnectionState(ConnectionState.DISCONNECTED)
        }
    }

    private fun handleRemoteSessionAnnounced(message: SfuSignalingMessage) {
        val data = message.data ?: return
        val remoteSessionId = data["sessionId"]?.jsonPrimitive?.contentOrNull ?: return
        val remoteUserId = message.from ?: return
        val previousSessionId = userIdToSessionId[remoteUserId]

        val sfu = session
        val isReady = sfu?.isReady() == true

        if (previousSessionId == remoteSessionId && !remoteSubscribeNoTracks.contains(remoteUserId)) {
            if (!isReady) {
                if (!pendingRemoteSessionIds.any { it.second == remoteUserId && it.first == remoteSessionId }) {
                    pendingRemoteSessionIds.add(remoteSessionId to remoteUserId)
                    Timber.i("[SFU] Sesión remota idéntica pero SFU no lista; encolando en pendingRemoteSessionIds (user=$remoteUserId, session=$remoteSessionId)")
                }
            }
            return
        }

        if (previousSessionId != null && previousSessionId != remoteSessionId) {
            Timber.i("[SFU] Peer $remoteUserId re-anunció con nueva sesión ($previousSessionId -> $remoteSessionId); olvidando estado previo")
            forgetRemotePeer(remoteUserId)
        }

        userIdToSessionId[remoteUserId] = remoteSessionId
        Timber.i("[SFU] Sesión remota anunciada: user=$remoteUserId, session=$remoteSessionId, sfuReady=$isReady")

        if (isReady) {
            subscribeToSession(remoteUserId, remoteSessionId)
        } else {
            pendingRemoteSessionIds.removeAll { it.second == remoteUserId }
            pendingRemoteSessionIds.add(remoteSessionId to remoteUserId)
            Timber.i("[SFU] Sesión remota encolada en pendingRemoteSessionIds (user=$remoteUserId, session=$remoteSessionId)")
        }
    }

    private fun handleChatMessage(message: SfuSignalingMessage) {
        val payload = message.data?.get("message") ?: return
        val msg = runCatching { json.decodeFromJsonElement(ChatMessage.serializer(), payload) }
            .getOrNull() ?: return
        if (msg.senderId == config.userId) return
        _chatMessages.tryEmit(msg)
    }

    // -- SFU session --

    private fun launchSfuSession() {
        val roomId = activeRoomId ?: return
        session = CloudflareCallsSession(
            api = SupabaseCloudflareCallsApi(supabaseClient, json, roomId) {
                guestTokenProvider(roomId)
            },
            factory = peerConnectionFactory,
            scope = scope,
            iceServers = currentIceServers,
            onTrack = { event -> handleRemoteTrack(event) },
            onConnectionStateChange = { state ->
                Timber.i("[SFU] PeerConnection State: $state")
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        setConnectionState(ConnectionState.CONNECTED)
                    }
                    PeerConnection.PeerConnectionState.FAILED -> {
                        Timber.w("[SFU] Conexión SFU fallida")
                        setConnectionState(ConnectionState.FAILED)
                    }
                    PeerConnection.PeerConnectionState.DISCONNECTED -> {
                        setConnectionState(ConnectionState.RECONNECTING)
                    }
                    else -> {}
                }
            },
            onError = { err ->
                SecureLog.warn("[SFU] Session error", err)
                (err as? CloudflareCallsApiException)?.let(onAuthorizationError)
            },
        )

        scope.launch {
            try {
                val sfu = session ?: return@launch
                sfu.connect(
                    localAudio = localAudioTrack?.takeIf { it.enabled() },
                    localVideo = localVideoTrackInternal?.takeIf { it.enabled() },
                )
                setConnectionState(ConnectionState.CONNECTED)
                announceOurSession()

                val pending = pendingRemoteSessionIds.toList()
                pendingRemoteSessionIds.clear()
                Timber.i("[SFU] Drenando ${pending.size} sesiones remotas pendientes tras conectar SFU...")
                for ((remoteSessionId, remoteUserId) in pending) {
                    subscribeToSession(remoteUserId, remoteSessionId)
                }

                for ((remoteUserId, remoteSessionId) in userIdToSessionId) {
                    if (!pending.any { it.second == remoteUserId }) {
                        Timber.i("[SFU] Drenando sesión remota de userIdToSessionId: user=$remoteUserId, session=$remoteSessionId")
                        subscribeToSession(remoteUserId, remoteSessionId)
                    }
                }

                val deferredPeers = pendingPeerAnnouncements.toList()
                pendingPeerAnnouncements.clear()
                if (deferredPeers.isNotEmpty()) {
                    Timber.i("[SFU] Re-anunciando cf-session para ${deferredPeers.size} peers diferidos: $deferredPeers")
                    announceOurSession()
                }
            } catch (err: Throwable) {
                Timber.w(err, "[SFU] Session connect failed (stack trace follows)")
                SecureLog.warn("[SFU] Session connect failed", err)
                (err as? CloudflareCallsApiException)?.let(onAuthorizationError)
                setConnectionState(ConnectionState.FAILED)
            }
        }
    }

    private fun scheduleRemoteResubscribe(userId: String, remoteSessionId: String) {
        if (_connectionState.value == ConnectionState.DISCONNECTED ||
            _connectionState.value == ConnectionState.FAILED
        ) return
        if (resubscribeJobs[userId]?.isActive == true) return

        val attempt = (resubscribeAttempts[userId] ?: 0) + 1
        if (attempt > REMOTE_RESUBSCRIBE_MAX_ATTEMPTS) {
            remoteSubscribeNoTracks.remove(userId)
            resubscribeAttempts.remove(userId)
            resubscribeJobs.remove(userId)
            SecureLog.warn("[SFU] Se agotaron los reintentos ($REMOTE_RESUBSCRIBE_MAX_ATTEMPTS) para peer $userId (session $remoteSessionId)")
            return
        }

        resubscribeAttempts[userId] = attempt
        val delayMs = REMOTE_RESUBSCRIBE_BACKOFF_MS * attempt
        SecureLog.info("[SFU] Re-suscribiendo a $userId en ${delayMs}ms (intento $attempt/$REMOTE_RESUBSCRIBE_MAX_ATTEMPTS)...")

        val job = scope.launch {
            delay(delayMs)
            resubscribeJobs.remove(userId)
            val sfu = session
            if (sfu?.isReady() == true) {
                subscribeToSession(userId, remoteSessionId)
            } else {
                SecureLog.warn("[SFU] Reintento de suscripción a $userId postergado: sesión SFU no está ready")
                scheduleRemoteResubscribe(userId, remoteSessionId)
            }
        }
        resubscribeJobs[userId] = job
    }

    private fun subscribeToSession(userId: String, remoteSessionId: String) {
        if (userIdToSessionId[userId] != remoteSessionId) return
        val sfu = session ?: return

        resubscribeJobs.remove(userId)?.cancel()
        activeSubscribeJobs.remove(userId)?.cancel()

        val job = scope.launch {
            try {
                if (userIdToSessionId[userId] != remoteSessionId) return@launch
                val result = sfu.subscribeToSession(remoteSessionId) { mid, _ ->
                    midOwner[mid] = userId
                }
                if (userIdToSessionId[userId] != remoteSessionId) return@launch
                val pulled = result.tracks
                for (entry in pulled) {
                    entry.mid?.let { midOwner[it] = userId }
                }

                if (pulled.isEmpty() || result.errorTracks.isNotEmpty()) {
                    remoteSubscribeNoTracks.add(userId)
                    val localSess = session?.sessionId ?: "none"
                    val sfuReadyNow = userIdToSessionId[userId] == remoteSessionId
                    SecureLog.warn("[SFU] Subscribe a $userId: remoteSessionId=$remoteSessionId, myLocalSession=$localSess, peerAnnounced=$sfuReadyNow, pulled=${pulled.size}, errors=${result.errorTracks}, tracks=${result.tracks}. Programando reintento...")
                    if (userIdToSessionId[userId] == remoteSessionId) {
                        scheduleRemoteResubscribe(userId, remoteSessionId)
                    }
                } else {
                    remoteSubscribeNoTracks.remove(userId)
                    resubscribeAttempts.remove(userId)
                    resubscribeJobs.remove(userId)?.cancel()
                    Timber.i("[SFU] Suscripción a $userId completada con éxito: ${pulled.size} tracks recibidos, mids=${result.tracks.mapNotNull { it.mid }}")
                    for (entry in result.tracks) {
                        Timber.i("[SFU] Suscripción exitosa: userId=$userId, location=${entry.location}, mid=${entry.mid}, trackName=${entry.trackName}")
                    }
                }
                userIdToSessionId[userId] = remoteSessionId
                emitChatReady()
            } catch (err: Throwable) {
                if (err is kotlinx.coroutines.CancellationException) throw err
                remoteSubscribeNoTracks.add(userId)
                SecureLog.warn("[SFU] Subscribe al peer $userId falló con excepción. Programando reintento...", err)
                if (userIdToSessionId[userId] == remoteSessionId) {
                    scheduleRemoteResubscribe(userId, remoteSessionId)
                }
            } finally {
                activeSubscribeJobs.remove(userId)
            }
        }
        activeSubscribeJobs[userId] = job
    }

    private fun forgetRemotePeer(userId: String) {
        resubscribeJobs.remove(userId)?.cancel()
        activeSubscribeJobs.remove(userId)?.cancel()
        resubscribeAttempts.remove(userId)
        midOwner.entries.removeAll { it.value == userId }
        userIdToSessionId.remove(userId)
        remoteSubscribeNoTracks.remove(userId)
        pendingRemoteSessionIds.removeAll { it.second == userId }
        pendingPeerAnnouncements.removeAll { it == userId }
        clearRemoteVideoForPeer(userId)
        emitChatReady()
    }

    private fun handleRemoteTrack(event: CloudflareCallsSession.RemoteTrackEvent) {
        val mid = event.mid
        var ownerId = mid?.let { midOwner[it] }
        if (ownerId == null && userIdToSessionId.isNotEmpty()) {
            ownerId = userIdToSessionId.keys.first()
            if (mid != null) {
                midOwner[mid] = ownerId
            }
            Timber.i("[SFU] Fallback asignó mid=$mid al peer=$ownerId (total peers=${userIdToSessionId.size})")
        }
        if (ownerId == null) {
            SecureLog.warn("[SFU] No se pudo determinar el owner para track mid=$mid (peers=${userIdToSessionId.keys})")
            return
        }

        when (event.kind) {
            MediaStreamTrack.VIDEO_TRACK_KIND -> {
                val video = event.videoTrack ?: return
                remoteVideoOwnerId = ownerId
                _remoteVideoTrack.value = video
                Timber.i("[SFU] Remote video track received (mid=$mid, user=$ownerId)")
            }
            else -> {
                event.audioTrack?.setEnabled(true)
                Timber.i("[SFU] Remote audio track (mid=$mid, user=$ownerId, present=${event.audioTrack != null})")
            }
        }
    }

    private fun emitChatReady() {
        _chatReady.value = userIdToSessionId.isNotEmpty()
    }

    private fun clearRemoteVideoForPeer(peerUserId: String) {
        if (remoteVideoOwnerId == peerUserId || userIdToSessionId.isEmpty()) {
            _remoteVideoTrack.value = null
            remoteVideoOwnerId = null
        }
    }

    // -- Quality monitoring --

    private fun startQualityMonitor() {
        if (qualityJob?.isActive == true) return
        qualityJob = scope.launch {
            while (isActive) {
                collectQualityMetrics()
                delay(QUALITY_POLL_INTERVAL_MS)
            }
        }
    }

    private fun stopQualityMonitor() {
        qualityJob?.cancel()
        qualityJob = null
        qualityMonitor.reset()
        autoDegradeService.reset()
        _isAutoDegradedToAudio.value = false
    }

    private fun collectQualityMetrics() {
        if (_connectionState.value != ConnectionState.CONNECTED) return
        val pc = session?.peerConnection() ?: return
        if (pc.connectionState() == PeerConnection.PeerConnectionState.CLOSED) return

        val single = qualityMonitor.collectForPeer("sfu", pc)
        val metrics = single?.let { listOf(it) } ?: emptyList()
        val overall = qualityMonitor.getOverallLevel(metrics)
        adaptCaptureQuality(overall)
        if (userIdToSessionId.isNotEmpty() && _remoteVideoTrack.value != null) {
            autoDegradeService.update(overall)
        }

        _qualitySummary.value = StreamQualitySummary(
            roomId = config.roomId,
            overallLevel = overall,
            peers = metrics,
        )
    }

    // -- Connection state --

    private fun setConnectionState(state: ConnectionState) {
        if (_connectionState.value == state) return
        Timber.i("[SFU] State: ${_connectionState.value} -> $state")
        _connectionState.value = state

        if (state == ConnectionState.CONNECTED) {
            startQualityMonitor()
        } else {
            stopQualityMonitor()
            _qualitySummary.value = StreamQualitySummary(
                config.roomId, StreamQualityLevel.UNKNOWN, emptyList()
            )
        }
    }

    private fun cleanup() {
        stopQualityMonitor()

        session?.let { sfuSession ->
            scope.launch { sfuSession.close() }
        }
        session = null
        midOwner.clear()
        userIdToSessionId.clear()
        pendingRemoteSessionIds.clear()
        pendingPeerAnnouncements.clear()
        resubscribeJobs.values.forEach { it.cancel() }
        resubscribeJobs.clear()
        activeSubscribeJobs.values.forEach { it.cancel() }
        activeSubscribeJobs.clear()
        resubscribeAttempts.clear()
        _chatReady.value = false
        _remoteVideoTrack.value = null
        remoteVideoOwnerId = null
        autoDegradeService.reset()
        _isAutoDegradedToAudio.value = false

        stopLocalMedia()
    }

    companion object {
        private const val QUALITY_POLL_INTERVAL_MS = 5000L
        private const val REMOTE_RESUBSCRIBE_MAX_ATTEMPTS = 8
        private const val REMOTE_RESUBSCRIBE_BACKOFF_MS = 1500L
    }
}