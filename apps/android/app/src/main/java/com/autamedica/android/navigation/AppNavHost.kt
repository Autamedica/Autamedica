package com.autamedica.android.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.autamedica.android.presentation.health.PreventiveHealthScreen
import com.autamedica.android.presentation.main.MainScreen
import com.autamedica.android.presentation.patients.PatientDetailScreen

import com.autamedica.android.presentation.patients.reproductive.ReproductiveHealthScreen
import com.autamedica.android.presentation.patients.community.PatientCommunityScreen

import com.autamedica.android.presentation.profile.PatientProfileScreen
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
    LaunchedEffect(postLoginRoute, navController) {
        val route = postLoginRoute ?: return@LaunchedEffect
        var consumed = false
        navController.currentBackStackEntryFlow.collect { backStackEntry ->
            if (consumed) return@collect
            val currentRoute = backStackEntry.destination.route
            val isOnLogin = currentRoute?.contains("Login") == true
            if (!isOnLogin) {
                consumed = true
                navController.navigate(route) {
                    launchSingleTop = true
                }
                onPostLoginRouteConsumed()
            }
        }
    }

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
                },
                onNavigateToRegister = { role ->
                    navController.navigate(Route.Register(role.wireName))
                },
                onNavigateToForgotPassword = {
                    navController.navigate(Route.ForgotPassword)
                }
            )
        }

        composable<Route.Register> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.Register>()
            com.autamedica.android.presentation.auth.RegisterScreen(
                initialRoleName = route.initialRole,
                onNavigateToLogin = {
                    navController.navigate(Route.Login) {
                        popUpTo(Route.Register(route.initialRole)) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onRegisterSuccess = {
                    navController.navigate(Route.Main) {
                        popUpTo(Route.Register(route.initialRole)) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            )
        }

        composable<Route.ForgotPassword> {
            com.autamedica.android.presentation.auth.ForgotPasswordScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable<Route.PsychiatryIntake> {
            com.autamedica.android.presentation.patients.psychiatry.PsychiatryIntakeScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable<Route.PharmacyIntake> {
            com.autamedica.android.presentation.pharmacy.PharmacyIntakeScreen(
                onBack = { navController.popBackStack() },
                onNavigateToCall = { roomId ->
                    navController.navigate(
                        Route.VideoCall(
                            appointmentId = "",
                            roomId = roomId,
                            isIncomingCall = true,
                        )
                    ) {
                        launchSingleTop = true
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
                onNavigateToPreventiveHealth = {
                    navController.navigate(Route.PreventiveHealth) {
                        launchSingleTop = true
                    }
                },
                onNavigateToPsychiatry = {
                    navController.navigate(Route.PsychiatryIntake)
                },
                onNavigateToReproductiveHealth = {
                    navController.navigate(Route.ReproductiveHealth)
                },
                onNavigateToCommunity = {
                    navController.navigate(Route.PatientCommunity)
                },
                onNavigateToPrescriptions = {
                    navController.navigate(Route.Prescriptions)
                },
                onNavigateToClinicalDocuments = {
                    navController.navigate(Route.ClinicalDocuments)
                },
                onNavigateToContinuityStatus = {
                    navController.navigate(Route.ContinuityStatus)
                },
                onNavigateToDoctorSignature = {
                    navController.navigate(Route.DoctorSignature) {
                        launchSingleTop = true
                    }
                },
                onNavigateToDoctorPrescriptions = {
                    navController.navigate(Route.DoctorPrescriptions)
                },
                onNavigateToDoctorCertificates = {
                    navController.navigate(Route.DoctorCertificates)
                },
                onNavigateToDoctorMedicalOrders = {
                    navController.navigate(Route.DoctorMedicalOrders)
                },
                onNavigateToPatientProfile = {
                    navController.navigate(Route.PatientProfile) {
                        launchSingleTop = true
                    }
                },
                onNavigateToPharmacyIntake = {
                    navController.navigate(Route.PharmacyIntake()) {
                        launchSingleTop = true
                    }
                },
            )
        }

        composable<Route.PatientProfile> {
            PatientProfileScreen(
                onBack = { navController.popBackStack() },
                onLogout = {
                    navController.navigate(Route.Login) {
                        popUpTo(Route.Main) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable<Route.VideoCall> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.VideoCall>()
            VideoCallScreen(
                appointmentId = route.appointmentId,
                roomId = route.roomId,
                isIncomingCall = route.isIncomingCall,
                onCallEnd = { navController.popBackStack() },
                isInPipMode = isInPipMode,
                onNavigateToCreatePrescription = { patientId ->
                    navController.navigate(Route.CreatePrescription(patientId))
                },
                onNavigateToCreateCertificate = { patientId ->
                    navController.navigate(Route.CreateCertificate(patientId))
                },
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

        composable<Route.PreventiveHealth> {
            PreventiveHealthScreen(
                onBack = { navController.popBackStack() },
            )
        }
        
        composable<Route.Consent> {
            com.autamedica.android.presentation.patients.consent.ConsentScreen(
                onAccept = { navController.popBackStack() }
            )
        }
        
        composable<Route.AdverseEvents> {
            com.autamedica.android.presentation.health.AdverseEventsScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable<Route.ContinuityStatus> {
            com.autamedica.android.presentation.patients.continuity.ContinuityStatusScreen(
                onBack = { navController.popBackStack() },
                onNavigateToVideoCall = { appointmentId ->
                    navController.navigate(Route.VideoCall(appointmentId))
                },
            )
        }

        composable<Route.ConsultationReports> {
            com.autamedica.android.presentation.patients.reports.ConsultationReportsScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable<Route.ReproductiveHealth> {
            ReproductiveHealthScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable<Route.PatientCommunity> {
            PatientCommunityScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable<Route.DoctorAgenda> {
            com.autamedica.android.presentation.doctors.agenda.DoctorAgendaScreen(
                onBack = { navController.popBackStack() },
                onNavigateToVideoCall = { targetId ->
                    val isRoom = targetId.startsWith("cf-room") || targetId.startsWith("room_")
                    navController.navigate(
                        if (isRoom) {
                            Route.VideoCall(appointmentId = "", roomId = targetId, isIncomingCall = true)
                        } else {
                            Route.VideoCall(appointmentId = targetId)
                        }
                    ) {
                        launchSingleTop = true
                    }
                },
                onNavigateToDoctorOnDemand = {
                    navController.navigate(Route.DoctorOnDemand)
                },
                onNavigateToCreatePrescription = { patientId ->
                    navController.navigate(Route.CreatePrescription(patientId))
                },
                onNavigateToCreateMedicalOrder = { patientId ->
                    navController.navigate(Route.CreateMedicalOrder(patientId))
                },
                onNavigateToCreateCertificate = { patientId ->
                    navController.navigate(Route.CreateCertificate(patientId))
                },
                onNavigateToConsultationReport = { appointmentId ->
                    navController.navigate(Route.DoctorConsultationReport(appointmentId))
                },
            )
        }

        composable<Route.DoctorOnDemand> {
            com.autamedica.android.presentation.ondemand.DoctorOnDemandScreen(
                onBack = { navController.popBackStack() },
                onNavigateToCall = { roomId ->
                    navController.navigate(
                        Route.VideoCall(
                            appointmentId = "",
                            roomId = roomId,
                            isIncomingCall = true,
                        )
                    ) {
                        launchSingleTop = true
                    }
                }
            )
        }

        composable<Route.DoctorPrescriptions> {
            com.autamedica.android.presentation.doctors.prescriptions.DoctorPrescriptionsScreen(
                onBack = { navController.popBackStack() },
                onNavigateToCreatePrescription = {
                    navController.navigate(Route.CreatePrescription(""))
                }
            )
        }

        composable<Route.CreatePrescription> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.CreatePrescription>()
            com.autamedica.android.presentation.doctors.prescriptions.CreatePrescriptionScreen(
                patientId = route.patientId,
                onBack = { navController.popBackStack() }
            )
        }

        composable<Route.DoctorCertificates> {
            com.autamedica.android.presentation.doctors.certificates.DoctorCertificatesScreen(
                onBack = { navController.popBackStack() },
                onNavigateToCreateCertificate = {
                    navController.navigate(Route.CreateCertificate(""))
                }
            )
        }

        composable<Route.CreateCertificate> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.CreateCertificate>()
            com.autamedica.android.presentation.doctors.certificates.CreateCertificateScreen(
                patientId = route.patientId,
                onBack = { navController.popBackStack() }
            )
        }

        composable<Route.DoctorMedicalOrders> {
            com.autamedica.android.presentation.doctors.medicalorders.DoctorMedicalOrdersScreen(
                onBack = { navController.popBackStack() },
                onNavigateToCreateOrder = {
                    navController.navigate(Route.CreateMedicalOrder(""))
                }
            )
        }

        composable<Route.CreateMedicalOrder> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.CreateMedicalOrder>()
            com.autamedica.android.presentation.doctors.medicalorders.CreateMedicalOrderScreen(
                patientId = route.patientId,
                onBack = { navController.popBackStack() }
            )
        }

        composable<Route.DoctorSignature> {
            com.autamedica.android.presentation.doctors.signature.DoctorSignatureScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable<Route.DoctorConsultationReport> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.DoctorConsultationReport>()
            com.autamedica.android.presentation.doctors.consultations.DoctorConsultationReportScreen(
                appointmentId = route.appointmentId,
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable<Route.DoctorAccounting> {
            com.autamedica.android.presentation.doctors.accounting.DoctorAccountingScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable<Route.TdahEvaluation> {
            com.autamedica.android.presentation.patients.psychiatry.TdahEvaluationScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable<Route.Prescriptions> {
            com.autamedica.android.presentation.prescriptions.PrescriptionsScreen(
                onBack = { navController.popBackStack() },
                onRequestConsultation = {
                    navController.popBackStack()
                }
            )
        }

        composable<Route.ClinicalDocuments> {
            com.autamedica.android.presentation.documents.ClinicalDocumentsScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
