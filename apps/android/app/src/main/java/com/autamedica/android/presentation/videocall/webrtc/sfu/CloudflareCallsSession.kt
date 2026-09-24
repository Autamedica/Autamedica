package com.autamedica.android.presentation.videocall.webrtc.sfu

import android.util.Log
import com.autamedica.android.logging.SecureLog
import timber.log.Timber
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
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
import org.webrtc.VideoTrack
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Port Kotlin de packages/telemedicine/src/cloudflare-calls/session.ts.
 *
 * Gestiona la conexión WebRTC de UN peer con el SFU de Cloudflare Calls:
 * publica los tracks locales (audio0/video0) y suscribe los tracks remotos de
 * cada peer remoto presente en la sala.
 *
 * El SFU provee sus candidatos ICE dentro del SDP, por lo que no se configuran
 * ICE servers externos en la PeerConnection.
 */
class CloudflareCallsSession(
    private val api: CloudflareCallsApi,
    private val factory: PeerConnectionFactory,
    private val scope: CoroutineScope,
    private val iceServers: List<PeerConnection.IceServer> = emptyList(),
    private val onTrack: (RemoteTrackEvent) -> Unit,
    private val onConnectionStateChange: (PeerConnection.PeerConnectionState) -> Unit,
    private val onError: (Throwable) -> Unit,
) {

    data class RemoteTrackEvent(
        val kind: String,
        val videoTrack: VideoTrack?,
        val audioTrack: AudioTrack?,
        val mid: String?,
    )

    data class TrackEntry(
        val location: String,
        val trackName: String,
        val mid: String? = null,
        val sessionId: String? = null,
    )

    data class SubscriptionResult(
        val tracks: List<TrackEntry>,
        val errorTracks: List<String> = emptyList(),
    )

    var sessionId: String? = null
        private set

    /**
     * True solo cuando connect() completó (sessions/new respondido, SDP remoto
     * aplicado y tracks/new inicial enviado). Gatea subscribeToSession para no
     * competir con la negociación inicial.
     */
    private var ready = false

    /** Marcado FIRST en close() para ignorar un subscribeToSession cuya carrera quedó en vuelo. */
    private var closed = false

    private var pc: PeerConnection? = null
    private var localVideoSender: RtpSender? = null
    private var localAudioSender: RtpSender? = null
    private val negotiationMutex = Mutex()
    private var gatherSignal: CompletableDeferred<Unit>? = null
    private var connectionSignal: CompletableDeferred<Unit>? = null
    @Volatile private var hasSrflxCandidate = false
    @Volatile private var hasHostCandidate = false

    /** Invocados antes que onTrack para propagar mid → userId antes del handler de app de forma concurrente y segura. */
    private val trackMidListeners = java.util.concurrent.CopyOnWriteArrayList<(mid: String, kind: String) -> Unit>()

    fun isReady(): Boolean = ready && !closed && pc != null && sessionId != null

    /** Dentro del paquete, para el monitor de calidad. */
    internal fun peerConnection(): PeerConnection? = pc

    suspend fun connect(localAudio: AudioTrack?, localVideo: VideoTrack?): String {
        val effectiveIceServers = if (iceServers.isNotEmpty()) {
            iceServers
        } else {
            listOf(
                PeerConnection.IceServer.builder("stun:stun.cloudflare.com:3478").createIceServer(),
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            )
        }
        val rtcConfig = PeerConnection.RTCConfiguration(effectiveIceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
            tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.ENABLED
            iceTransportsType = PeerConnection.IceTransportsType.ALL
        }
        SecureLog.info("[SFU] Creating PeerConnection with ${effectiveIceServers.size} ICE servers: ${effectiveIceServers.map { it.urls }}")
        val newPc = factory.createPeerConnection(rtcConfig, pcObserver)
            ?: throw IllegalStateException("[SFU] No se pudo crear PeerConnection")
        pc = newPc

        val streamIds = listOf("media-stream-0")

        localVideoSender = if (localVideo != null) {
            newPc.addTransceiver(
                localVideo,
                RtpTransceiver.RtpTransceiverInit(
                    RtpTransceiver.RtpTransceiverDirection.SEND_ONLY,
                    streamIds,
                ),
            ).sender
        } else {
            newPc.addTransceiver(
                MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
                RtpTransceiver.RtpTransceiverInit(
                    RtpTransceiver.RtpTransceiverDirection.SEND_ONLY,
                    streamIds,
                ),
            ).sender
        }

        localAudioSender = if (localAudio != null) {
            newPc.addTransceiver(
                localAudio,
                RtpTransceiver.RtpTransceiverInit(
                    RtpTransceiver.RtpTransceiverDirection.SEND_ONLY,
                    streamIds,
                ),
            ).sender
        } else {
            newPc.addTransceiver(
                MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
                RtpTransceiver.RtpTransceiverInit(
                    RtpTransceiver.RtpTransceiverDirection.SEND_ONLY,
                    streamIds,
                ),
            ).sender
        }

        hasSrflxCandidate = false
        hasHostCandidate = false
        val offer = newPc.createOfferSdp()
        newPc.applyLocalSdp(offer)
        awaitIceGatheringComplete(timeoutMs = 300L)

        val sdp = newPc.localDescription?.description.orEmpty()
        val newSession = api.call(
            method = "POST",
            path = "sessions/new",
            body = jsonObjectOf(
                "sessionDescription" to jsonObjectOf("type" to "offer", "sdp" to sdp),
            ),
        ).asSessionResponse()
        this.sessionId = newSession.sessionId

        val remoteSdp = newSession.sessionDescription
        if (remoteSdp != null) {
            newPc.applyRemoteSdp(remoteSdp)
        } else {
            val err = IllegalStateException(
                "[SFU] sessions/new sin sessionDescription en la respuesta"
            )
            onError(err)
            throw err
        }

        waitForMediaConnection()

        val transceivers = newPc.getTransceivers()
        val localTracks = transceivers
            .filter { it.direction == RtpTransceiver.RtpTransceiverDirection.SEND_ONLY }
            .mapNotNull { t ->
                val mid = t.mid ?: return@mapNotNull null
                val senderTrack: MediaStreamTrack = t.sender.track() ?: return@mapNotNull null
                val kind = when (t.mediaType) {
                    MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO -> "video"
                    MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO -> "audio"
                    else -> senderTrack.kind()
                }
                if (senderTrack.id().isBlank()) {
                    SecureLog.warn("[SFU] Transceiver mid=$mid con sender.track sin id real; usando trackName=${kind}0 de todas formas")
                }
                TrackEntry(location = "local", mid = mid, trackName = "${kind}0")
            }
        Timber.i("[SFU] Local tracks total count to register (session $sessionId): ${localTracks.size}")
        for (t in transceivers) {
            if (t.direction != RtpTransceiver.RtpTransceiverDirection.SEND_ONLY) continue
            val mid = t.mid ?: continue
            val senderTrack = t.sender.track()
            val viaMediaType = when (t.mediaType) {
                MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO -> "video"
                MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO -> "audio"
                else -> "unknown"
            }
            val kind = senderTrack?.kind() ?: viaMediaType
            Timber.i("[SFU] Local track: location=local, mid=$mid, trackName=${kind}0, senderTrackId=${senderTrack?.id() ?: "null"}, kind=${senderTrack?.kind() ?: "null"}")
        }
        Timber.i("[SFU] Local tracks to register in Cloudflare (session $sessionId): $localTracks")

        if (localTracks.isNotEmpty()) {
            enqueueNegotiation {
                waitForStableSignaling()
                var result: NewTracksResponse? = null
                val maxAttempts = 3
                for (attempt in 0 until maxAttempts) {
                    try {
                        val rawResult = api.call(
                            method = "POST",
                            path = "sessions/$sessionId/tracks/new",
                            body = jsonObjectOf("tracks" to encodeTrackList(localTracks)),
                        ).asNewTracksResponse()
                        result = rawResult
                        break
                    } catch (e: CloudflareCallsApiException) {
                        if (e.httpStatus == 425 && attempt < maxAttempts - 1) {
                            SecureLog.info("[SFU] PeerConnection connecting to SFU, retrying local tracks/new in ${(attempt + 1) * 250}ms...")
                            delay((attempt + 1) * 250L)
                            continue
                        }
                        throw e
                    }
                }
                if (result != null) {
                    SecureLog.info("[SFU] tracks/new response: renegotiation=${result.requiresImmediateRenegotiation}")
                    if (result.requiresImmediateRenegotiation && result.sessionDescription != null) {
                        renegotiate(result.sessionDescription)
                    }
                }
            }
        }

        // Configure RtpSender parameters after tracks are set up
        localVideoSender?.let { sender ->
            runCatching { sender.parameters }.onSuccess { params ->
                if (params != null) {
                    params.degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_RESOLUTION
                    if (params.encodings.isEmpty()) {
                        params.encodings.add(RtpParameters.Encoding(null, true, null))
                    }
                    params.encodings.firstOrNull()?.let { encoding ->
                        encoding.maxBitrateBps = 3_000_000
                        encoding.maxFramerate = 30
                    }
                    runCatching { sender.parameters = params }
                        .onFailure { Timber.d(it, "[SFU] sender.parameters set failed") }
                }
            }.onFailure { Timber.d(it, "[SFU] sender.parameters get failed") }
        }

        ready = true
        startStatsLoop()
        return newSession.sessionId
    }

    private var statsJob: kotlinx.coroutines.Job? = null

    private fun startStatsLoop() {
        statsJob?.cancel()
        statsJob = scope.launch {
            while (isActive && pc != null) {
                pc?.getStats { report ->
                    var vBytesSent = 0L
                    var vPacketsSent = 0L
                    var vFrames = 0L
                    var aBytesSent = 0L
                    var aPacketsSent = 0L
                    var qLimitationReason = "none"
                    var cBytesSent = 0L
                    var cBytesRecv = 0L
                    var rtt = 0.0

                    for (stat in report.statsMap.values) {
                        if (stat.type == "outbound-rtp") {
                            val kind = stat.members["kind"]?.toString()
                            val bytes = (stat.members["bytesSent"] as? Number)?.toLong() ?: (stat.members["bytesSent"] as? java.math.BigInteger)?.toLong() ?: 0L
                            val packets = (stat.members["packetsSent"] as? Number)?.toLong() ?: (stat.members["packetsSent"] as? java.math.BigInteger)?.toLong() ?: 0L
                            
                            if (kind == "video") {
                                vBytesSent = bytes
                                vPacketsSent = packets
                                vFrames = (stat.members["framesEncoded"] as? Number)?.toLong() ?: (stat.members["framesEncoded"] as? java.math.BigInteger)?.toLong() ?: 0L
                                qLimitationReason = stat.members["qualityLimitationReason"]?.toString() ?: "none"
                            } else if (kind == "audio") {
                                aBytesSent = bytes
                                aPacketsSent = packets
                            }
                        } else if (stat.type == "candidate-pair" && stat.members["state"] == "succeeded" && stat.members["nominated"] == true) {
                            cBytesSent = (stat.members["bytesSent"] as? Number)?.toLong() ?: (stat.members["bytesSent"] as? java.math.BigInteger)?.toLong() ?: 0L
                            cBytesRecv = (stat.members["bytesReceived"] as? Number)?.toLong() ?: (stat.members["bytesReceived"] as? java.math.BigInteger)?.toLong() ?: 0L
                            rtt = (stat.members["currentRoundTripTime"] as? Number)?.toDouble() ?: 0.0
                        }
                    }
                    SecureLog.info("[SFU-STATS] outbound video bytesSent=$vBytesSent, packetsSent=$vPacketsSent, framesEncoded=$vFrames, qLimit=$qLimitationReason | audio bytesSent=$aBytesSent, packetsSent=$aPacketsSent | cp bytesSent=$cBytesSent, bytesReceived=$cBytesRecv, rtt=$rtt")
                }
                delay(3000)
            }
        }
    }

    suspend fun pullRemoteTrack(
        trackName: String,
        remoteSessionId: String,
        maxAttempts: Int = 4,
        onTrackMid: ((mid: String, kind: String) -> Unit)? = null,
    ): SubscriptionResult {
        if (closed) return SubscriptionResult(emptyList())
        if (!isReady()) {
            val err = IllegalStateException(
                "[SFU] No conectado aún (ready=$ready, hasPc=${pc != null}, hasSession=${sessionId != null})"
            )
            onError(err)
            throw err
        }

        val remoteTracks = listOf(
            TrackEntry(location = "remote", trackName = trackName, sessionId = remoteSessionId)
        )

        val pcRef = pc ?: throw IllegalStateException("[SFU] Sin PeerConnection")
        val priorMids = pcRef.getTransceivers().mapNotNull { it.mid }.toHashSet()

        val listener: ((mid: String, kind: String) -> Unit)? = onTrackMid?.let { handler ->
            { mid, kind -> handler(mid, kind) }
        }
        if (listener != null) {
            trackMidListeners.add(listener)
        }

        val pulled = mutableListOf<TrackEntry>()
        var errorTracks = emptyList<String>()

        try {
            var attemptsUsed = 0
            for (attempt in 0 until maxAttempts) {
                if (closed || !isReady()) break
                attemptsUsed++

                var result: NewTracksResponse? = null
                var shouldRetry = false
                val retryDelayMs = (attempt + 1) * 200L

                enqueueNegotiation {
                    waitForStableSignaling()
                    if (closed || !isReady()) return@enqueueNegotiation

                    try {
                        val rawResult = api.call(
                            method = "POST",
                            path = "sessions/$sessionId/tracks/new",
                            body = jsonObjectOf("tracks" to encodeTrackList(remoteTracks)),
                        ).asNewTracksResponse()

                        val hasNotFoundError = rawResult.errorTracks.any { it.contains("not_found_track_error") }
                        if (hasNotFoundError && attempt < maxAttempts - 1) {
                            SecureLog.info("[SFU] Remote track $trackName not ready on SFU yet (attempt ${attempt + 1}/$maxAttempts). Will retry in ${retryDelayMs}ms...")
                            shouldRetry = true
                            return@enqueueNegotiation
                        }
                        result = rawResult
                    } catch (e: CloudflareCallsApiException) {
                        if ((e.httpStatus == 425 || e.details.contains("not_found_track_error")) && attempt < maxAttempts - 1) {
                            SecureLog.info("[SFU] SFU session not ready for track $trackName (${e.httpStatus}), will retry in ${retryDelayMs}ms...")
                            shouldRetry = true
                            return@enqueueNegotiation
                        }
                        throw e
                    }

                    val currentResult = result ?: return@enqueueNegotiation
                    errorTracks = currentResult.errorTracks
                    if (currentResult.errorTracks.isNotEmpty()) {
                        SecureLog.warn("[SFU] Cloudflare reportó track $trackName no disponible aún: ${currentResult.errorTracks}")
                    }

                    if (currentResult.requiresImmediateRenegotiation && currentResult.sessionDescription != null) {
                        renegotiate(currentResult.sessionDescription)
                    }

                    val newTransceivers = pcRef.getTransceivers()
                        .filter { t ->
                            t.mid != null &&
                                t.mid !in priorMids &&
                                t.sender != localVideoSender &&
                                t.sender != localAudioSender
                        }

                    for (t in newTransceivers) {
                        val kind = t.receiver.track()?.kind() ?: when (t.mediaType) {
                            MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO -> "video"
                            else -> "audio"
                        }
                        Timber.i("[SFU] New remote transceiver ($trackName): mid=${t.mid}, direction=${t.direction}, kind=$kind, receiverTrackId=${t.receiver.track()?.id()}")
                        t.mid?.let { onTrackMid?.invoke(it, kind) }
                    }

                    pulled.addAll(
                        newTransceivers.mapNotNull { t ->
                            val midVal = t.mid ?: return@mapNotNull null
                            val kind = t.receiver.track()?.kind() ?: when (t.mediaType) {
                                MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO -> "video"
                                else -> "audio"
                            }
                            TrackEntry(
                                location = "remote",
                                trackName = "${kind}0",
                                mid = midVal,
                                sessionId = remoteSessionId,
                            )
                        }
                    )
                }

                if (shouldRetry && attempt < maxAttempts - 1) {
                    delay(retryDelayMs)
                    continue
                }

                if (result != null) break
            }
        } finally {
            if (listener != null) {
                trackMidListeners.remove(listener)
            }
        }

        SecureLog.info("[SFU] Pull $trackName result: pulled=${pulled.size}, mids=${pulled.mapNotNull { it.mid }}, errors=$errorTracks")
        return SubscriptionResult(tracks = pulled, errorTracks = errorTracks)
    }

    suspend fun subscribeToSession(
        remoteSessionId: String,
        onTrackMid: ((mid: String, kind: String) -> Unit)? = null,
    ): SubscriptionResult {
        if (closed) {
            onError(IllegalStateException("[SFU] subscribe después de close (ignorado)"))
            return SubscriptionResult(emptyList())
        }
        if (!isReady()) {
            val err = IllegalStateException(
                "[SFU] No conectado aún (ready=$ready, hasPc=${pc != null}, hasSession=${sessionId != null})"
            )
            onError(err)
            throw err
        }

        SecureLog.info("[SFU] Starting decoupled subscription for remoteSessionId=$remoteSessionId (immediate audio0, parallel video0)")

        // 1. Suscribir inmediatamente el canal de audio: voz bidireccional activa en < 2s
        val audioResult = pullRemoteTrack(
            trackName = "audio0",
            remoteSessionId = remoteSessionId,
            maxAttempts = 3,
            onTrackMid = onTrackMid,
        )

        // 2. Paralelamente suscribir video0 con reintentos sin retardar la comunicación de voz
        scope.launch {
            try {
                val videoResult = pullRemoteTrack(
                    trackName = "video0",
                    remoteSessionId = remoteSessionId,
                    maxAttempts = 6,
                    onTrackMid = onTrackMid,
                )
                Timber.i("[SFU] Parallel video0 subscription completed: pulled=${videoResult.tracks.size}, errors=${videoResult.errorTracks}")
            } catch (err: Throwable) {
                if (err is kotlinx.coroutines.CancellationException) throw err
                SecureLog.warn("[SFU] Parallel video0 subscription error", err)
            }
        }

        return audioResult
    }

    suspend fun replacePublishedVideoTrack(track: VideoTrack?) {
        runCatching { localVideoSender?.setTrack(track, false) }
    }

    suspend fun replacePublishedAudioTrack(track: AudioTrack?) {
        runCatching { localAudioSender?.setTrack(track, false) }
    }

    suspend fun close() {
        closed = true
        ready = false
        statsJob?.cancel()
        statsJob = null

        val pcRef = pc
        val sessionRef = sessionId
        if (pcRef != null && sessionRef != null) {
            val mids = pcRef.getTransceivers().mapNotNull { it.mid }
            if (mids.isNotEmpty()) {
                scope.launch {
                    runCatching {
                        api.call(
                            method = "PUT",
                            path = "sessions/$sessionRef/tracks/close",
                            body = jsonObjectOf(
                                "tracks" to jsonArrayOf(mids.map { jsonObjectOf("mid" to it) }),
                                "force" to true,
                            ),
                        )
                    }
                }
            }
        }

        pcRef?.close()
        pc = null
        sessionId = null
        localVideoSender = null
        localAudioSender = null
    }

    private suspend fun renegotiate(newOffer: CFSessionDescription) {
        val pcRef = pc ?: return
        pcRef.applyRemoteSdp(newOffer)
        val answer = pcRef.createAnswerSdp()
        pcRef.applyLocalSdp(answer)
        api.call(
            method = "PUT",
            path = "sessions/$sessionId/renegotiate",
            body = jsonObjectOf(
                "sessionDescription" to jsonObjectOf(
                    "type" to "answer",
                    "sdp" to answer.description,
                ),
            ),
        )
    }

    private suspend fun enqueueNegotiation(operation: suspend () -> Unit) {
        negotiationMutex.withLock { operation() }
    }

    private suspend fun waitForStableSignaling(timeoutMs: Long = 5_000L) {
        val pcRef = pc ?: return
        val result = withTimeoutOrNull(timeoutMs) {
            while (pcRef.signalingState() != PeerConnection.SignalingState.STABLE) {
                delay(50)
            }
        }
        if (result == null) {
            SecureLog.warn("[SFU] TIMEOUT waitForStableSignaling after ${timeoutMs}ms (state=${pcRef.signalingState()}, iceState=${pcRef.iceConnectionState()})")
        }
    }

    private suspend fun awaitIceGatheringComplete(timeoutMs: Long = 300L) {
        val pcRef = pc ?: return
        if (pcRef.iceGatheringState() == PeerConnection.IceGatheringState.COMPLETE || hasSrflxCandidate) {
            SecureLog.info("[SFU] ICE gathering already ready (complete or srflx candidate found)")
            return
        }

        val signal = CompletableDeferred<Unit>()
        gatherSignal = signal
        withTimeoutOrNull(timeoutMs) { signal.await() }
        gatherSignal = null
        SecureLog.info("[SFU] ICE gathering finished or timed out after max ${timeoutMs}ms (state=${pcRef.iceGatheringState()}, hasSrflx=$hasSrflxCandidate, hasHost=$hasHostCandidate)")
    }

    private suspend fun waitForMediaConnection(timeoutMs: Long = 2_000L) {
        val pcRef = pc ?: return
        if (pcRef.connectionState() == PeerConnection.PeerConnectionState.CONNECTED ||
            pcRef.iceConnectionState() == PeerConnection.IceConnectionState.CONNECTED ||
            pcRef.iceConnectionState() == PeerConnection.IceConnectionState.COMPLETED
        ) {
            SecureLog.info("[SFU] PeerConnection already connected (state=${pcRef.connectionState()}, iceState=${pcRef.iceConnectionState()})")
            return
        }

        val signal = CompletableDeferred<Unit>()
        connectionSignal = signal
        val connected = withTimeoutOrNull(timeoutMs) { signal.await() }
        if (connected == null) {
            SecureLog.warn("[SFU] TIMEOUT waitForMediaConnection after ${timeoutMs}ms (state=${pcRef.connectionState()}, iceState=${pcRef.iceConnectionState()})")
        } else {
            SecureLog.info("[SFU] Media connection established successfully (state=${pcRef.connectionState()}, iceState=${pcRef.iceConnectionState()})")
        }
    }

    private val pcObserver = object : PeerConnection.Observer {
        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {
            val receiverId = runCatching { receiver.id() }.getOrNull()
            val track = receiver.track()
            val trackId = runCatching { track?.id() }.getOrNull()
            val kind = track?.kind() ?: MediaStreamTrack.AUDIO_TRACK_KIND

            val mid = pc?.getTransceivers()?.firstOrNull { t ->
                val tReceiverId = runCatching { t.receiver.id() }.getOrNull()
                val tTrackId = runCatching { t.receiver.track()?.id() }.getOrNull()
                (receiverId != null && tReceiverId == receiverId) ||
                (trackId != null && tTrackId == trackId)
            }?.mid

            mid?.let { m ->
                for (handler in trackMidListeners) {
                    runCatching { handler(m, kind) }
                }
            }

            val videoTrack = track as? VideoTrack
            val audioTrack = track as? AudioTrack
            val transceiverCount = pc?.getTransceivers()?.size ?: 0
            val signalingState = pc?.signalingState()
            Timber.i("[SFU] onAddTrack: receiverId=$receiverId, trackId=$trackId, kind=$kind, mid=$mid, transceivers=$transceiverCount, signalingState=$signalingState, hasVideo=${videoTrack != null}, hasAudio=${audioTrack != null}")
            this@CloudflareCallsSession.onTrack(RemoteTrackEvent(kind = kind, videoTrack = videoTrack, audioTrack = audioTrack, mid = mid))
        }

        override fun onTrack(transceiver: RtpTransceiver) {
            val kind = transceiver.receiver.track()?.kind() ?: when (transceiver.mediaType) {
                MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO -> "video"
                MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO -> "audio"
                else -> "unknown"
            }
            Timber.i("[SFU] onTrack(transceiver): mid=${transceiver.mid}, direction=${transceiver.direction}, kind=$kind, receiverTrackId=${transceiver.receiver.track()?.id()}, signalingState=${pc?.signalingState()}")
        }

        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
            SecureLog.info("[SFU] PeerConnection State changed: $state")
            if (state == PeerConnection.PeerConnectionState.CONNECTED) {
                connectionSignal?.complete(Unit)
                connectionSignal = null
            }
            onConnectionStateChange(state)
        }

        override fun onIceCandidate(iceCandidate: IceCandidate) {
            val sdp = iceCandidate.sdp ?: ""
            if (sdp.contains("typ srflx")) {
                hasSrflxCandidate = true
                SecureLog.info("[SFU] Discovered srflx ICE candidate early; completing gatherSignal immediately")
                gatherSignal?.complete(Unit)
                gatherSignal = null
            } else if (sdp.contains("typ host")) {
                hasHostCandidate = true
            }
        }
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            SecureLog.info("[SFU] ICE Connection State changed: $state")
            if (state == PeerConnection.IceConnectionState.CONNECTED || state == PeerConnection.IceConnectionState.COMPLETED) {
                connectionSignal?.complete(Unit)
                connectionSignal = null
            }
        }
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onAddStream(stream: MediaStream) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onDataChannel(dataChannel: DataChannel) {}
        override fun onRenegotiationNeeded() {}

        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) {
                gatherSignal?.complete(Unit)
                gatherSignal = null
            }
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState) {}
    }
}

private data class CFSessionDescription(
    val type: String,
    val sdp: String,
)

private data class NewSessionResponse(
    val sessionId: String,
    val sessionDescription: CFSessionDescription?,
)

private data class NewTracksResponse(
    val requiresImmediateRenegotiation: Boolean,
    val sessionDescription: CFSessionDescription?,
    val errorTracks: List<String> = emptyList(),
)

/** Wrappers suspend de las callbacks SDP de org.webrtc. */
private suspend fun PeerConnection.createOfferSdp(): SessionDescription =
    suspendCancellableCoroutine { cont ->
        createOffer(object : SdpCreateObserver(cont) {
            override fun onCreateSuccess(sdp: SessionDescription) {
                cont.resume(sdp)
            }
        }, org.webrtc.MediaConstraints())
    }

private suspend fun PeerConnection.createAnswerSdp(): SessionDescription =
    suspendCancellableCoroutine { cont ->
        createAnswer(object : SdpCreateObserver(cont) {
            override fun onCreateSuccess(sdp: SessionDescription) {
                cont.resume(sdp)
            }
        }, org.webrtc.MediaConstraints())
    }

private suspend fun PeerConnection.applyLocalSdp(sdp: SessionDescription): Unit =
    suspendCancellableCoroutine { cont ->
        setLocalDescription(object : SdpSetObserver(cont) {
            override fun onSetSuccess() {
                cont.resume(Unit)
            }
        }, sdp)
    }

private suspend fun PeerConnection.applyRemoteSdp(sdp: CFSessionDescription): Unit =
    suspendCancellableCoroutine { cont ->
        setRemoteDescription(
            object : SdpSetObserver(cont) {
                override fun onSetSuccess() {
                    cont.resume(Unit)
                }
            },
            SessionDescription(
                if (sdp.type == "offer") SessionDescription.Type.OFFER else SessionDescription.Type.ANSWER,
                sdp.sdp,
            ),
        )
    }

private abstract class SdpCreateObserver(
    private val cont: kotlin.coroutines.Continuation<*>,
) : SdpObserver {
    final override fun onCreateFailure(error: String?) {
        Log.w("[SFU]", "SDP create failure: $error")
        cont.resumeWithException(RuntimeException("SDP create failure: $error"))
    }

    final override fun onSetFailure(error: String?) {
        Log.w("[SFU]", "SDP set failure: $error")
        cont.resumeWithException(RuntimeException("SDP set failure: $error"))
    }

    final override fun onSetSuccess() {}
}

private abstract class SdpSetObserver(
    private val cont: kotlin.coroutines.Continuation<*>,
) : SdpObserver {
    final override fun onCreateSuccess(sdp: SessionDescription) {}

    final override fun onCreateFailure(error: String?) {
        Log.w("[SFU]", "SDP create failure: $error")
        cont.resumeWithException(RuntimeException("SDP create failure: $error"))
    }

    final override fun onSetFailure(error: String?) {
        Log.w("[SFU]", "SDP set failure: $error")
        cont.resumeWithException(RuntimeException("SDP set failure: $error"))
    }
}

private fun jsonObjectOf(vararg pairs: Pair<String, Any?>): JsonObject =
    buildJsonObject {
        for ((key, value) in pairs) {
            when (value) {
                null -> {}
                is String -> put(key, value)
                is Boolean -> put(key, value)
                is Int -> put(key, value)
                is Long -> put(key, value)
                is Double -> put(key, value)
                is JsonElement -> put(key, value)
                else -> throw IllegalArgumentException("[SFU] Tipo no soportado para $key")
            }
        }
    }

private fun jsonArrayOf(items: List<JsonElement>): JsonArray = JsonArray(items)

private fun encodeTrackList(tracks: List<CloudflareCallsSession.TrackEntry>): JsonArray =
    jsonArrayOf(
        tracks.map { track ->
            buildJsonObject {
                put("location", track.location)
                put("trackName", track.trackName)
                track.mid?.let { put("mid", it) }
                track.sessionId?.let { put("sessionId", it) }
            }
        }
    )

private fun JsonElement.asSessionResponse(): NewSessionResponse {
    val obj = this.jsonObject
    val sessionId = obj["sessionId"]?.jsonPrimitive?.contentOrNull.orEmpty()
    val sd = obj["sessionDescription"]?.jsonObject
    val sessionDescription = sd?.let {
        CFSessionDescription(
            type = it["type"]?.jsonPrimitive?.contentOrNull ?: "answer",
            sdp = it["sdp"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }
    return NewSessionResponse(sessionId, sessionDescription)
}

private fun JsonElement.asNewTracksResponse(): NewTracksResponse {
    val obj = this.jsonObject
    val sd = obj["sessionDescription"]?.jsonObject
    val sessionDescription = sd?.let {
        CFSessionDescription(
            type = it["type"]?.jsonPrimitive?.contentOrNull ?: "offer",
            sdp = it["sdp"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }
    val requiresImmediateRenegotiation =
        obj["requiresImmediateRenegotiation"]?.jsonPrimitive?.booleanOrNull ?: false

    val errorTracks = mutableListOf<String>()
    val tracksArray = obj["tracks"]?.let { runCatching { it as? JsonArray }.getOrNull() }
    tracksArray?.forEach { el ->
        val trackObj = runCatching { el.jsonObject }.getOrNull() ?: return@forEach
        val errCode = trackObj["errorCode"]?.jsonPrimitive?.contentOrNull
        val tName = trackObj["trackName"]?.jsonPrimitive?.contentOrNull ?: "track"
        if (!errCode.isNullOrBlank()) {
            val desc = trackObj["errorDescription"]?.jsonPrimitive?.contentOrNull ?: errCode
            errorTracks.add("$tName ($errCode: $desc)")
        }
    }

    return NewTracksResponse(requiresImmediateRenegotiation, sessionDescription, errorTracks)
}