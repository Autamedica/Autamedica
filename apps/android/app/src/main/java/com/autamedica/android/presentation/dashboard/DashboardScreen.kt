package com.autamedica.android.presentation.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.dashboard.components.AvailableDoctorsCarousel
import com.autamedica.android.presentation.dashboard.components.CompactServicesSection
import com.autamedica.android.presentation.dashboard.components.CoreCarePillarsRow
import com.autamedica.android.presentation.dashboard.components.MoreServicesBottomSheet
import com.autamedica.android.presentation.dashboard.components.NotificationsBottomSheet
import com.autamedica.android.presentation.dashboard.components.PatientDashboardHeader
import com.autamedica.android.presentation.dashboard.components.PatientHeroSection
import com.autamedica.android.presentation.dashboard.components.PatientWalletBottomSheet
import com.autamedica.android.presentation.dashboard.components.ProfileReadinessCompactBanner
import com.autamedica.android.presentation.dashboard.components.UpcomingAppointmentHeroCard
import com.autamedica.android.presentation.dashboard.components.WalletTopupDialog
import com.autamedica.android.presentation.theme.AuAccent

private const val PATIENT_TAB_CONSULT = 1

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToTab: (Int) -> Unit = {},
    onNavigateToPatientProfile: () -> Unit = {},
    onNavigateToAnamnesisForm: () -> Unit = {},
    onNavigateToConsultationReports: () -> Unit = {},
    onNavigateToPreventiveHealth: () -> Unit = {},
    onNavigateToBookAppointment: () -> Unit = {},
    onNavigateToPrescriptions: () -> Unit = {},
    onNavigateToCertificates: () -> Unit = onNavigateToPrescriptions,
    onNavigateToMedicalOrders: () -> Unit = onNavigateToPrescriptions,
    onNavigateToChatList: () -> Unit = {},
    onNavigateToClinicalDocuments: () -> Unit = {},
    onNavigateToChatConversation: (chatId: String) -> Unit = {},
    onNavigateToPsychiatry: () -> Unit = {},
    onNavigateToReproductiveHealth: () -> Unit = {},
    onNavigateToCommunity: () -> Unit = {},
    onNavigateToHealthReserve: () -> Unit = {},
    onOpenHealthReserveDetail: (tier: String, credits: Int, maxCap: Int) -> Unit = { _, _, _ -> },
    onNavigateToContinuityStatus: () -> Unit = {},
    onNavigateToPharmacyIntake: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current
    var showMoreServicesSheet by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.checkoutUrlToLaunch) {
        val url = uiState.checkoutUrlToLaunch
        if (!url.isNullOrBlank()) {
            runCatching { uriHandler.openUri(url) }
            viewModel.clearCheckoutUrl()
        }
    }

    val terminalStatuses = setOf(
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
    )
    val nextAppointment = uiState.appointments.firstOrNull { it.status !in terminalStatuses }
    val telemedicineCandidate = uiState.appointments.firstOrNull { it.isTelemedicineJoinCandidate() }
    val telemedicineAppointment = uiState.appointments.firstOrNull { it.id in uiState.joinableAppointmentIds }
    val isJoinableNow = nextAppointment?.id?.let { it in uiState.joinableAppointmentIds } == true

    val anamnesisProgress = uiState.anamnesisSummary?.completionPercentage ?: 0
    val profileProgress = remember(uiState.userName, uiState.userEmail, uiState.userPhone, uiState.patientSnapshot) {
        PatientHomeReadiness.calculateProfileProgress(
            userName = uiState.userName,
            userEmail = uiState.userEmail,
            userPhone = uiState.userPhone,
            patientSnapshot = uiState.patientSnapshot,
        )
    }
    val readinessNextStep = PatientHomeReadiness.nextStep(anamnesisProgress, profileProgress)
    val readinessPercentage = PatientHomeReadiness.combinedPercentage(anamnesisProgress, profileProgress)

    val openHealthReserve: () -> Unit = {
        onOpenHealthReserveDetail(
            uiState.subscriptionTier,
            uiState.benefitBalanceCredits,
            uiState.maxCapCredits,
        )
        onNavigateToHealthReserve()
    }

    Scaffold(
        topBar = {
            PatientDashboardHeader(
                userName = uiState.userName,
                subscriptionTier = uiState.subscriptionTier,
                subscriptionStatus = uiState.subscriptionStatus,
                walletBalanceCents = uiState.walletBalanceCents,
                walletCurrency = uiState.walletCurrency,
                hasUpcomingAppointment = nextAppointment != null,
                unreadNotificationsCount = uiState.unreadNotificationsCount,
                onWalletClick = { viewModel.setWalletSheetVisible(true) },
                onNotificationsClick = { viewModel.setNotificationsSheetVisible(true) },
                onProfileClick = onNavigateToPatientProfile,
            )
        },
        containerColor = Color(0xFFF8FAFC),
        modifier = modifier,
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = AuAccent, strokeWidth = 2.dp)
                    }
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        // 0. Priority #1 (Conditional): Upcoming or live appointment right on top
                        if (nextAppointment != null) {
                            item {
                                UpcomingAppointmentHeroCard(
                                    appointment = nextAppointment,
                                    isJoinableNow = isJoinableNow,
                                    onJoinCall = {
                                        when {
                                            telemedicineAppointment != null -> onNavigateToVideoCall(telemedicineAppointment.id)
                                            telemedicineCandidate != null -> onNavigateToVideoCall(telemedicineCandidate.id)
                                            else -> onNavigateToVideoCall(VIDEO_PREVIEW_APPOINTMENT_ID)
                                        }
                                    },
                                    onViewDetails = {
                                        onNavigateToBookAppointment()
                                    },
                                    joinError = uiState.telemedicineError,
                                )
                            }
                        }

                        // 1. Calm Hero Visual Anchor (keeps hero_patient_bg + clear 3-pillar promise)
                        item {
                            PatientHeroSection(
                                userName = uiState.userName,
                                subscriptionTier = uiState.subscriptionTier,
                                benefitBalanceCredits = uiState.benefitBalanceCredits,
                                onBookConsultation = {
                                    onNavigateToBookAppointment()
                                },
                                onOpenReserveDetails = openHealthReserve,
                                onPharmacyExpressClick = onNavigateToPharmacyIntake,
                            )
                        }

                        // 2. Core Care Pillars (Consultas · Recetas · Certificados — 1-second clarity)
                        item {
                            CoreCarePillarsRow(
                                onConsultationsClick = {
                                    if (telemedicineAppointment != null) {
                                        onNavigateToVideoCall(telemedicineAppointment.id)
                                    } else {
                                        onNavigateToTab(PATIENT_TAB_CONSULT)
                                    }
                                },
                                onPrescriptionsClick = onNavigateToPrescriptions,
                                onCertificatesClick = onNavigateToCertificates,
                            )
                        }

                        // 3. Available Doctors Carousel (visual trust anchor)
                        item {
                            AvailableDoctorsCarousel(
                                doctors = uiState.availableDoctors,
                                isLoading = uiState.doctorsLoading,
                                onDoctorClick = { _ ->
                                    onNavigateToBookAppointment()
                                },
                                onViewAllClick = {
                                    onNavigateToBookAppointment()
                                },
                            )
                        }

                        // 4. Single Contextual Readiness Bar (only if profile/anamnesis incomplete)
                        if (readinessNextStep != ReadinessNextStep.NONE) {
                            item {
                                ProfileReadinessCompactBanner(
                                    combinedPercentage = readinessPercentage,
                                    onClick = {
                                        when (readinessNextStep) {
                                            ReadinessNextStep.ANAMNESIS -> onNavigateToAnamnesisForm()
                                            ReadinessNextStep.PROFILE -> onNavigateToPatientProfile()
                                            ReadinessNextStep.NONE -> Unit
                                        }
                                    },
                                )
                            }
                        }

                        // 5. Compact Secondary Services (2x2 + BottomSheet for full catalog)
                        item {
                            CompactServicesSection(
                                onHistoryClick = onNavigateToConsultationReports,
                                onMentalHealthClick = onNavigateToPsychiatry,
                                onPreventionClick = onNavigateToPreventiveHealth,
                                onMoreServicesClick = { showMoreServicesSheet = true },
                            )
                        }

                        item {
                            Spacer(modifier = Modifier.height(16.dp))
                        }
                    }
                }
            }
        }
    }

    if (showMoreServicesSheet) {
        MoreServicesBottomSheet(
            onDismiss = { showMoreServicesSheet = false },
            onClinicalDocumentsClick = onNavigateToClinicalDocuments,
            onReproductiveHealthClick = onNavigateToReproductiveHealth,
            onContinuityClick = onNavigateToContinuityStatus,
            onCommunityClick = onNavigateToCommunity,
            onHealthReserveClick = openHealthReserve,
        )
    }

    // Wallet Bottom Sheet
    if (uiState.isWalletSheetOpen) {
        PatientWalletBottomSheet(
            walletBalanceCents = uiState.walletBalanceCents,
            walletCurrency = uiState.walletCurrency,
            freeConsultationsCount = uiState.freeConsultationsCount,
            onDismiss = { viewModel.setWalletSheetVisible(false) },
            onTopupClick = {
                viewModel.setWalletSheetVisible(false)
                viewModel.setTopupDialogVisible(true)
            },
            onReserveClick = {
                viewModel.setWalletSheetVisible(false)
                openHealthReserve()
            },
        )
    }

    // Top-up Dialog
    if (uiState.isTopupDialogOpen) {
        WalletTopupDialog(
            currency = uiState.walletCurrency,
            isLoading = uiState.isTopupLoading,
            errorMessage = uiState.topupError,
            onDismiss = { viewModel.setTopupDialogVisible(false) },
            onConfirmTopup = { amount ->
                viewModel.topupWallet(amount)
            },
        )
    }

    // Notifications Bottom Sheet
    if (uiState.isNotificationsSheetOpen) {
        NotificationsBottomSheet(
            notifications = uiState.notifications,
            unreadCount = uiState.unreadNotificationsCount,
            onDismiss = { viewModel.setNotificationsSheetVisible(false) },
            onNotificationClick = { notification ->
                viewModel.markNotificationAsRead(notification.id)
                viewModel.setNotificationsSheetVisible(false)
                when (val dest = PatientNotificationActionResolver.resolve(notification)) {
                    is PatientNotificationDestination.VideoCall -> onNavigateToVideoCall(dest.appointmentId)
                    is PatientNotificationDestination.ChatConversation -> onNavigateToChatConversation(dest.chatId)
                    PatientNotificationDestination.ChatList -> onNavigateToChatList()
                    PatientNotificationDestination.Prescriptions -> onNavigateToPrescriptions()
                    PatientNotificationDestination.Certificates -> onNavigateToCertificates()
                    PatientNotificationDestination.MedicalOrders -> onNavigateToMedicalOrders()
                    PatientNotificationDestination.ClinicalDocuments -> onNavigateToClinicalDocuments()
                    PatientNotificationDestination.ContinuityStatus -> onNavigateToContinuityStatus()
                    PatientNotificationDestination.Community -> onNavigateToCommunity()
                    PatientNotificationDestination.Profile -> onNavigateToPatientProfile()
                    PatientNotificationDestination.Appointments -> onNavigateToBookAppointment()
                }
            },
            onMarkAllAsRead = viewModel::markAllNotificationsAsRead,
        )
    }
}
