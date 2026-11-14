package com.autamedica.android.service

import com.autamedica.android.domain.model.NotificationType
import com.autamedica.android.domain.model.PushPayload
import com.autamedica.android.domain.repository.NotificationRepository
import com.autamedica.android.di.IoDispatcher
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Receives FCM push messages from the Supabase `send-push-notification` Edge Function.
 *
 * Data payload format expected from backend:
 * ```json
 * {
 *   "type": "APPOINTMENT_NEW",
 *   "title": "Nuevo turno confirmado",
 *   "body": "Tu consulta con Dr. García es el 5 de marzo a las 10:00",
 *   "appointment_id": "uuid",
 *   "chat_room_id": "uuid",
 *   "prescription_id": "uuid",
 *   "deep_link": "/appointments/uuid"
 * }
 * ```
 */
@AndroidEntryPoint
class PushNotificationService : FirebaseMessagingService() {

    @Inject
    lateinit var notificationRepository: NotificationRepository

    @Inject
    @IoDispatcher
    lateinit var ioDispatcher: CoroutineDispatcher

    private lateinit var serviceScope: CoroutineScope

    override fun onCreate() {
        super.onCreate()
        serviceScope = CoroutineScope(SupervisorJob() + ioDispatcher)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Timber.d("[FCM] New token received")
        serviceScope.launch {
            notificationRepository.registerFcmToken(token)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Timber.d("[FCM] Message received: type=${message.data["type"]}")

        val payload = parsePayload(message)
        when (payload.type) {
            NotificationType.CALL_STARTED,
            NotificationType.PATIENT_CONNECTED,
            NotificationType.INCOMING_CALL -> {
                Timber.i("[FCM] High-priority incoming call notification: ${payload.type}")
                IncomingCallNotificationManager.showIncomingCall(this, payload)
            }
            NotificationType.PHARMACY_DISPATCH_INCOMING -> {
                Timber.i("[FCM] High-priority on-demand dispatch notification: ${payload.type}")
                IncomingCallNotificationManager.showDispatchIncoming(this, payload)
            }
            else -> {
                NotificationHelper.show(this, payload)
            }
        }
    }

    internal fun parsePayload(message: RemoteMessage): PushPayload {
        val data = message.data
        val notification = message.notification

        val rawType = data["type"] ?: data["event"] ?: data["notification_type"]
        val parsedType = NotificationType.fromString(rawType)

        val patientName = data["patient_name"]?.takeIf { it.isNotBlank() }
        val doctorName = if (parsedType == NotificationType.PHARMACY_DISPATCH_INCOMING ||
            rawType?.equals("pharmacy_dispatch_incoming", ignoreCase = true) == true
        ) {
            patientName ?: data["caller_name"] ?: "Paciente de Guardia"
        } else {
            data["doctor_name"] ?: data["caller_name"]
        }
        val doctorAvatarUrl = data["doctor_avatar_url"] ?: data["caller_avatar_url"]
        val appointmentId = data["appointment_id"] ?: data["request_id"]
        val roomId = data["room_id"] ?: data["cloudflare_room_id"]

        return PushPayload(
            type = parsedType,
            title = data["title"] ?: notification?.title ?: "AutaMedica",
            body = data["body"] ?: notification?.body ?: "",
            appointmentId = appointmentId,
            callId = data["call_id"],
            roomId = roomId,
            chatRoomId = data["chat_room_id"],
            prescriptionId = data["prescription_id"],
            senderId = data["sender_id"],
            deepLink = data["deep_link"],
            rawType = rawType,
            doctorName = doctorName,
            doctorAvatarUrl = doctorAvatarUrl,
            offerId = data["offer_id"],
        )
    }
}
