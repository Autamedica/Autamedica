package com.autamedica.android.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
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

    @Inject
    lateinit var pharmacyDispatchRepository: PharmacyDispatchRepository

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
                // Silence immediately, then let the server verify that this offer
                // belongs to the authenticated clinician before advancing the queue.
                IncomingCallNotificationManager.dismissDispatchAlert(context)
                val offerId = intent.getStringExtra(
                    IncomingCallNotificationManager.EXTRA_DISPATCH_OFFER_ID,
                ).orEmpty()
                if (offerId.isBlank()) {
                    // Older/legacy FCM payloads may lack offer_id. Never guess an offer
                    // from a request ID; the server-side decline requires the exact offer.
                    Timber.w("[CallActionReceiver] Dispatch alert had no offer ID; dismissed locally")
                    return
                }

                val pendingResult = goAsync()
                CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                    try {
                        pharmacyDispatchRepository.declinePharmacyOffer(offerId)
                            .onSuccess { declined ->
                                if (declined) {
                                    Timber.i("[CallActionReceiver] Pharmacy offer declined and queue advanced")
                                } else {
                                    Timber.w("[CallActionReceiver] Pharmacy offer was no longer active or not owned")
                                }
                            }
                            .onFailure {
                                Timber.e(it, "[CallActionReceiver] Server did not confirm pharmacy offer refusal")
                            }
                    } catch (e: Exception) {
                        Timber.e(e, "[CallActionReceiver] Failed declining pharmacy dispatch offer")
                    } finally {
                        pendingResult.finish()
                    }
                }
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
