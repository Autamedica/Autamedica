package com.autamedica.android.service

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.media.RingtoneManager
import android.os.PowerManager
import com.autamedica.android.MainActivity
import com.autamedica.android.R
import com.autamedica.android.domain.model.NotificationType
import com.autamedica.android.domain.model.PushPayload
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowPowerManager

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DispatchIncomingAlertTest {

    private val context: Application = RuntimeEnvironment.getApplication()

    @After
    fun tearDown() {
        IncomingCallNotificationManager.dismissDispatchAlert(context)
        ShadowPowerManager.clearWakeLocks()
    }

    @Test
    fun dispatchOfferBuildsFullScreenCallAlertWithRingtoneVibrationAndWakeLock() {
        val payload = PushPayload(
            type = NotificationType.PHARMACY_DISPATCH_INCOMING,
            title = "Sensitive patient name must not be displayed",
            body = "Sensitive symptom details must not be displayed",
            appointmentId = "request-123",
        )

        IncomingCallNotificationManager.showDispatchIncoming(context, payload)

        val notificationManager = context.getSystemService(NotificationManager::class.java)
        val notification = shadowOf(notificationManager)
            .getNotification(IncomingCallNotificationManager.NOTIFICATION_ID_DISPATCH)

        assertNotNull("The dispatch alert must be posted", notification)
        assertNotNull("The dispatch alert must open the radar full-screen", notification.fullScreenIntent)
        val radarIntent = shadowOf(notification.fullScreenIntent).savedIntent
        assertEquals(MainActivity::class.java.name, radarIntent.component?.className)
        assertEquals(
            IncomingCallNotificationManager.ACTION_ACCEPT_DISPATCH,
            radarIntent.action,
        )
        assertEquals("autamedica://ondemand", radarIntent.getStringExtra("deep_link"))
        assertTrue(radarIntent.getBooleanExtra(
            IncomingCallNotificationManager.EXTRA_IS_DISPATCH_OFFER,
            false,
        ))
        assertEquals(Notification.CATEGORY_CALL, notification.category)
        assertEquals(Notification.PRIORITY_MAX, notification.priority)
        assertEquals(Notification.VISIBILITY_PUBLIC, notification.visibility)
        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        assertEquals(ringtoneUri, notification.sound)
        assertArrayEquals(
            longArrayOf(0, 1000, 1000, 1000, 1000, 1000),
            notification.vibrate,
        )
        assertTrue(
            "The alert remains visible until dismissal or timeout",
            (notification.flags and Notification.FLAG_ONGOING_EVENT) != 0,
        )
        assertTrue(
            "The operating system must treat the alert as an insistent ringing call",
            (notification.flags and Notification.FLAG_INSISTENT) != 0,
        )

        assertEquals(2, notification.actions.size)
        assertEquals(notification.fullScreenIntent, notification.actions[0].actionIntent)
        assertEquals(
            context.getString(R.string.notification_dispatch_accept),
            notification.actions[0].title.toString(),
        )
        assertEquals(
            context.getString(R.string.notification_dispatch_decline),
            notification.actions[1].title.toString(),
        )
        val declineIntent = shadowOf(notification.actions[1].actionIntent).savedIntent
        assertEquals(
            IncomingCallNotificationManager.ACTION_DECLINE_DISPATCH,
            declineIntent.action,
        )

        val channel = notificationManager.getNotificationChannel(
            IncomingCallNotificationManager.DISPATCH_CHANNEL_ID,
        )
        assertNotNull(channel)
        assertTrue(channel.importance >= NotificationManager.IMPORTANCE_HIGH)
        assertEquals(Notification.VISIBILITY_PUBLIC, channel.lockscreenVisibility)
        assertEquals(ringtoneUri, channel.sound)
        assertEquals(
            context.getString(R.string.notification_dispatch_offer_title),
            notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString(),
        )
        assertEquals(
            context.getString(R.string.notification_dispatch_offer_text),
            notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString(),
        )
        assertTrue(
            "No patient identity or symptoms may be exposed",
            notification.extras.toString().let {
                !it.contains("Sensitive patient name") && !it.contains("Sensitive symptom details")
            },
        )

        val wakeLock: PowerManager.WakeLock? = ShadowPowerManager.getLatestWakeLock()
        assertNotNull("The phone must acquire a hardware wake lock", wakeLock)
        assertTrue("The wake lock must remain held for the offer window", wakeLock!!.isHeld)
    }
}
