package com.autamedica.android.presentation.videocall.webrtc

import android.content.Context
import com.autamedica.android.domain.model.ChatMessage
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.domain.model.StreamQualityMetrics
import com.autamedica.android.domain.model.StreamQualitySummary
import com.autamedica.android.logging.SecureLog
import com.autamedica.android.domain.signaling.ClientSignalingMessage
import com.autamedica.android.domain.signaling.IceCandidatePayload
import com.autamedica.android.domain.signaling.JoinData
import com.autamedica.android.domain.signaling.SdpPayload
import com.autamedica.android.domain.signaling.ServerSignalingMessage
import com.autamedica.android.domain.signaling.SignalingClient
import com.autamedica.android.domain.signaling.SignalingConnectionState
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
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.encodeToJsonElement
import org.webrtc.AudioTrack
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters
import org.webrtc.RtpReceiver
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoTrack
import timber.log.Timber
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

/**
 * Native Kotlin port of packages/telemedicine/src/webrtc-client.ts.
 *
 * Key behaviors preserved:
 * - Perfect Negotiation: doctor=impolite, patient=polite
 * - ICE candidate buffering until remoteDescription is set
 * - Data channel chat: label "autamedica-chat", ordered=true
 * - Quality monitoring every 5s with worst-of scoring
 * - Video: max 1.5 Mbps, 30fps
 * - Audio: echo cancellation, noise suppression, auto gain control
 * - ICE restart on failure
 */
class WebRTCEngine(
    private val context: Context,
    private val peerConnectionFactory: PeerConnectionFactory,
    private val eglBase: EglBase,
    private val signalingClient: SignalingClient,
    private val scope: CoroutineScope,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    data class Config(
        val iceServers: List<PeerConnection.IceServer> = DEFAULT_ICE_SERVERS,
        val roomId: String = "default-room",
        val userId: String,
        val userType: String,
        val userName: String? = null,
    )

    // -- State flows (observed by ViewModel) --

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
            Timber.w("[WebRTC] Quality poor for 30s: auto-degrading to audio-only")
            _isAutoDegradedToAudio.value = true
            toggleVideo(false)
        },
        onRecover = {
            Timber.i("[WebRTC] Quality recovered for 15s")
            adaptCaptureFormat(lowPressure = false)
        },
    )

    // -- Internal state --

    lateinit var config: Config
    private val peers = mutableMapOf<String, PeerState>()
    private var localAudioTrack: AudioTrack? = null
    private var localVideoTrackInternal: VideoTrack? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var qualityJob: Job? = null
    private val qualityMonitor = QualityMonitor()
    private var remoteVideoOwnerId: String? = null

    // -- Peer state (mirrors PeerState from TS) --

    private data class PeerState(
        val pc: PeerConnection,
        val pendingIceCandidates: MutableList<IceCandidate> = mutableListOf(),
        var isMakingOffer: Boolean = false,
        var isSettingRemoteAnswerPending: Boolean = false,
        var ignoreOffer: Boolean = false,
        val isPolite: Boolean,
        var dataChannel: DataChannel? = null,
    )

    fun initialize(config: Config) {
        this.config = config

        scope.launch {
            signalingClient.messages.collect { message ->
                handleSignalingMessage(message)
            }
        }

        scope.launch {
            signalingClient.connectionState.collect { state ->
                when (state) {
                    SignalingConnectionState.CONNECTED -> {
                        signalingClient.send(
                            ClientSignalingMessage.Join(
                                from = config.userId,
                                data = JoinData(userType = config.userType),
                            )
                        )
                    }
                    SignalingConnectionState.FAILED -> {
                        setConnectionState(ConnectionState.FAILED)
                    }
                    SignalingConnectionState.RECONNECTING -> {
                        setConnectionState(ConnectionState.RECONNECTING)
                    }
                    SignalingConnectionState.DISCONNECTED -> {
                        if (_connectionState.value != ConnectionState.DISCONNECTED) {
                            setConnectionState(ConnectionState.DISCONNECTED)
                            cleanup()
                        }
                    }
                    SignalingConnectionState.CONNECTING -> {}
                }
            }
        }
    }

    fun connect(roomId: String? = null, signalingUrl: String? = null) {
        val state = _connectionState.value
        if (state == ConnectionState.CONNECTING || state == ConnectionState.CONNECTED
            || state == ConnectionState.RECONNECTING) return

        setConnectionState(ConnectionState.CONNECTING)
        val finalRoomId = roomId ?: config.roomId
        signalingClient.connect(finalRoomId, signalingUrl)
    }

    fun disconnect() {
        Timber.i("[WebRTC] Disconnect requested")
        signalingClient.send(ClientSignalingMessage.Leave)
        signalingClient.disconnect()
        setConnectionState(ConnectionState.DISCONNECTED)
        cleanup()
    }

    /**
     * Updates ICE servers on active peer connections and saves them to config.
     * Essential for mid-call TURN credential refresh and dynamic ICE provisioning.
     */
    fun updateIceServers(newServers: List<PeerConnection.IceServer>) {
        if (newServers.isEmpty()) return
        if (::config.isInitialized) {
            config = config.copy(iceServers = newServers)
        }
        peers.values.forEach { peerState ->
            val rtcConfig = PeerConnection.RTCConfiguration(newServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            }
            peerState.pc.setConfiguration(rtcConfig)
        }
        Timber.i("[WebRTC] Updated ICE servers on ${peers.size} peer connection(s) (${newServers.size} servers)")
    }

    // -- Media capture --

    fun startLocalMedia() {
        val videoSource = peerConnectionFactory.createVideoSource(false)
        surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)

        val enumerator = org.webrtc.Camera2Enumerator(context)
        val frontCamera = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            ?: enumerator.deviceNames.firstOrNull()

        if (frontCamera != null) {
            videoCapturer = enumerator.createCapturer(frontCamera, null) as? CameraVideoCapturer
            videoCapturer?.initialize(surfaceTextureHelper, context, videoSource.capturerObserver)
            videoCapturer?.startCapture(640, 480, 30)
        }

        localVideoTrackInternal = peerConnectionFactory.createVideoTrack("video0", videoSource)
        _localVideoTrack.value = localVideoTrackInternal

        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("echoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("noiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("autoGainControl", "true"))
        }
        val audioSource = peerConnectionFactory.createAudioSource(audioConstraints)
        localAudioTrack = peerConnectionFactory.createAudioTrack("audio0", audioSource)

        // Attach to existing peers
        for ((_, peerState) in peers) {
            attachLocalTracks(peerState.pc)
        }
    }

    fun stopLocalMedia() {
        videoCapturer?.stopCapture()
        videoCapturer?.dispose()
        videoCapturer = null
        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null
        localVideoTrackInternal?.dispose()
        localVideoTrackInternal = null
        localAudioTrack?.dispose()
        localAudioTrack = null
        _localVideoTrack.value = null
    }

    // -- Media controls --

    fun toggleVideo(enabled: Boolean? = null) {
        val track = localVideoTrackInternal ?: return
        val newState = enabled ?: !track.enabled()
        track.setEnabled(newState)
        _isVideoEnabled.value = newState
    }

    fun toggleAudio(enabled: Boolean? = null) {
        val track = localAudioTrack ?: return
        val newState = enabled ?: !track.enabled()
        track.setEnabled(newState)
        _isAudioEnabled.value = newState
    }

    fun switchCamera() {
        videoCapturer?.switchCamera(null)
    }

    fun adaptCaptureFormat(lowPressure: Boolean) {
        try {
            if (lowPressure) {
                videoCapturer?.changeCaptureFormat(320, 240, 15)
                Timber.d("[WebRTC] Adapted video capture format to 320x240@15fps under network pressure")
            } else {
                videoCapturer?.changeCaptureFormat(640, 480, 30)
                Timber.d("[WebRTC] Restored video capture format to 640x480@30fps")
            }
        } catch (e: Exception) {
            Timber.w(e, "[WebRTC] Failed to change capture format")
        }
    }

    fun reactivateVideoAfterAutoDegrade() {
        autoDegradeService.manualOverrideReset()
        _isAutoDegradedToAudio.value = false
        toggleVideo(true)
    }

    // -- Chat --

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

        val payload = json.encodeToString(ChatMessage.serializer(), msg)
        var delivered = false

        for ((_, peerState) in peers) {
            val channel = peerState.dataChannel ?: continue
            if (channel.state() != DataChannel.State.OPEN) continue

            val buffer = DataChannel.Buffer(
                ByteBuffer.wrap(payload.toByteArray(StandardCharsets.UTF_8)),
                false,
            )
            if (channel.send(buffer)) delivered = true
        }

        return delivered
    }

    // -- Signaling message handling --

    private fun handleSignalingMessage(message: ServerSignalingMessage) {
        Timber.d("[WebRTC] Signaling: ${message::class.simpleName}")

        when (message) {
            is ServerSignalingMessage.RoomState -> {
                for (user in message.data.users) {
                    Timber.i("[WebRTC] User present in room")
                }
                setConnectionState(ConnectionState.CONNECTED)
            }

            is ServerSignalingMessage.UserJoined -> {
                Timber.i("[WebRTC] Peer joined room")
                ensurePeerConnection(message.from)
            }

            is ServerSignalingMessage.UserLeft -> {
                Timber.i("[WebRTC] Peer left room")
                val peerState = peers.remove(message.from)
                peerState?.dataChannel?.close()
                peerState?.pc?.close()
                clearRemoteVideoForPeer(message.from)
                emitChatReady()
                qualityMonitor.removePeer(message.from)
            }

            is ServerSignalingMessage.Offer -> handleOffer(message.from, message.data)
            is ServerSignalingMessage.Answer -> handleAnswer(message.from, message.data)
            is ServerSignalingMessage.IceCandidate -> handleIceCandidate(message.from, message.data)
            is ServerSignalingMessage.Error -> {
                Timber.e("[WebRTC] Server error: ${message.data}")
            }
        }
    }

    private fun ensurePeerConnection(userId: String): PeerState {
        peers[userId]?.let { return it }

        val isPolite = config.userType != "doctor"
        Timber.i("[WebRTC] Creating peer connection (polite=$isPolite)")

        val rtcConfig = PeerConnection.RTCConfiguration(config.iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        val pc = peerConnectionFactory.createPeerConnection(
            rtcConfig,
            PeerConnectionObserver(userId),
        ) ?: throw IllegalStateException("Failed to create PeerConnection")

        val peerState = PeerState(pc = pc, isPolite = isPolite)

        attachLocalTracks(pc)
        peers[userId] = peerState

        // Data channel: only lower userId creates it
        if (config.userId < userId) {
            val channelInit = DataChannel.Init().apply { ordered = true }
            val channel = pc.createDataChannel(CHAT_CHANNEL_LABEL, channelInit)
            attachDataChannel(userId, channel)
        }

        emitChatReady()
        return peerState
    }

    private fun attachLocalTracks(pc: PeerConnection) {
        localAudioTrack?.let { track ->
            attachTrackToPeerConnection(pc, track, MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO)
        }

        localVideoTrackInternal?.let { track ->
            val sender = attachTrackToPeerConnection(pc, track, MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO)
            sender?.let { applyVideoEncodingParameters(it) }
        }
    }

    private fun attachTrackToPeerConnection(
        pc: PeerConnection,
        track: MediaStreamTrack,
        mediaType: MediaStreamTrack.MediaType,
    ): RtpSender? {
        // 1. Reusar transceiver existente en Unified Plan si ya fue negociado o creado
        val existingTransceiver = try {
            pc.transceivers.firstOrNull { it.mediaType == mediaType && !it.isStopped }
        } catch (e: Exception) {
            Timber.w(e, "[WebRTC] Failed inspecting transceivers")
            null
        }

        if (existingTransceiver != null) {
            val sender = existingTransceiver.sender
            if (sender.track()?.id() != track.id()) {
                sender.setTrack(track, false)
            }
            if (existingTransceiver.direction == RtpTransceiver.RtpTransceiverDirection.RECV_ONLY ||
                existingTransceiver.direction == RtpTransceiver.RtpTransceiverDirection.INACTIVE
            ) {
                existingTransceiver.direction = RtpTransceiver.RtpTransceiverDirection.SEND_RECV
            }
            return sender
        }

        // 2. Verificar si ya existe un sender con este track
        val existingSender = pc.senders.firstOrNull { it.track()?.id() == track.id() }
        if (existingSender != null) {
            return existingSender
        }

        // 3. Crear transceiver con dirección SEND_RECV (Unified Plan estándar)
        return try {
            val init = RtpTransceiver.RtpTransceiverInit(
                RtpTransceiver.RtpTransceiverDirection.SEND_RECV,
                listOf("stream0"),
            )
            val transceiver = pc.addTransceiver(track, init)
            transceiver.sender
        } catch (e: Exception) {
            Timber.w(e, "[WebRTC] addTransceiver failed, falling back to addTrack")
            pc.addTrack(track, listOf("stream0"))
        }
    }

    private fun applyVideoEncodingParameters(sender: RtpSender) {
        try {
            val params = sender.parameters
            if (params.encodings.isEmpty()) {
                params.encodings.add(RtpParameters.Encoding(null, true, null))
            }
            params.encodings.firstOrNull()?.let { encoding ->
                encoding.maxBitrateBps = 1_500_000
                encoding.maxFramerate = 30
            }
            sender.parameters = params
        } catch (e: Exception) {
            Timber.w(e, "[WebRTC] Failed setting video sender parameters")
        }
    }

    // -- SDP handling (Perfect Negotiation) --

    private fun handleOffer(userId: String, sdpJson: JsonElement) {
        val peerState = ensurePeerConnection(userId)
        val pc = peerState.pc
        val sdpPayload = json.decodeFromJsonElement(SdpPayload.serializer(), sdpJson)

        val offerCollision = peerState.isMakingOffer || pc.signalingState() != PeerConnection.SignalingState.STABLE

        peerState.ignoreOffer = !peerState.isPolite && offerCollision
        if (peerState.ignoreOffer) {
            Timber.w("[WebRTC] Ignoring offer (impolite, collision)")
            return
        }

        val remoteSdp = SessionDescription(SessionDescription.Type.OFFER, sdpPayload.sdp)

        if (offerCollision) {
            Timber.i("[WebRTC] Offer collision, rolling back")
            pc.setLocalDescription(NoOpSdpObserver())
        }

        pc.setRemoteDescription(object : SdpObserverAdapter() {
            override fun onSetSuccess() {
                attachLocalTracks(pc)
                pc.createAnswer(object : SdpObserverAdapter() {
                    override fun onCreateSuccess(sdp: SessionDescription) {
                        pc.setLocalDescription(object : SdpObserverAdapter() {
                            override fun onSetSuccess() {
                                val answerPayload: JsonElement = json.encodeToJsonElement(
                                    SdpPayload(type = "answer", sdp = sdp.description)
                                )
                                signalingClient.send(
                                    ClientSignalingMessage.Answer(to = userId, data = answerPayload)
                                )
                                flushPendingIceCandidates(peerState)
                                peerState.ignoreOffer = false
                            }
                        }, sdp)
                    }
                }, MediaConstraints())
            }
        }, remoteSdp)
    }

    private fun handleAnswer(userId: String, sdpJson: JsonElement) {
        val peerState = peers[userId] ?: return
        val sdpPayload = json.decodeFromJsonElement(SdpPayload.serializer(), sdpJson)
        val remoteSdp = SessionDescription(SessionDescription.Type.ANSWER, sdpPayload.sdp)

        peerState.isSettingRemoteAnswerPending = true
        peerState.pc.setRemoteDescription(object : SdpObserverAdapter() {
            override fun onSetSuccess() {
                peerState.isSettingRemoteAnswerPending = false
                peerState.ignoreOffer = false
                flushPendingIceCandidates(peerState)
            }

            override fun onSetFailure(error: String?) {
                peerState.isSettingRemoteAnswerPending = false
                Timber.e("[WebRTC] Failed setting remote answer: $error")
            }
        }, remoteSdp)
    }

    private fun handleIceCandidate(userId: String, candidateJson: JsonElement) {
        val peerState = ensurePeerConnection(userId)
        val payload = json.decodeFromJsonElement(IceCandidatePayload.serializer(), candidateJson)
        val candidate = IceCandidate(
            payload.sdpMid ?: "",
            payload.sdpMLineIndex ?: 0,
            payload.candidate ?: "",
        )

        if (peerState.pc.remoteDescription != null) {
            peerState.pc.addIceCandidate(candidate)
        } else {
            Timber.d("[WebRTC] Buffering ICE candidate")
            peerState.pendingIceCandidates.add(candidate)
        }
    }

    private fun flushPendingIceCandidates(peerState: PeerState) {
        if (peerState.pc.remoteDescription == null) return

        val pending = peerState.pendingIceCandidates.toList()
        peerState.pendingIceCandidates.clear()

        for (candidate in pending) {
            peerState.pc.addIceCandidate(candidate)
        }

        if (pending.isNotEmpty()) {
            Timber.i("[WebRTC] Flushed ${pending.size} buffered ICE candidates")
        }
    }

    // -- Data channel --

    private fun attachDataChannel(remoteUserId: String, channel: DataChannel) {
        val peerState = peers[remoteUserId] ?: return
        peerState.dataChannel = channel

        channel.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(previousAmount: Long) {}

            override fun onStateChange() {
                Timber.i("[WebRTC] DataChannel state: ${channel.state()}")
                if (channel.state() == DataChannel.State.CLOSED) {
                    if (peerState.dataChannel === channel) {
                        peerState.dataChannel = null
                    }
                }
                emitChatReady()
            }

            override fun onMessage(buffer: DataChannel.Buffer) {
                if (buffer.binary) return
                val data = StandardCharsets.UTF_8.decode(buffer.data).toString()
                try {
                    val msg = json.decodeFromString(ChatMessage.serializer(), data)
                    if (msg.senderId != config.userId) {
                        _chatMessages.tryEmit(msg)
                    }
                } catch (e: Exception) {
                    SecureLog.warn("[WebRTC] Invalid chat payload", e)
                }
            }
        })

        emitChatReady()
    }

    private fun emitChatReady() {
        val ready = peers.values.any { it.dataChannel?.state() == DataChannel.State.OPEN }
        _chatReady.value = ready
    }

    private fun clearRemoteVideoForPeer(peerUserId: String) {
        if (remoteVideoOwnerId == peerUserId || peers.isEmpty()) {
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

        val peerMetrics = mutableListOf<StreamQualityMetrics>()

        for ((userId, peerState) in peers) {
            if (peerState.pc.connectionState() == PeerConnection.PeerConnectionState.CLOSED) continue
            val metrics = qualityMonitor.collectForPeer(userId, peerState.pc)
            if (metrics != null) peerMetrics.add(metrics)
        }

        val overall = qualityMonitor.getOverallLevel(peerMetrics)
        if (overall == StreamQualityLevel.POOR || overall == StreamQualityLevel.FAIR) {
            adaptCaptureFormat(lowPressure = true)
        } else if (overall == StreamQualityLevel.GOOD || overall == StreamQualityLevel.EXCELLENT) {
            adaptCaptureFormat(lowPressure = false)
        }
        autoDegradeService.update(overall)

        _qualitySummary.value = StreamQualitySummary(
            roomId = config.roomId,
            overallLevel = overall,
            peers = peerMetrics,
        )
    }

    // -- Connection state --

    private fun setConnectionState(state: ConnectionState) {
        if (_connectionState.value == state) return
        Timber.i("[WebRTC] State: ${_connectionState.value} -> $state")
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

        for ((_, peerState) in peers) {
            peerState.dataChannel?.close()
            peerState.pc.close()
        }
        peers.clear()
        _chatReady.value = false
        _remoteVideoTrack.value = null
        remoteVideoOwnerId = null
        autoDegradeService.reset()
        _isAutoDegradedToAudio.value = false

        stopLocalMedia()
    }

    // -- PeerConnection.Observer --

    private inner class PeerConnectionObserver(
        private val userId: String,
    ) : PeerConnection.Observer {

        override fun onIceCandidate(candidate: IceCandidate) {
            val payload: JsonElement = json.encodeToJsonElement(
                IceCandidatePayload(
                    candidate = candidate.sdp,
                    sdpMLineIndex = candidate.sdpMLineIndex,
                    sdpMid = candidate.sdpMid,
                )
            )
            signalingClient.send(
                ClientSignalingMessage.IceCandidate(to = userId, data = payload)
            )
        }

        override fun onAddStream(stream: MediaStream) {
            val videoTrack = stream.videoTracks.firstOrNull()
            if (videoTrack != null) {
                remoteVideoOwnerId = userId
                _remoteVideoTrack.value = videoTrack
                Timber.i("[WebRTC] Remote video track received via onAddStream")
            }
        }

        override fun onTrack(transceiver: RtpTransceiver) {
            val track = transceiver.receiver?.track()
            if (track is VideoTrack) {
                remoteVideoOwnerId = userId
                _remoteVideoTrack.value = track
                Timber.i("[WebRTC] Remote video track received via onTrack (transceiver, Unified Plan)")
            } else if (transceiver.mediaType == MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO) {
                val videoTrack = transceiver.receiver?.track() as? VideoTrack
                if (videoTrack != null) {
                    remoteVideoOwnerId = userId
                    _remoteVideoTrack.value = videoTrack
                    Timber.i("[WebRTC] Remote video track received via onTrack mediaType fallback")
                }
            }
        }

        override fun onAddTrack(receiver: RtpReceiver, mediaStreams: Array<out MediaStream>) {
            val track = receiver.track()
            if (track is VideoTrack) {
                remoteVideoOwnerId = userId
                _remoteVideoTrack.value = track
                Timber.i("[WebRTC] Remote video track received via onAddTrack (Unified Plan)")
            }
        }

        override fun onRemoveTrack(receiver: RtpReceiver) {
            val track = receiver.track()
            if (track is VideoTrack && (_remoteVideoTrack.value == null || _remoteVideoTrack.value?.id() == track.id())) {
                clearRemoteVideoForPeer(userId)
                Timber.i("[WebRTC] Remote video track removed via onRemoveTrack")
            }
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState) {
            Timber.d("[WebRTC] Signaling state: $state")
        }

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            Timber.i("[WebRTC] ICE connection: $state")
            when (state) {
                PeerConnection.IceConnectionState.FAILED -> {
                    Timber.w("[WebRTC] ICE failed, restarting")
                    peers[userId]?.let { peerState ->
                        peerState.pc.restartIce()
                        // restartIce() sets a flag; onRenegotiationNeeded will fire
                        // and create a new offer with iceRestart=true in SDP
                    }
                }
                PeerConnection.IceConnectionState.DISCONNECTED -> {
                    // Transient disconnection (e.g. WiFi→4G handoff)
                    // WebRTC will auto-recover via ICE; if not, FAILED fires next
                    Timber.w("[WebRTC] ICE disconnected, waiting for recovery...")
                }
                else -> {}
            }
        }

        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
            Timber.i("[WebRTC] Connection: $state")
            when (state) {
                PeerConnection.PeerConnectionState.FAILED -> {
                    // Don't remove peer — ICE restart is in progress via onIceConnectionChange.
                    // If restartIce() succeeds, onRenegotiationNeeded creates new offer.
                    // The peer only gets removed on CLOSED (terminal state).
                    Timber.w("[WebRTC] PeerConnection FAILED, ICE restart in progress")
                }
                PeerConnection.PeerConnectionState.CLOSED -> {
                    peers.remove(userId)
                    qualityMonitor.removePeer(userId)
                    clearRemoteVideoForPeer(userId)
                    emitChatReady()
                }
                else -> {}
            }
        }

        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onRenegotiationNeeded() {
            val peerState = peers[userId] ?: return
            scope.launch {
                try {
                    peerState.isMakingOffer = true
                    peerState.pc.createOffer(object : SdpObserverAdapter() {
                        override fun onCreateSuccess(sdp: SessionDescription) {
                            peerState.pc.setLocalDescription(object : SdpObserverAdapter() {
                                override fun onSetSuccess() {
                                    val offerPayload: JsonElement = json.encodeToJsonElement(
                                        SdpPayload(type = "offer", sdp = sdp.description)
                                    )
                                    signalingClient.send(
                                        ClientSignalingMessage.Offer(to = userId, data = offerPayload)
                                    )
                                    peerState.isMakingOffer = false
                                }
                            }, sdp)
                        }

                        override fun onCreateFailure(error: String?) {
                            peerState.isMakingOffer = false
                            Timber.e("[WebRTC] Failed creating offer: $error")
                        }
                    }, MediaConstraints())
                } catch (e: Exception) {
                    peerState.isMakingOffer = false
                    SecureLog.error("[WebRTC] Negotiation needed error", e)
                }
            }
        }

        override fun onDataChannel(channel: DataChannel) {
            attachDataChannel(userId, channel)
        }
    }

    companion object {
        private const val CHAT_CHANNEL_LABEL = "autamedica-chat"
        private const val QUALITY_POLL_INTERVAL_MS = 5000L

        val DEFAULT_ICE_SERVERS = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun2.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun3.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun4.l.google.com:19302").createIceServer(),
        )
    }
}

// -- SDP observer helpers --

private open class SdpObserverAdapter : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {
        Timber.e("[WebRTC] SDP create failure: $error")
    }
    override fun onSetFailure(error: String?) {
        Timber.e("[WebRTC] SDP set failure: $error")
    }
}

private class NoOpSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {}
    override fun onSetFailure(error: String?) {}
}
