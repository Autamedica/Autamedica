package com.autamedica.android

import android.app.PictureInPictureParams
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
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import android.content.Intent
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.compose.rememberNavController
import com.autamedica.android.domain.model.VideoCallStateHolder
import com.autamedica.android.navigation.AppNavHost
import com.autamedica.android.navigation.Route
import com.autamedica.android.presentation.theme.AutamedicaTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var videoCallStateHolder: VideoCallStateHolder

    var isInPipMode by mutableStateOf(false)
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val navController = rememberNavController()
            var startDestination: Route by mutableStateOf(Route.Login)
            var navigateTo: Route? by mutableStateOf(null)

            LaunchedEffect(intent) {
                // If the app is launched via notification
                val chatId = intent.getStringExtra("chat_room_id")
                if (!chatId.isNullOrEmpty()) {
                    startDestination = Route.ChatConversation(chatId)
                    return@LaunchedEffect
                }

                // Allow direct launch into video call from notification/ADB.
                // Useful for debugging telemedicine flow without navigating tabs.
                val appointmentId = intent.getStringExtra("appointment_id")
                if (!appointmentId.isNullOrEmpty()) {
                    val userId = intent.getStringExtra("user_id").orEmpty()
                    val userType = intent.getStringExtra("user_type") ?: "patient"
                    val userName = intent.getStringExtra("user_name").orEmpty()
                    startDestination = Route.Main
                    navigateTo = Route.VideoCall(
                        appointmentId = appointmentId,
                        userId = userId,
                        userType = userType,
                        userName = userName,
                    )
                }
            }

            LaunchedEffect(navigateTo) {
                navigateTo?.let {
                    navController.navigate(it)
                    navigateTo = null
                }
            }

            AutamedicaTheme {
                AppNavHost(
                    startDestination = startDestination,
                    isInPipMode = isInPipMode,
                    navController = navController, // Need to pass this down
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
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
