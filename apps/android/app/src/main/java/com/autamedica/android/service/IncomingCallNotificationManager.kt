package com.autamedica.android.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import com.autamedica.android.MainActivity
import com.autamedica.android.R
import com.autamedica.android.domain.model.PushPayload
import com.autamedica.android.navigation.NotificationRouteResolver
import com.autamedica.android.presentation.incomingcall.IncomingCallActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.net.HttpURLConnection
import java.net.URL

/**
 * Manages high-priority incoming call notifications with continuous ringing,
 * full-screen wake locks, and answer/decline action handlers.
 */
object IncomingCallNotificationManager {

    const val CHANNEL_ID = "autamedica_incoming_calls"
    const val ACTION_ANSWER_CALL = "com.autamedica.android.ACTION_ANSWER_CALL"
    const val ACTION_DECLINE_CALL = "com.autamedica.android.ACTION_DECLINE_CALL"
    const val EXTRA_APPOINTMENT_ID = "appointment_id"
    const val EXTRA_CALL_ID = "call_id"
    const val EXTRA_ROOM_ID = "room_id"
    const val EXTRA_NOTIFICATION_ID = "notification_id"
    const val EXTRA_IS_INCOMING_CALL = "is_incoming_call"
    const val EXTRA_CALLER_NAME = "caller_name"
    const val EXTRA_CALLER_AVATAR_URL = "caller_avatar_url"

    private const val CALL_TIMEOUT_MS = 45_000L
    private const val AVATAR_SIZE_PX = 192
    private val VIBRATION_PATTERN = longArrayOf(0, 1000, 1000, 1000, 1000, 1000)

    @Volatile
    private var activeRingtone: Ringtone? = null

    @Volatile
    private var activeVibrator: Vibrator? = null

    private var timeoutJob: Job? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /**
     * Creates or updates the dedicated incoming call notification channel with ringtone sound.
     */
    fun createChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.notification_incoming_call_channel),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_incoming_call_text)
            setSound(ringtoneUri, audioAttrs)
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setBypassDnd(true)
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * Displays a full-screen, high-priority incoming call notification and begins ringing.
     */
    fun showIncomingCall(context: Context, payload: PushPayload) {
        createChannel(context)
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val appointmentId = payload.appointmentId.orEmpty()
        val callId = payload.callId.orEmpty()
        val roomId = payload.roomId.orEmpty()
        val notificationId = (payload.appointmentId ?: "incoming_call").hashCode()

        // 1. Full-screen Intent (launches the WhatsApp-style incoming call screen)
        val callerName = payload.doctorName?.takeIf { it.isNotBlank() }
            ?: payload.title.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.notification_incoming_call_title)
        val callerAvatarUrl = payload.doctorAvatarUrl.orEmpty()

        val fullScreenIntent = Intent(context, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(NotificationRouteResolver.EXTRA_APPOINTMENT_ID, appointmentId)
            putExtra(NotificationRouteResolver.EXTRA_NOTIFICATION_TYPE, payload.type.name)
            putExtra(EXTRA_IS_INCOMING_CALL, true)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_ROOM_ID, roomId)
            putExtra(EXTRA_CALLER_NAME, callerName)
            putExtra(EXTRA_CALLER_AVATAR_URL, callerAvatarUrl)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // 2. Action ATENDER (opens VideoCall screen and silences ringtone)
        val answerIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            action = ACTION_ANSWER_CALL
            putExtra(NotificationRouteResolver.EXTRA_APPOINTMENT_ID, appointmentId)
            putExtra(NotificationRouteResolver.EXTRA_NOTIFICATION_TYPE, payload.type.name)
            putExtra(EXTRA_IS_INCOMING_CALL, true)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_ROOM_ID, roomId)
        }
        val answerPendingIntent = PendingIntent.getActivity(
            context,
            notificationId + 1,
            answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // 3. Action RECHAZAR (discards call, silences ringtone, informs Supabase)
        val declineIntent = Intent(context, CallActionReceiver::class.java).apply {
            action = ACTION_DECLINE_CALL
            putExtra(EXTRA_APPOINTMENT_ID, appointmentId)
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
        }
        val declinePendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId + 2,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        // Custom layout with circular doctor avatar and colored answer/decline actions.
        val views = RemoteViews(context.packageName, R.layout.notification_incoming_call)
        views.setTextViewText(R.id.caller_name, callerName)
        views.setTextViewText(R.id.call_hint, context.getString(R.string.notification_incoming_call_text))
        views.setOnClickPendingIntent(R.id.action_answer, answerPendingIntent)
        views.setOnClickPendingIntent(R.id.action_decline, declinePendingIntent)
        views.setOnClickPendingIntent(R.id.call_container, fullScreenPendingIntent)

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(callerName)
            .setContentText(context.getString(R.string.notification_incoming_call_text))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setSound(ringtoneUri)
            .setVibrate(VIBRATION_PATTERN)
            .setContentIntent(fullScreenPendingIntent)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setDeleteIntent(declinePendingIntent)
            .setCustomContentView(views)
            .setCustomBigContentView(views)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .addAction(
                R.drawable.ic_call_answer,
                context.getString(R.string.notification_answer_call),
                answerPendingIntent,
            )
            .addAction(
                R.drawable.ic_call_decline,
                context.getString(R.string.notification_decline_call),
                declinePendingIntent,
            )

        val notification = builder.build().apply {
            flags = flags or Notification.FLAG_INSISTENT
        }

        Timber.i("[IncomingCall] Displaying incoming call notification for appointment=$appointmentId id=$notificationId")
        manager.notify(notificationId, notification)

        // Load the doctor avatar asynchronously and refresh the notification with it.
        val avatarUrl = payload.doctorAvatarUrl?.takeIf { it.isNotBlank() }
        if (avatarUrl != null) {
            scope.launch {
                val avatar = loadCircularAvatarCompat(avatarUrl)
                if (avatar != null) {
                    views.setImageViewBitmap(R.id.caller_avatar, avatar)
                } else {
                    views.setImageViewResource(R.id.caller_avatar, R.drawable.avatar_doctor_m1)
                }
                manager.notify(notificationId, builder.build().apply {
                    flags = flags or Notification.FLAG_INSISTENT
                })
            }
        }

        // Start continuous ringtone & vibration fallback
        startRingtoneAndVibration(context, notificationId)
    }

    /**
     * Downloads a doctor avatar and crops it as a circle.
     */
    suspend fun loadCircularAvatarCompat(url: String): Bitmap? = withContext(Dispatchers.IO) {
        try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 6_000
            connection.readTimeout = 6_000
            connection.connect()
            val input = connection.inputStream
            val src = BitmapFactory.decodeStream(input)
            input.close()
            connection.disconnect()
            if (src == null) return@withContext null

            val size = AVATAR_SIZE_PX.coerceAtMost(src.width.coerceAtMost(src.height))
            val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(output)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val rectF = RectF(0f, 0f, size.toFloat(), size.toFloat())
            canvas.drawOval(rectF, paint)
            paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
            val left = (src.width - size) / 2
            val top = (src.height - size) / 2
            canvas.drawBitmap(src, Rect(left, top, left + size, top + size), rectF, paint)
            if (src != output) src.recycle()
            return@withContext output
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed to load doctor avatar, using fallback")
            return@withContext null
        }
    }

    /**
     * Plays looping ringtone and sustained vibration until answered, rejected, or timed out.
     */
    @Synchronized
    fun startRingtoneAndVibration(context: Context, notificationId: Int) {
        try {
            if (activeRingtone?.isPlaying != true) {
                val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                val ringtone = RingtoneManager.getRingtone(context.applicationContext, ringtoneUri)?.apply {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        isLooping = true
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        audioAttributes = AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    }
                }
                ringtone?.play()
                activeRingtone = ringtone
            }

            // Sustained vibration
            val vibrator = getVibrator(context)
            if (vibrator != null && vibrator.hasVibrator()) {
                activeVibrator = vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(
                        VibrationEffect.createWaveform(VIBRATION_PATTERN, 0)
                    )
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(VIBRATION_PATTERN, 0)
                }
            }

            timeoutJob?.cancel()
            timeoutJob = scope.launch {
                delay(CALL_TIMEOUT_MS)
                Timber.d("[IncomingCall] Call ringtone timed out after ${CALL_TIMEOUT_MS}ms")
                dismissCall(context, notificationId)
            }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed starting ringtone and vibration")
        }
    }

    /**
     * Silences ringtone and cancels vibration immediately.
     */
    @Synchronized
    fun stopRingtone() {
        timeoutJob?.cancel()
        timeoutJob = null

        try {
            activeRingtone?.let {
                if (it.isPlaying) it.stop()
            }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed stopping ringtone")
        } finally {
            activeRingtone = null
        }

        try {
            activeVibrator?.cancel()
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed cancelling vibrator")
        } finally {
            activeVibrator = null
        }
    }

    /**
     * Dismisses the incoming call notification and silences all ringing.
     */
    fun dismissCall(context: Context, notificationId: Int? = null) {
        stopRingtone()
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (notificationId != null && notificationId != -1) {
            manager.cancel(notificationId)
        } else {
            manager.activeNotifications
                .filter { it.notification.channelId == CHANNEL_ID }
                .forEach { manager.cancel(it.id) }
        }
    }

    @Suppress("DEPRECATION")
    private fun getVibrator(context: Context): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vibratorManager?.defaultVibrator
        } else {
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }
}