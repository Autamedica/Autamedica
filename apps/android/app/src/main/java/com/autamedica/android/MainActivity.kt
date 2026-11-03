package com.autamedica.android

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collect
import androidx.navigation.compose.rememberNavController
import com.autamedica.android.data.attribution.PartnerAttributionTracker
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.model.VideoCallStateHolder
import com.autamedica.android.navigation.AppNavHost
import com.autamedica.android.navigation.NotificationRouteResolver
import com.autamedica.android.navigation.Route
import com.autamedica.android.presentation.theme.AutamedicaTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var videoCallStateHolder: VideoCallStateHolder

    @Inject
    lateinit var authRepository: AuthRepository

    @Inject
    lateinit var partnerAttributionTracker: PartnerAttributionTracker

    var isInPipMode by mutableStateOf(false)
        private set
    private var incomingIntent by mutableStateOf<Intent?>(null)
    private var pendingPostLoginRoute by mutableStateOf<Route?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        handleIncomingCallIntent(intent)
        partnerAttributionTracker.captureInstallReferrer()
        lifecycleScope.launch {
            authRepository.observeSession().collect { user ->
                if (user != null) partnerAttributionTracker.submitPending()
            }
        }
        enableEdgeToEdge()
        incomingIntent = intent
        setContent {
            val navController = rememberNavController()
            val activeIntent = incomingIntent

            LaunchedEffect(activeIntent) {
                if (activeIntent != null) {
                    val route = NotificationRouteResolver.resolve(activeIntent)
                    if (route != null) {
                        pendingPostLoginRoute = route
                    }
                    incomingIntent = null
                }
            }

            AutamedicaTheme {
                AppNavHost(
                    startDestination = Route.Main,
                    postLoginRoute = pendingPostLoginRoute,
                    onPostLoginRouteConsumed = { pendingPostLoginRoute = null },
                    isInPipMode = isInPipMode,
                    navController = navController,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingCallIntent(intent)
        incomingIntent = intent
    }

    private fun handleIncomingCallIntent(intent: Intent?) {
        if (intent == null) return
        val isCall = intent.getBooleanExtra(com.autamedica.android.service.IncomingCallNotificationManager.EXTRA_IS_INCOMING_CALL, false) ||
            intent.action == com.autamedica.android.service.IncomingCallNotificationManager.ACTION_ANSWER_CALL
        if (isCall) {
            val notifId = intent.getIntExtra(com.autamedica.android.service.IncomingCallNotificationManager.EXTRA_NOTIFICATION_ID, -1)
            com.autamedica.android.service.IncomingCallNotificationManager.dismissCall(this, notifId)
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (videoCallStateHolder.isInVideoCall.value) {
            enterPipMode()
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        isInPipMode = isInPictureInPictureMode
    }

    private fun enterPipMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(9, 16))
                .build()
            enterPictureInPictureMode(params)
        }
    }
}
