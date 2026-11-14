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
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
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
 * full-screen wake locks, and native Google CallStyle on Android 12+ (S+)
 * with an adaptive RemoteViews fallback for older Android versions.
 */
object IncomingCallNotificationManager {

    const val CHANNEL_ID = "autamedica_incoming_calls"
    const val DISPATCH_CHANNEL_ID = "autamedica_dispatch_incoming"
    const val ACTION_ANSWER_CALL = "com.autamedica.android.ACTION_ANSWER_CALL"
    const val ACTION_DECLINE_CALL = "com.autamedica.android.ACTION_DECLINE_CALL"
    const val ACTION_ACCEPT_DISPATCH = "com.autamedica.android.ACTION_ACCEPT_DISPATCH"
    const val ACTION_PRESENT_DISPATCH_OFFER = "com.autamedica.android.ACTION_PRESENT_DISPATCH_OFFER"
    const val ACTION_DECLINE_DISPATCH = "com.autamedica.android.ACTION_DECLINE_DISPATCH"
    const val EXTRA_IS_DISPATCH_OFFER = "is_dispatch_offer"
    const val EXTRA_DISPATCH_USER_ACTION = "dispatch_user_action"
    const val EXTRA_DISPATCH_OFFER_ID = "dispatch_offer_id"
    const val EXTRA_APPOINTMENT_ID = "appointment_id"
    const val EXTRA_CALL_ID = "call_id"
    const val EXTRA_ROOM_ID = "room_id"
    const val EXTRA_NOTIFICATION_ID = "notification_id"
    const val EXTRA_IS_INCOMING_CALL = "is_incoming_call"
    const val EXTRA_CALLER_NAME = "caller_name"
    const val EXTRA_CALLER_AVATAR_URL = "caller_avatar_url"

    // Fixed notification IDs to guarantee a single active alert card per modality
    // and eliminate orphaned/accumulated notification stacks.
    const val NOTIFICATION_ID_CALL = 2001
    const val NOTIFICATION_ID_DISPATCH = 2002

    private const val CALL_TIMEOUT_MS = 30_000L
    private const val AVATAR_SIZE_PX = 192
    private val VIBRATION_PATTERN = longArrayOf(0, 1000, 1000, 1000, 1000, 1000)

    @Volatile
    private var activeRingtone: Ringtone? = null

    @Volatile
    private var activeVibrator: Vibrator? = null

    @Volatile
    private var activeWakeLock: PowerManager.WakeLock? = null

    // Pharmacy dispatch alarms are isolated from ordinary video-call alerts.
    @Volatile
    private var activeDispatchRingtone: Ringtone? = null

    @Volatile
    private var activeDispatchRingtonePlayer: MediaPlayer? = null

    @Volatile
    private var activeDispatchVibrator: Vibrator? = null

    @Volatile
    private var activeDispatchWakeLock: PowerManager.WakeLock? = null

    private var dispatchTimeoutJob: Job? = null
    private var timeoutJob: Job? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /**
     * Clears all active call and dispatch notifications across both channels
     * to prevent card accumulation in the shade.
     */
    fun clearActiveAlertNotifications(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        try {
            manager.activeNotifications
                .filter {
                    it.notification.channelId == CHANNEL_ID ||
                            it.notification.channelId == DISPATCH_CHANNEL_ID ||
                            it.id == NOTIFICATION_ID_CALL ||
                            it.id == NOTIFICATION_ID_DISPATCH
                }
                .forEach { manager.cancel(it.id) }

            manager.cancel(NOTIFICATION_ID_CALL)
            manager.cancel(NOTIFICATION_ID_DISPATCH)
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed clearing active notifications")
        }
    }

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
        createDispatchChannel(context)
    }

    /**
     * Creates the dedicated channel for pharmacy on-demand dispatches with ringtone sound.
     */
    fun createDispatchChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val channel = NotificationChannel(
            DISPATCH_CHANNEL_ID,
            context.getString(R.string.notification_dispatch_channel),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_dispatch_text)
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
     * Uses native NotificationCompat.CallStyle on Android 12+ (S+).
     */
    fun showIncomingCall(context: Context, payload: PushPayload) {
        clearActiveAlertNotifications(context)
        acquireWakeLock(context)
        createChannel(context)
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val appointmentId = payload.appointmentId.orEmpty()
        val callId = payload.callId.orEmpty()
        val roomId = payload.roomId.orEmpty()
        val notificationId = NOTIFICATION_ID_CALL

        val callerName = payload.doctorName?.takeIf { it.isNotBlank() }
            ?: payload.title.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.notification_incoming_call_title)
        val callerAvatarUrl = payload.doctorAvatarUrl.orEmpty()

        // 1. Full-screen Intent (launches the incoming call screen)
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
            notificationId + 10,
            answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // 3. Action RECHAZAR (discards call, silences ringtone)
        val declineIntent = Intent(context, CallActionReceiver::class.java).apply {
            action = ACTION_DECLINE_CALL
            putExtra(EXTRA_APPOINTMENT_ID, appointmentId)
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
        }
        val declinePendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId + 20,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        fun buildCallNotification(avatarBitmap: Bitmap? = null): Notification {
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(ContextCompat.getColor(context, R.color.primary))
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Native CallStyle standard for Android 12+
                val callerIcon = if (avatarBitmap != null) {
                    IconCompat.createWithBitmap(avatarBitmap)
                } else {
                    IconCompat.createWithResource(context, R.drawable.avatar_doctor_m1)
                }

                val person = Person.Builder()
                    .setName(callerName)
                    .setIcon(callerIcon)
                    .setImportant(true)
                    .build()

                val callStyle = NotificationCompat.CallStyle.forIncomingCall(
                    person,
                    declinePendingIntent,
                    answerPendingIntent,
                )
                callStyle.setIsVideo(true)
                callStyle.setVerificationText(context.getString(R.string.notification_incoming_call_text))

                builder.setStyle(callStyle)
            } else {
                // Compact RemoteViews fallback for Android < 12
                val views = RemoteViews(context.packageName, R.layout.notification_incoming_call)
                views.setTextViewText(R.id.caller_name, callerName)
                views.setTextViewText(R.id.call_hint, context.getString(R.string.notification_incoming_call_text))
                views.setOnClickPendingIntent(R.id.action_answer, answerPendingIntent)
                views.setOnClickPendingIntent(R.id.action_decline, declinePendingIntent)
                views.setOnClickPendingIntent(R.id.call_container, fullScreenPendingIntent)

                if (avatarBitmap != null) {
                    views.setImageViewBitmap(R.id.caller_avatar, avatarBitmap)
                } else {
                    views.setImageViewResource(R.id.caller_avatar, R.drawable.avatar_doctor_m1)
                }

                builder.setCustomContentView(views)
                    .setCustomBigContentView(views)
                    .setStyle(NotificationCompat.DecoratedCustomViewStyle())
                // Do NOT call builder.addAction() here: views already contain the buttons,
                // avoiding button duplication and bloated layout cards.
            }

            return builder.build().apply { flags = flags or Notification.FLAG_INSISTENT }
        }

        Timber.i("[IncomingCall] Displaying incoming call notification id=$notificationId for caller=$callerName")
        manager.notify(notificationId, buildCallNotification())

        // Load caller avatar asynchronously
        val avatarUrl = payload.doctorAvatarUrl?.takeIf { it.isNotBlank() }
        if (avatarUrl != null) {
            scope.launch {
                val avatar = loadCircularAvatarCompat(avatarUrl)
                if (avatar != null) {
                    manager.notify(notificationId, buildCallNotification(avatar))
                }
            }
        }

        startRingtoneAndVibration(context, notificationId)
    }

    /**
     * Displays a full-screen, call-priority pharmacy dispatch offer.
     * Wakes the display, rings and vibrates until the clinician opens the radar,
     * dismisses the alert or the 30-second offer window expires.
     * Lock-screen text is generic and never exposes patient clinical data.
     */
    fun showDispatchIncoming(context: Context, payload: PushPayload) {
        // The offer is time-critical, but the lock-screen surface is deliberately generic.
        // Patient identity, documents, symptoms and room identifiers stay inside the radar.
        acquireDispatchWakeLock(context)
        createDispatchChannel(context)
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val notificationId = NOTIFICATION_ID_DISPATCH
        val title = context.getString(R.string.notification_dispatch_offer_title)
        val body = context.getString(R.string.notification_dispatch_offer_text)
        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        // The system may launch the full-screen intent automatically to wake the lock screen.
        // That presentation is not a clinician interaction and must not silence the 30s alarm.
        val fullScreenIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            action = ACTION_PRESENT_DISPATCH_OFFER
            putExtra(NotificationRouteResolver.EXTRA_NOTIFICATION_TYPE, "pharmacy_dispatch_incoming")
            putExtra(NotificationRouteResolver.EXTRA_DEEP_LINK, "autamedica://ondemand")
            putExtra(EXTRA_IS_DISPATCH_OFFER, true)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_APPOINTMENT_ID, payload.appointmentId)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            notificationId + 30,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // This second PendingIntent is used only when the clinician taps the notification
        // or its "Ver / Aceptar" action. MainActivity can now safely stop the alert.
        val openRadarIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            action = ACTION_ACCEPT_DISPATCH
            putExtra(NotificationRouteResolver.EXTRA_NOTIFICATION_TYPE, "pharmacy_dispatch_incoming")
            putExtra(NotificationRouteResolver.EXTRA_DEEP_LINK, "autamedica://ondemand")
            putExtra(EXTRA_IS_DISPATCH_OFFER, true)
            putExtra(EXTRA_DISPATCH_USER_ACTION, true)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_APPOINTMENT_ID, payload.appointmentId)
        }
        val openRadar = PendingIntent.getActivity(
            context,
            notificationId + 10,
            openRadarIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val declineIntent = Intent(context, CallActionReceiver::class.java).apply {
            action = ACTION_DECLINE_DISPATCH
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_DISPATCH_OFFER_ID, payload.offerId)
        }
        val declineOffer = PendingIntent.getBroadcast(
            context,
            notificationId + 20,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val publicNotification = NotificationCompat.Builder(context, DISPATCH_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.primary))
            .setContentTitle(title)
            .setContentText(body)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        val notification = NotificationCompat.Builder(context, DISPATCH_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.primary))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPublicVersion(publicNotification)
            .setOngoing(true)
            .setAutoCancel(false)
            .setSound(ringtoneUri)
            .setVibrate(VIBRATION_PATTERN)
            .setContentIntent(openRadar)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setDeleteIntent(declineOffer)
            .setTimeoutAfter(CALL_TIMEOUT_MS)
            .addAction(
                R.drawable.ic_notification,
                context.getString(R.string.notification_dispatch_accept),
                openRadar,
            )
            .addAction(
                R.drawable.ic_notification,
                context.getString(R.string.notification_dispatch_decline),
                declineOffer,
            )
            .build()
            .apply { flags = flags or Notification.FLAG_INSISTENT }

        Timber.i("[IncomingCall] Posting full-screen pharmacy dispatch alert id=$notificationId")
        manager.notify(notificationId, notification)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            !manager.canUseFullScreenIntent()
        ) {
            // Android 14+ can revoke this permission at device level. Keep the max-priority
            // ringing + heads-up notification active; never silently downgrade the offer.
            Timber.w("[IncomingCall] Full-screen intent permission is disabled by the device")
        }

        startDispatchAlertRinging(context)
    }

    /** Starts an independent 30-second alarm without changing ordinary call audio state. */
    @Synchronized
    private fun startDispatchAlertRinging(context: Context) {
        try {
            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                if (activeDispatchRingtone?.isPlaying != true) {
                    activeDispatchRingtone = RingtoneManager
                        .getRingtone(context.applicationContext, ringtoneUri)
                        ?.apply {
                            isLooping = true
                            this.audioAttributes = audioAttributes
                            play()
                        }
                }
            } else if (activeDispatchRingtonePlayer?.isPlaying != true) {
                activeDispatchRingtonePlayer = MediaPlayer
                    .create(context.applicationContext, ringtoneUri)
                    ?.apply {
                        setAudioAttributes(audioAttributes)
                        isLooping = true
                        start()
                    }
            }

            getVibrator(context)?.takeIf { it.hasVibrator() }?.let { vibrator ->
                activeDispatchVibrator = vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, 0))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(VIBRATION_PATTERN, 0)
                }
            }

            dispatchTimeoutJob?.cancel()
            dispatchTimeoutJob = scope.launch {
                delay(CALL_TIMEOUT_MS)
                Timber.d("[IncomingCall] Pharmacy dispatch alert expired after ${CALL_TIMEOUT_MS}ms")
                dismissDispatchAlert(context)
            }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed starting pharmacy dispatch alert")
        }
    }

    @Synchronized
    private fun acquireDispatchWakeLock(context: Context) {
        try {
            if (activeDispatchWakeLock?.isHeld != true) {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                    ?: return
                @Suppress("DEPRECATION")
                val wakeLock = powerManager.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                        PowerManager.ACQUIRE_CAUSES_WAKEUP or
                        PowerManager.ON_AFTER_RELEASE,
                    "autamedica:dispatch_offer_wake",
                )
                wakeLock.acquire(CALL_TIMEOUT_MS)
                activeDispatchWakeLock = wakeLock
                Timber.i("[IncomingCall] Acquired pharmacy dispatch screen WakeLock")
            }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed acquiring dispatch WakeLock")
        }
    }

    /** Stops only pharmacy-dispatch ringing, leaving unrelated incoming-call alerts intact. */
    @Synchronized
    fun dismissDispatchAlert(context: Context) {
        dispatchTimeoutJob?.cancel()
        dispatchTimeoutJob = null

        try {
            activeDispatchRingtone?.let { if (it.isPlaying) it.stop() }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed stopping dispatch ringtone")
        } finally {
            activeDispatchRingtone = null
        }

        try {
            activeDispatchRingtonePlayer?.let { player ->
                if (player.isPlaying) player.stop()
                player.release()
            }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed stopping dispatch media player")
        } finally {
            activeDispatchRingtonePlayer = null
        }

        try {
            activeDispatchVibrator?.cancel()
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed stopping dispatch vibration")
        } finally {
            activeDispatchVibrator = null
        }

        try {
            activeDispatchWakeLock?.let { if (it.isHeld) it.release() }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed releasing dispatch WakeLock")
        } finally {
            activeDispatchWakeLock = null
        }

        context.getSystemService(NotificationManager::class.java)
            ?.cancel(NOTIFICATION_ID_DISPATCH)
    }

    /**
     * Crops any bitmap into an anti-aliased circle.
     */
    fun cropToCircle(bitmap: Bitmap): Bitmap {
        val size = minOf(bitmap.width, bitmap.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val rect = Rect(
            (bitmap.width - size) / 2,
            (bitmap.height - size) / 2,
            (bitmap.width + size) / 2,
            (bitmap.height + size) / 2,
        )
        val rectF = RectF(0f, 0f, size.toFloat(), size.toFloat())
        canvas.drawOval(rectF, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        canvas.drawBitmap(bitmap, rect, rectF, paint)
        return output
    }

    /**
     * Downloads a doctor avatar and crops it as a circle using downsampling to avoid OOM or network freezes.
     */
    suspend fun loadCircularAvatarCompat(url: String): Bitmap? = withContext(Dispatchers.IO) {
        try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 3_500
            connection.readTimeout = 3_500
            connection.instanceFollowRedirects = true
            connection.connect()
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                connection.disconnect()
                return@withContext null
            }
            val bytes = connection.inputStream.readBytes()
            connection.disconnect()
            if (bytes.isEmpty()) return@withContext null

            val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, boundsOptions)

            var inSampleSize = 1
            if (boundsOptions.outHeight > AVATAR_SIZE_PX || boundsOptions.outWidth > AVATAR_SIZE_PX) {
                val halfHeight = boundsOptions.outHeight / 2
                val halfWidth = boundsOptions.outWidth / 2
                while ((halfHeight / inSampleSize) >= AVATAR_SIZE_PX && (halfWidth / inSampleSize) >= AVATAR_SIZE_PX) {
                    inSampleSize *= 2
                }
            }

            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val src = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decodeOptions) ?: return@withContext null
            val circular = cropToCircle(src)
            if (src != circular) src.recycle()
            return@withContext circular
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed to load doctor avatar, using fallback")
            return@withContext null
        }
    }

    /**
     * Acquires physical hardware screen WakeLock to turn on screen immediately for 30s.
     */
    @Synchronized
    fun acquireWakeLock(context: Context) {
        try {
            if (activeWakeLock?.isHeld != true) {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (powerManager != null) {
                    @Suppress("DEPRECATION")
                    val wakeLock = powerManager.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                                PowerManager.ON_AFTER_RELEASE,
                        "autamedica:incoming_call_wake",
                    )
                    wakeLock.acquire(CALL_TIMEOUT_MS)
                    activeWakeLock = wakeLock
                    Timber.i("[IncomingCall] Acquired hardware SCREEN_BRIGHT_WAKE_LOCK for incoming call (${CALL_TIMEOUT_MS}ms)")
                }
            }
        } catch (wakeErr: Exception) {
            Timber.w(wakeErr, "[IncomingCall] Failed acquiring WakeLock")
        }
    }

    /**
     * Plays looping ringtone, activates physical screen WakeLock, and runs sustained vibration.
     */
    @Synchronized
    fun startRingtoneAndVibration(context: Context, notificationId: Int, runTimeout: Boolean = true) {
        try {
            acquireWakeLock(context)

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
            if (runTimeout) {
                timeoutJob = scope.launch {
                    delay(CALL_TIMEOUT_MS)
                    Timber.d("[IncomingCall] Call ringtone timed out after ${CALL_TIMEOUT_MS}ms")
                    dismissCall(context, notificationId)
                }
            }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed starting ringtone and vibration")
        }
    }

    /**
     * Silences ringtone, cancels vibration, and releases hardware WakeLock immediately.
     */
    @Synchronized
    fun stopRingtone() {
        timeoutJob?.cancel()
        timeoutJob = null
        try {
            activeWakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Timber.d("[IncomingCall] Released hardware WakeLock")
                }
            }
        } catch (e: Exception) {
            Timber.w(e, "[IncomingCall] Failed releasing WakeLock")
        } finally {
            activeWakeLock = null
        }

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
     * Dismisses the call or dispatch notification and silences all ringing.
     * Also clears any lingering notifications on both alert channels.
     */
    fun dismissCall(context: Context, notificationId: Int? = null) {
        stopRingtone()
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (notificationId != null && notificationId != -1) {
            manager.cancel(notificationId)
        }
        clearActiveAlertNotifications(context)
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