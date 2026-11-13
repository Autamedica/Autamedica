package com.autamedica.android.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.autamedica.android.domain.repository.TelemedicineRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Handles action broadcasts from notification buttons (ATENDER / RECHAZAR).
 */
@AndroidEntryPoint
class CallActionReceiver : BroadcastReceiver() {

    @Inject
    lateinit var telemedicineRepository: TelemedicineRepository

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val appointmentId = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_APPOINTMENT_ID).orEmpty()
        val callId = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_CALL_ID).orEmpty()
        val notificationId = intent.getIntExtra(IncomingCallNotificationManager.EXTRA_NOTIFICATION_ID, -1)

        // Use callId if available, fallback to appointmentId for backward compat
        val resolvedId = callId.ifBlank { appointmentId }

        Timber.d("[CallActionReceiver] onReceive: action=$action resolvedId=$resolvedId")

        when (action) {
            IncomingCallNotificationManager.ACTION_DECLINE_DISPATCH -> {
                // A dispatch refusal only dismisses this local alert. It must not
                // mutate a video-call appointment or expose patient details.
                IncomingCallNotificationManager.dismissDispatchAlert(context)
                Timber.i("[CallActionReceiver] Pharmacy dispatch alert dismissed by clinician")
            }

            IncomingCallNotificationManager.ACTION_ANSWER_CALL -> {
                // Silence ringtone — navigation to VideoCallScreen is handled by MainActivity
                IncomingCallNotificationManager.stopRingtone()
                if (resolvedId.isNotBlank()) {
                    val pendingResult = goAsync()
                    CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                        try {
                            telemedicineRepository.updateCallStatus(resolvedId, "accepted")
                            Timber.i("[CallActionReceiver] Call $resolvedId marked as accepted")
                        } catch (e: Exception) {
                            Timber.e(e, "[CallActionReceiver] Failed updating call status to accepted for $resolvedId")
                        } finally {
                            pendingResult.finish()
                        }
                    }
                }
            }

            IncomingCallNotificationManager.ACTION_DECLINE_CALL -> {
                IncomingCallNotificationManager.dismissCall(context, notificationId)
                if (resolvedId.isNotBlank()) {
                    val pendingResult = goAsync()
                    CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                        try {
                            telemedicineRepository.updateCallStatus(resolvedId, "declined")
                            Timber.i("[CallActionReceiver] Call $resolvedId marked as declined")
                        } catch (e: Exception) {
                            Timber.e(e, "[CallActionReceiver] Failed updating call status to declined for $resolvedId")
                        } finally {
                            pendingResult.finish()
                        }
                    }
                }
            }
        }
    }
}
