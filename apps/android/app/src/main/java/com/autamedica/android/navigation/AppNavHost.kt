package com.autamedica.android.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.autamedica.android.presentation.auth.LoginScreen
import com.autamedica.android.presentation.chat.ChatConversationScreen
import com.autamedica.android.presentation.chat.ChatListScreen
import com.autamedica.android.presentation.health.AnamnesisFormScreen
import com.autamedica.android.presentation.main.MainScreen
import com.autamedica.android.presentation.patients.PatientDetailScreen
import com.autamedica.android.presentation.videocall.VideoCallScreen

@Composable
fun AppNavHost(
    startDestination: Route = Route.Login,
    postLoginRoute: Route? = null,
    onPostLoginRouteConsumed: () -> Unit = {},
    isInPipMode: Boolean = false,
    navController: NavHostController = rememberNavController(),
    modifier: Modifier = Modifier,
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier,
    ) {
        composable<Route.Login> {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Route.Main) {
                        popUpTo(Route.Login) { inclusive = true }
                        launchSingleTop = true
                    }
                    postLoginRoute?.let { route ->
                        navController.navigate(route) {
                            launchSingleTop = true
                        }
                        onPostLoginRouteConsumed()
                    }
                }
            )
        }

        composable<Route.Main> {
            MainScreen(
                onNavigateToVideoCall = { appointmentId ->
                    navController.navigate(Route.VideoCall(appointmentId)) {
                        launchSingleTop = true
                    }
                },
                onNavigateToLogin = {
                    navController.navigate(Route.Login) {
                        popUpTo(Route.Main) { inclusive = true }
                    }
                },
                onNavigateToPatientDetail = { patientId ->
                    navController.navigate(Route.PatientDetail(patientId))
                },
                onNavigateToChatConversation = { chatId ->
                    navController.navigate(Route.ChatConversation(chatId))
                },
                onNavigateToAnamnesisForm = {
                    navController.navigate(Route.AnamnesisForm)
                },
            )
        }

        composable<Route.VideoCall> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.VideoCall>()
            VideoCallScreen(
                appointmentId = route.appointmentId,
                onCallEnd = { navController.popBackStack() },
                isInPipMode = isInPipMode,
            )
        }

        composable<Route.PatientDetail> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.PatientDetail>()
            PatientDetailScreen(
                onBack = { navController.popBackStack() },
                onNavigateToVideoCall = { appointmentId ->
                    navController.navigate(Route.VideoCall(appointmentId)) {
                        launchSingleTop = true
                    }
                },
            )
        }

        composable<Route.ChatList> {
            ChatListScreen(
                onNavigateToConversation = { chatId ->
                    navController.navigate(Route.ChatConversation(chatId))
                },
            )
        }

        composable<Route.ChatConversation> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.ChatConversation>()
            ChatConversationScreen(
                chatId = route.chatId,
                onBack = { navController.popBackStack() },
            )
        }

        composable<Route.AnamnesisForm> {
            AnamnesisFormScreen(
                onBack = { navController.popBackStack() },
            )
        }
    }
}
