package com.autamedica.android.presentation.videocall.webrtc

import android.content.Context
import com.autamedica.android.data.model.ClientSignalingMessage
import com.autamedica.android.data.model.IceCandidatePayload
import com.autamedica.android.data.model.JoinData
import com.autamedica.android.data.model.SdpPayload
import com.autamedica.android.data.model.ServerSignalingMessage
import com.autamedica.android.data.remote.SignalingConnectionState
import com.autamedica.android.data.remote.SignalingWebSocket
import com.autamedica.android.domain.model.ChatMessage
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.StreamQualityLevel
import com.autamedica.android.domain.model.StreamQualityMetrics
import com.autamedica.android.domain.model.StreamQualitySummary
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
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters
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
    private val signalingWebSocket: SignalingWebSocket,
    private val scope: CoroutineScope,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    data class Config(
        val signalingUrl: String = SIGNALING_URL,
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

    // -- Internal state --

    private lateinit var config: Config
    private val peers = mutableMapOf<String, PeerState>()
    private var localAudioTrack: AudioTrack? = null
    private var localVideoTrackInternal: VideoTrack? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var qualityJob: Job? = null
    private val qualityMonitor = QualityMonitor()

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
            signalingWebSocket.messages.collect { message ->
                handleSignalingMessage(message)
            }
        }

        scope.launch {
            signalingWebSocket.connectionState.collect { state ->
                when (state) {
                    SignalingConnectionState.CONNECTED -> {
                        signalingWebSocket.send(
                            ClientSignalingMessage.Join(
                                from = config.userId,
                                data = JoinData(userType = config.userType),
                            )
                        )
                    }
                    SignalingConnectionState.FAILED -> {
                        setConnectionState(ConnectionState.FAILED)
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

    fun connect(roomId: String? = null) {
        val state = _connectionState.value
        if (state == ConnectionState.CONNECTING || state == ConnectionState.CONNECTED) return

        setConnectionState(ConnectionState.CONNECTING)
        val finalRoomId = roomId ?: config.roomId
        signalingWebSocket.connect(finalRoomId)
    }

    fun disconnect() {
        Timber.i("[WebRTC] Disconnect requested")
        signalingWebSocket.send(ClientSignalingMessage.Leave)
        signalingWebSocket.disconnect()
        setConnectionState(ConnectionState.DISCONNECTED)
        cleanup()
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
                    Timber.i("[WebRTC] User in room: ${user.id}")
                }
                setConnectionState(ConnectionState.CONNECTED)
            }

            is ServerSignalingMessage.UserJoined -> {
                Timber.i("[WebRTC] User joined: ${message.from}")
                ensurePeerConnection(message.from)
            }

            is ServerSignalingMessage.UserLeft -> {
                Timber.i("[WebRTC] User left: ${message.from}")
                val peerState = peers.remove(message.from)
                peerState?.dataChannel?.close()
                peerState?.pc?.close()
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
        Timber.i("[WebRTC] Creating peer connection for $userId (polite=$isPolite)")

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
        val existingIds = pc.senders.mapNotNull { it.track()?.id() }.toSet()

        localAudioTrack?.let { track ->
            if (track.id() !in existingIds) {
                pc.addTrack(track, listOf("stream0"))
            }
        }

        localVideoTrackInternal?.let { track ->
            if (track.id() !in existingIds) {
                val sender = pc.addTrack(track, listOf("stream0"))
                // Max bitrate 1.5 Mbps, 30fps
                val params = sender.parameters
                if (params.encodings.isEmpty()) {
                    params.encodings.add(RtpParameters.Encoding(null, true, null))
                }
                params.encodings.firstOrNull()?.let { encoding ->
                    encoding.maxBitrateBps = 1_500_000
                    encoding.maxFramerate = 30
                }
                sender.parameters = params
            }
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
            Timber.w("[WebRTC] Ignoring offer from $userId (impolite, collision)")
            return
        }

        val remoteSdp = SessionDescription(SessionDescription.Type.OFFER, sdpPayload.sdp)

        if (offerCollision) {
            Timber.i("[WebRTC] Offer collision, rolling back for $userId")
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
                                signalingWebSocket.send(
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
                Timber.e("[WebRTC] Failed setting remote answer from $userId: $error")
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
            Timber.d("[WebRTC] Buffering ICE candidate for $userId")
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
                Timber.i("[WebRTC] DataChannel state: ${channel.state()} with $remoteUserId")
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
                    Timber.w(e, "[WebRTC] Invalid chat payload")
                }
            }
        })

        emitChatReady()
    }

    private fun emitChatReady() {
        val ready = peers.values.any { it.dataChannel?.state() == DataChannel.State.OPEN }
        _chatReady.value = ready
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
    }

    private fun collectQualityMetrics() {
        if (_connectionState.value != ConnectionState.CONNECTED) return

        val peerMetrics = mutableListOf<StreamQualityMetrics>()

        for ((userId, peerState) in peers) {
            if (peerState.pc.connectionState() == PeerConnection.PeerConnectionState.CLOSED) continue
            val metrics = qualityMonitor.collectForPeer(userId, peerState.pc)
            if (metrics != null) peerMetrics.add(metrics)
        }

        _qualitySummary.value = StreamQualitySummary(
            roomId = config.roomId,
            overallLevel = qualityMonitor.getOverallLevel(peerMetrics),
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
            signalingWebSocket.send(
                ClientSignalingMessage.IceCandidate(to = userId, data = payload)
            )
        }

        override fun onAddStream(stream: MediaStream) {
            val videoTrack = stream.videoTracks.firstOrNull()
            if (videoTrack != null) {
                _remoteVideoTrack.value = videoTrack
                Timber.i("[WebRTC] Remote video track received from $userId")
            }
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState) {
            Timber.d("[WebRTC] Signaling state: $state for $userId")
        }

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            Timber.i("[WebRTC] ICE connection: $state for $userId")
            when (state) {
                PeerConnection.IceConnectionState.FAILED -> {
                    Timber.w("[WebRTC] ICE failed, restarting for $userId")
                    peers[userId]?.let { peerState ->
                        peerState.pc.restartIce()
                        // restartIce() sets a flag; onRenegotiationNeeded will fire
                        // and create a new offer with iceRestart=true in SDP
                    }
                }
                PeerConnection.IceConnectionState.DISCONNECTED -> {
                    // Transient disconnection (e.g. WiFi→4G handoff)
                    // WebRTC will auto-recover via ICE; if not, FAILED fires next
                    Timber.w("[WebRTC] ICE disconnected for $userId, waiting for recovery...")
                }
                else -> {}
            }
        }

        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
            Timber.i("[WebRTC] Connection: $state for $userId")
            when (state) {
                PeerConnection.PeerConnectionState.FAILED -> {
                    // Don't remove peer — ICE restart is in progress via onIceConnectionChange.
                    // If restartIce() succeeds, onRenegotiationNeeded creates new offer.
                    // The peer only gets removed on CLOSED (terminal state).
                    Timber.w("[WebRTC] PeerConnection FAILED for $userId, ICE restart in progress")
                }
                PeerConnection.PeerConnectionState.CLOSED -> {
                    peers.remove(userId)
                    qualityMonitor.removePeer(userId)
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
                                    signalingWebSocket.send(
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
                    Timber.e(e, "[WebRTC] Negotiation needed error")
                }
            }
        }

        override fun onDataChannel(channel: DataChannel) {
            attachDataChannel(userId, channel)
        }
    }

    companion object {
        private const val SIGNALING_URL =
            "wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling"
        const val SIGNALING_URL_HTTP =
            "wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling"
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
