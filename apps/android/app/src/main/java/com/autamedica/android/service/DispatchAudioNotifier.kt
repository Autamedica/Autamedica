package com.autamedica.android.service

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.autamedica.android.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Manages the rhythmic medical radar ping audio and haptics for incoming
 * On-Demand dispatch requests (Uber Driver style) during the 25-second countdown.
 */
object DispatchAudioNotifier {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var mediaPlayer: MediaPlayer? = null
    private var activeVibrator: Vibrator? = null
    private var autoStopJob: Job? = null

    private val VIBRATION_PATTERN = longArrayOf(0, 200, 250, 200, 750)

    @Synchronized
    fun startPing(context: Context, timeoutMs: Long = 25_000L) {
        stopPing()

        try {
            val player = MediaPlayer.create(context.applicationContext, R.raw.dispatch_ping)
            if (player != null) {
                player.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                player.isLooping = true
                player.start()
                mediaPlayer = player
            }

            // Haptic feedback (non-infinite, single cycle)
            triggerVibration(context)

            // Auto-stop safety timer (stops after 25s)
            autoStopJob = scope.launch {
                delay(timeoutMs)
                stopPing()
            }
        } catch (e: Exception) {
            Timber.e(e, "[DispatchAudioNotifier] Error starting dispatch ping")
        }
    }

    @Synchronized
    fun stopPing() {
        autoStopJob?.cancel()
        autoStopJob = null

        try {
            mediaPlayer?.let { player ->
                if (player.isPlaying) {
                    player.stop()
                }
                player.release()
            }
        } catch (e: Exception) {
            Timber.e(e, "[DispatchAudioNotifier] Error stopping player")
        } finally {
            mediaPlayer = null
        }

        try {
            activeVibrator?.cancel()
        } catch (e: Exception) {
            Timber.e(e, "[DispatchAudioNotifier] Error cancelling vibrator")
        } finally {
            activeVibrator = null
        }
    }

    private fun triggerVibration(context: Context) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

            activeVibrator = vibrator

            // repeat = -1 plays the pattern ONCE and stops (never loops infinitely)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(VIBRATION_PATTERN, -1)
            }
        } catch (e: Exception) {
            Timber.w(e, "[DispatchAudioNotifier] Could not trigger vibration")
        }
    }
}
