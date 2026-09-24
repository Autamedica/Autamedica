package com.autamedica.android.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.autamedica.android.domain.model.NotificationType
import com.autamedica.android.domain.model.PushPayload
import timber.log.Timber

/**
 * Debug BroadcastReceiver to test high-priority CallStyle and Dispatch notifications
 * directly on device via adb shell am broadcast.
 */
class DebugNotificationReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_TRIGGER_DISPATCH = "com.autamedica.android.TEST_DISPATCH_NOTIFICATION"
        const val ACTION_TRIGGER_CALL = "com.autamedica.android.TEST_CALL_NOTIFICATION"
        const val ACTION_CLEAR_ALL = "com.autamedica.android.CLEAR_ALL_NOTIFICATIONS"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_TRIGGER_DISPATCH -> {
                val patientName = intent.getStringExtra("patient_name") ?: "María González"
                val requestId = intent.getStringExtra("request_id") ?: "req_test_001"
                val payload = PushPayload(
                    type = NotificationType.PHARMACY_DISPATCH_INCOMING,
                    title = "Solicitud de atención inmediata",
                    body = "Paciente en espera de consulta",
                    doctorName = patientName,
                    appointmentId = requestId,
                )
                Timber.i("[DebugReceiver] Triggering dispatch notification for $patientName")
                IncomingCallNotificationManager.showDispatchIncoming(context, payload)
            }
            ACTION_TRIGGER_CALL -> {
                val callerName = intent.getStringExtra("caller_name") ?: "Dr. Eduardo Marques"
                val appointmentId = intent.getStringExtra("appointment_id") ?: "call_test_001"
                val payload = PushPayload(
                    type = NotificationType.INCOMING_CALL,
                    title = "Llamada entrante",
                    body = "Videoconsulta médica",
                    doctorName = callerName,
                    appointmentId = appointmentId,
                )
                Timber.i("[DebugReceiver] Triggering incoming call notification for $callerName")
                IncomingCallNotificationManager.showIncomingCall(context, payload)
            }
            ACTION_CLEAR_ALL -> {
                Timber.i("[DebugReceiver] Clearing all alert notifications")
                IncomingCallNotificationManager.dismissCall(context)
            }
        }
    }
}
