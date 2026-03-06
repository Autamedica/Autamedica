package com.autamedica.android

import android.app.PictureInPictureParams
import android.content.Intent
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
import androidx.navigation.compose.rememberNavController
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

    var isInPipMode by mutableStateOf(false)
        private set
    private var incomingIntent by mutableStateOf<Intent?>(null)
    private var pendingPostLoginRoute by mutableStateOf<Route?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        incomingIntent = intent
        setContent {
            val navController = rememberNavController()
            val activeIntent = incomingIntent

            LaunchedEffect(activeIntent) {
                val route = NotificationRouteResolver.resolve(
                    appointmentId = activeIntent?.getStringExtra(
                        NotificationRouteResolver.EXTRA_APPOINTMENT_ID,
                    ),
                    chatRoomId = activeIntent?.getStringExtra(
                        NotificationRouteResolver.EXTRA_CHAT_ROOM_ID,
                    ),
                    deepLink = activeIntent?.getStringExtra(
                        NotificationRouteResolver.EXTRA_DEEP_LINK,
                    ),
                )

                if (route != null) {
                    if (authRepository.getCurrentUser() != null) {
                        navController.navigate(Route.Main) {
                            popUpTo(Route.Login) { inclusive = true }
                            launchSingleTop = true
                        }
                        navController.navigate(route) {
                            launchSingleTop = true
                        }
                    } else {
                        pendingPostLoginRoute = route
                    }
                }
                incomingIntent = null
            }

            AutamedicaTheme {
                AppNavHost(
                    startDestination = Route.Login,
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
        incomingIntent = intent
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
