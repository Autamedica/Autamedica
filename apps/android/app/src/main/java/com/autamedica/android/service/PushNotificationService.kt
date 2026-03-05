package com.autamedica.android.service

import com.autamedica.android.domain.model.NotificationType
import com.autamedica.android.domain.model.PushPayload
import com.autamedica.android.domain.repository.NotificationRepository
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

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
        NotificationHelper.show(this, payload)
    }

    private fun parsePayload(message: RemoteMessage): PushPayload {
        val data = message.data
        val notification = message.notification

        return PushPayload(
            type = NotificationType.fromString(data["type"]),
            title = data["title"] ?: notification?.title ?: "AutaMedica",
            body = data["body"] ?: notification?.body ?: "",
            appointmentId = data["appointment_id"],
            chatRoomId = data["chat_room_id"],
            prescriptionId = data["prescription_id"],
            senderId = data["sender_id"],
            deepLink = data["deep_link"],
        )
    }
}
