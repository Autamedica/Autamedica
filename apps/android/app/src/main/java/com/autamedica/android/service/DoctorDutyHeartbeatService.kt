package com.autamedica.android.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.autamedica.android.MainActivity
import com.autamedica.android.R
import com.autamedica.android.di.IoDispatcher
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.PharmacyDispatchRepository
import com.autamedica.android.logging.SecureLog
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Keeps the clinician's on-duty presence alive after the dashboard leaves the
 * foreground. High-priority FCM remains the wake-up path; this service is the
 * continuous-presence backup while the doctor explicitly stays on guard.
 */
@AndroidEntryPoint
class DoctorDutyHeartbeatService : Service() {

    @Inject lateinit var pharmacyDispatchRepository: PharmacyDispatchRepository
    @Inject lateinit var authRepository: AuthRepository
    @Inject @IoDispatcher lateinit var ioDispatcher: CoroutineDispatcher

    private var serviceScope: CoroutineScope? = null
    private var heartbeatJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        serviceScope = CoroutineScope(SupervisorJob() + ioDispatcher)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val doctorId = intent?.getStringExtra(EXTRA_DOCTOR_ID)
            ?: getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(KEY_DOCTOR_ID, null)

        if (doctorId.isNullOrBlank()) {
            stopSelf(startId)
            return START_NOT_STICKY
        }

        return try {
            val notification = buildNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }

            if (heartbeatJob?.isActive != true) {
                heartbeatJob = serviceScope?.launch {
                    while (isActive) {
                        if (authRepository.getCurrentUser() == null) {
                            SecureLog.info("[DoctorDuty] Session ended; stopping guard heartbeat service")
                            stopSelf()
                            break
                        }
                        pharmacyDispatchRepository.sendDoctorHeartbeat(doctorId)
                            .onFailure { error ->
                                SecureLog.warn("[DoctorDuty] Persistent heartbeat failed: ${error.message}")
                            }
                        delay(HEARTBEAT_INTERVAL_MS)
                    }
                }
            }
            START_STICKY
        } catch (error: Exception) {
            SecureLog.error("[DoctorDuty] Could not start foreground heartbeat service", error)
            stopSelf(startId)
            START_NOT_STICKY
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        heartbeatJob?.cancel()
        serviceScope?.cancel()
        heartbeatJob = null
        serviceScope = null
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.doctor_guard_notification_channel),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.doctor_guard_notification_text)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openDashboard = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.doctor_guard_notification_title))
            .setContentText(getString(R.string.doctor_guard_notification_text))
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openDashboard)
            .build()
    }

    companion object {
        const val CHANNEL_ID = "autamedica_doctor_guard"
        const val NOTIFICATION_ID = 3010
        const val EXTRA_DOCTOR_ID = "doctor_id"
        private const val PREFERENCES = "doctor_guard_service"
        private const val KEY_DOCTOR_ID = "doctor_id"
        private const val HEARTBEAT_INTERVAL_MS = 30_000L

        fun start(context: Context, doctorId: String): Result<Unit> = runCatching {
            require(doctorId.isNotBlank()) { "Doctor ID is required for persistent guard" }
            context.applicationContext
                .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_DOCTOR_ID, doctorId)
                .apply()
            val intent = Intent(context, DoctorDutyHeartbeatService::class.java)
                .putExtra(EXTRA_DOCTOR_ID, doctorId)
            ContextCompat.startForegroundService(context, intent)
            Unit
        }

        fun stop(context: Context) {
            context.applicationContext
                .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_DOCTOR_ID)
                .apply()
            context.stopService(Intent(context, DoctorDutyHeartbeatService::class.java))
        }
    }
}
