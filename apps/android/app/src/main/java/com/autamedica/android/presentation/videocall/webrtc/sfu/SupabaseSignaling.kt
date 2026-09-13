package com.autamedica.android.presentation.videocall.webrtc.sfu

import com.autamedica.android.logging.SecureLog
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.channel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

enum class SfuSignalingStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    FAILED,
}

interface SfuSignaling {
    val messages: SharedFlow<SfuSignalingMessage>
    val status: StateFlow<SfuSignalingStatus>
    fun send(message: SfuSignalingMessage)
    suspend fun open()
    fun close()
}

/**
 * Señalización SFU vía Supabase Realtime. Port de
 * packages/telemedicine/src/supabase-signaling.ts.
 *
 * - Broadcast: relay de los mensajes del plano de señalización (cf-session, chat...).
 * - Presence: descubrimiento de peers (reemplaza el room-state del servidor).
 *
 * Los mensajes enviados antes de la suscripción se bufferan y se liberan al
 * quedar SUBSCRIBED, evitando perder sessionIds durante la carrera del warmup.
 */
class SupabaseRealtimeSignaling(
    private val supabaseClient: SupabaseClient,
    private val json: Json,
    private val scope: CoroutineScope,
    private val roomId: String,
    private val userId: String,
    private val userType: String,
) : SfuSignaling {

    override val messages: SharedFlow<SfuSignalingMessage>
        get() = _messages
    private val _messages = MutableSharedFlow<SfuSignalingMessage>(extraBufferCapacity = 32)

    override val status: StateFlow<SfuSignalingStatus>
        get() = _status
    private val _status = MutableStateFlow(SfuSignalingStatus.DISCONNECTED)

    private var channel: RealtimeChannel? = null
    private val pending = mutableListOf<SfuSignalingMessage>()
    private val sendQueue = Channel<SfuSignalingMessage>(Channel.UNLIMITED)
    private var sendJob: Job? = null

    override fun send(message: SfuSignalingMessage) {
        when (message.type) {
            "join", "leave" -> return
        }
        SecureLog.info("[SFU-SIG] send() invocado: type=${message.type}, to=${message.to}, from=${message.from}, status=${_status.value}")
        if (channel == null || _status.value != SfuSignalingStatus.CONNECTED) {
            SecureLog.info("[SFU-SIG] Canal no conectado (status=${_status.value}), encolando en pending: type=${message.type}")
            pending.add(message)
            return
        }
        val queued = sendQueue.trySend(message).isSuccess
        if (!queued) {
            SecureLog.warn("[SFU-SIG] sendQueue no aceptó mensaje, guardando en pending: type=${message.type}")
            pending.add(message)
        }
    }

    override suspend fun open() {
        if (channel != null) {
            SecureLog.info("[SFU-SIG] open() ignorado: canal ya inicializado para sala $roomId")
            return
        }
        SecureLog.info("[SFU-SIG] Abriendo canal para sala $roomId (userId=$userId, userType=$userType)")
        _status.value = SfuSignalingStatus.CONNECTING

        val identity = buildJsonObject {
            put("userId", userId)
            put("userType", userType)
        }

        val rechannel = supabaseClient.channel("signaling:$roomId") {
            broadcast { receiveOwnBroadcasts = false }
            presence { key = userId }
        }
        channel = rechannel

        sendJob = scope.launch {
            sendQueue.consumeEach { message ->
                val ch = channel
                if (ch == null || _status.value == SfuSignalingStatus.DISCONNECTED || _status.value == SfuSignalingStatus.FAILED) {
                    SecureLog.warn("[SFU-SIG] Descartando mensaje en cola tipo=${message.type}: señalización inactiva")
                    return@consumeEach
                }
                if (ch.status.value != RealtimeChannel.Status.SUBSCRIBED) {
                    SecureLog.info("[SFU-SIG] Canal en estado ${ch.status.value}, esperando SUBSCRIBED para enviar mensaje tipo=${message.type}...")
                    val reachedSubscribed = withTimeoutOrNull(SUBSCRIBE_TIMEOUT_MS) {
                        ch.status.first { it == RealtimeChannel.Status.SUBSCRIBED }
                    }
                    if (reachedSubscribed == null) {
                        SecureLog.warn("[SFU-SIG] Timeout esperando SUBSCRIBED. Re-encolando mensaje tipo=${message.type} en pending")
                        pending.add(message)
                        return@consumeEach
                    }
                }
                val payload = json.encodeToJsonElement(
                    SfuSignalingMessage.serializer(),
                    message,
                ).jsonObject
                SecureLog.info("[SFU-SIG] Emitiendo broadcast signaling: type=${message.type}, to=${message.to}, from=${message.from}")
                runCatching {
                    ch.broadcast("signaling", payload)
                }.onSuccess {
                    SecureLog.info("[SFU-SIG] Broadcast emitido con éxito: type=${message.type}")
                }.onFailure { err ->
                    SecureLog.warn("[SFU-SIG] Error emitiendo broadcast tipo=${message.type}", err)
                }
            }
        }

        scope.launch {
            rechannel.broadcastFlow<JsonObject>("signaling").collect { raw ->
                val msg = runCatching {
                    json.decodeFromJsonElement(SfuSignalingMessage.serializer(), raw)
                }.onFailure { err ->
                    SecureLog.warn("[SFU-SIG] Error decodificando broadcast recibido", err)
                }.getOrNull() ?: return@collect

                if (msg.from == userId) return@collect
                if (msg.to != null && msg.to != userId) {
                    SecureLog.debug("[SFU-SIG] Mensaje broadcast ignorado (to=${msg.to} no coincide con userId=$userId)")
                    return@collect
                }
                SecureLog.info("[SFU-SIG] Broadcast recibido: type=${msg.type}, from=${msg.from}, to=${msg.to}")
                _messages.emit(msg)
            }
        }

        observePresence(rechannel)

        var attempt = 0
        while (attempt <= MAX_SUBSCRIBE_RETRIES) {
            SecureLog.info("[SFU-SIG] Suscribiendo al canal signaling:$roomId (intento $attempt/$MAX_SUBSCRIBE_RETRIES, blockUntilSubscribed=true)...")
            val subscribed = runCatching {
                withTimeoutOrNull(SUBSCRIBE_TIMEOUT_MS) {
                    rechannel.subscribe(blockUntilSubscribed = true)
                    rechannel.status.value == RealtimeChannel.Status.SUBSCRIBED
                }
            }.getOrElse { err ->
                SecureLog.warn("[SFU-SIG] Excepción al suscribir (intento $attempt)", err)
                null
            }

            if (subscribed == true) {
                SecureLog.info("[SFU-SIG] Canal conectado y suscrito exitosamente (status=${rechannel.status.value})")
                _status.value = SfuSignalingStatus.CONNECTED
                val trackResult = runCatching { rechannel.track(identity) }
                trackResult.onSuccess {
                    SecureLog.info("[SFU-SIG] Presencia local registrada (track) exitosamente: key=$userId, identity=$identity")
                }.onFailure { err ->
                    SecureLog.warn("[SFU-SIG] Error al registrar presencia local (track): key=$userId", err)
                }
                break
            } else {
                SecureLog.warn("[SFU-SIG] Suscripción no confirmada (subscribed=$subscribed, status=${rechannel.status.value})")
            }

            attempt++
            if (attempt > MAX_SUBSCRIBE_RETRIES) {
                _status.value = SfuSignalingStatus.FAILED
                SecureLog.error("[SFU-SIG] Fallo definitivo al suscribir canal signaling:$roomId tras $attempt intentos")
                throw IllegalStateException("Supabase signaling subscribe failed: $roomId")
            }
            delay(RETRY_DELAY_MS)
        }

        if (pending.isNotEmpty()) {
            val buffered = pending.toList()
            pending.clear()
            SecureLog.info("[SFU-SIG] Liberando ${buffered.size} mensajes pendientes a sendQueue tras suscribirse")
            buffered.forEach { sendQueue.trySend(it) }
        }
    }

    override fun close() {
        SecureLog.info("[SFU-SIG] Cerrando señalización para sala $roomId (userId=$userId)")
        _status.value = SfuSignalingStatus.DISCONNECTED
        sendQueue.close()
        sendJob?.cancel()
        sendJob = null
        val rechannel = channel ?: return
        channel = null
        pending.clear()
        scope.launch {
            runCatching {
                SecureLog.info("[SFU-SIG] Desregistrando presencia (untrack)...")
                rechannel.untrack()
            }
            runCatching {
                SecureLog.info("[SFU-SIG] Desuscribiendo canal (unsubscribe)...")
                rechannel.unsubscribe()
            }
        }
    }

    private fun observePresence(rechannel: RealtimeChannel) {
        scope.launch {
            var presenceSynced = false
            rechannel.presenceChangeFlow().collect { action ->
                val joins = action.joins.filterKeys { it != userId }
                val leaves = action.leaves.filterKeys { it != userId }
                SecureLog.info("[SFU-SIG] Evento de presencia: synced=$presenceSynced, joins=${joins.keys}, leaves=${leaves.keys}")

                if (!presenceSynced) {
                    presenceSynced = true
                    val users = joins.values.mapNotNull { presence ->
                        runCatching {
                            json.decodeFromJsonElement(SfuRoomUser.serializer(), presence.state)
                        }.getOrNull()
                    }.filter { !it.userId.isNullOrBlank() }
                        .map { it.toRoomUser() }

                    SecureLog.info("[SFU-SIG] Sincronización inicial de presencia: ${users.size} peers encontrados: ${users.map { "${it.id}(${it.userType})" }}")
                    if (users.isNotEmpty()) {
                        val payload = json.encodeToJsonElement(
                            ListSerializer(RoomUserData.serializer()),
                            users,
                        )
                        _messages.emit(
                            SfuSignalingMessage(
                                type = "room-state",
                                data = buildJsonObject { put("users", payload) },
                            )
                        )
                    }
                    return@collect
                }

                for ((_, presence) in joins) {
                    val user = runCatching {
                        json.decodeFromJsonElement(SfuRoomUser.serializer(), presence.state)
                    }.getOrNull() ?: continue
                    val peerId = user.userId ?: continue
                    if (peerId.isBlank()) continue
                    SecureLog.info("[SFU-SIG] Peer ingresó (user-joined): userId=$peerId, userType=${user.userType}")
                    _messages.emit(
                        SfuSignalingMessage(
                            type = "user-joined",
                            from = peerId,
                            data = buildJsonObject { put("userType", user.userType) },
                        )
                    )
                }
                for (peerId in leaves.keys) {
                    SecureLog.info("[SFU-SIG] Peer salió (user-left): userId=$peerId")
                    _messages.emit(SfuSignalingMessage(type = "user-left", from = peerId))
                }
            }
        }
    }

    companion object {
        private const val SUBSCRIBE_TIMEOUT_MS = 30_000L
        private const val MAX_SUBSCRIBE_RETRIES = 2
        private const val RETRY_DELAY_MS = 1_000L
    }
}