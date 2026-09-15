package com.autamedica.android.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import com.autamedica.android.MainActivity
import com.autamedica.android.R
import com.autamedica.android.domain.model.NotificationType
import com.autamedica.android.domain.model.PushPayload
import com.autamedica.android.navigation.NotificationRouteResolver

/**
 * Centralizes notification channel creation and notification building.
 * Extracted from services to keep them thin.
 */
object NotificationHelper {

    private const val GROUP_KEY = "com.autamedica.android.NOTIFICATIONS"

    private data class ChannelDef(
        val id: String,
        val name: String,
        val description: String,
        val importance: Int,
    )

    private val channels = listOf(
        ChannelDef(
            id = "autamedica_appointments",
            name = "Turnos y consultas",
            description = "Notificaciones de nuevos turnos, recordatorios y cancelaciones",
            importance = NotificationManager.IMPORTANCE_HIGH,
        ),
        ChannelDef(
            id = IncomingCallNotificationManager.CHANNEL_ID,
            name = "Llamadas entrantes",
            description = "Llamadas y videollamadas entrantes con timbre y pantalla completa",
            importance = NotificationManager.IMPORTANCE_HIGH,
        ),
        ChannelDef(
            id = "autamedica_calls",
            name = "Videollamadas",
            description = "Avisos cuando un paciente o doctor se conecta a la consulta",
            importance = NotificationManager.IMPORTANCE_HIGH,
        ),
        ChannelDef(
            id = "autamedica_messages",
            name = "Mensajes",
            description = "Mensajes de chat entre doctor y paciente",
            importance = NotificationManager.IMPORTANCE_DEFAULT,
        ),
        ChannelDef(
            id = "autamedica_prescriptions",
            name = "Recetas",
            description = "Notificaciones de recetas digitales emitidas",
            importance = NotificationManager.IMPORTANCE_DEFAULT,
        ),
        ChannelDef(
            id = "autamedica_general",
            name = "General",
            description = "Notificaciones generales de AutaMedica",
            importance = NotificationManager.IMPORTANCE_DEFAULT,
        ),
    )

    /**
     * Create all notification channels. Safe to call multiple times (idempotent).
     * Must be called at app startup (Application.onCreate).
     */
    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        channels.forEach { def ->
            val channel = NotificationChannel(def.id, def.name, def.importance).apply {
                description = def.description
                if (def.id == IncomingCallNotificationManager.CHANNEL_ID) {
                    val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                    val audioAttrs = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    setSound(ringtoneUri, audioAttrs)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 1000, 1000, 1000, 1000, 1000)
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    setBypassDnd(true)
                } else if (def.importance >= NotificationManager.IMPORTANCE_HIGH) {
                    val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                    val audioAttrs = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    setSound(soundUri, audioAttrs)
                    enableVibration(true)
                }
            }
            manager.createNotificationChannel(channel)
        }
    }

    /**
     * Build and show a notification for the given [PushPayload].
     */
    fun show(context: Context, payload: PushPayload) {
        if (payload.type == NotificationType.CALL_STARTED ||
            payload.type == NotificationType.PATIENT_CONNECTED ||
            payload.type == NotificationType.INCOMING_CALL
        ) {
            IncomingCallNotificationManager.showIncomingCall(context, payload)
            return
        }

        createChannels(context)
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val contentIntent = buildContentIntent(context, payload)

        val builder = NotificationCompat.Builder(context, payload.type.channelId)
            .setSmallIcon(R.drawable.ic_stat_autamedica)
            .setLargeIcon(
                BitmapFactory.decodeResource(context.resources, R.drawable.ic_notification_large)
            )
            .setColor(Color.parseColor("#0EA5E9"))
            .setContentTitle(payload.title)
            .setContentText(payload.body)
            .setAutoCancel(true)
            .setGroup(GROUP_KEY)
            .setContentIntent(contentIntent)
            .setPriority(
                if (payload.type == NotificationType.APPOINTMENT_NEW ||
                    payload.type == NotificationType.PATIENT_CONNECTED ||
                    payload.type == NotificationType.CALL_STARTED
                ) NotificationCompat.PRIORITY_HIGH
                else NotificationCompat.PRIORITY_DEFAULT,
            )

        // Category hint for system
        when (payload.type) {
            NotificationType.PATIENT_CONNECTED,
            NotificationType.CALL_STARTED -> builder.setCategory(NotificationCompat.CATEGORY_CALL)
            NotificationType.MESSAGE_NEW -> builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
            NotificationType.APPOINTMENT_REMINDER -> builder.setCategory(NotificationCompat.CATEGORY_REMINDER)
            else -> builder.setCategory(NotificationCompat.CATEGORY_EVENT)
        }

        val notificationId = (payload.appointmentId ?: payload.chatRoomId ?: payload.type.name)
            .hashCode()

        timber.log.Timber.d("[Notifications] Showing system notification id=$notificationId channel=${payload.type.channelId} title=${payload.title}")
        manager.notify(notificationId, builder.build())
    }

    private fun buildContentIntent(context: Context, payload: PushPayload): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            // Pass extras so MainActivity can deep-link internally
            payload.appointmentId?.let {
                putExtra(NotificationRouteResolver.EXTRA_APPOINTMENT_ID, it)
            }
            payload.chatRoomId?.let {
                putExtra(NotificationRouteResolver.EXTRA_CHAT_ROOM_ID, it)
            }
            payload.prescriptionId?.let {
                putExtra(NotificationRouteResolver.EXTRA_PRESCRIPTION_ID, it)
            }
            payload.deepLink?.let {
                putExtra(NotificationRouteResolver.EXTRA_DEEP_LINK, it)
            }
            val notifType = payload.rawType ?: payload.type.name
            putExtra(NotificationRouteResolver.EXTRA_NOTIFICATION_TYPE, notifType)
            putExtra(NotificationRouteResolver.EXTRA_EVENT, notifType)
        }
        return PendingIntent.getActivity(
            context,
            payload.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }
}
