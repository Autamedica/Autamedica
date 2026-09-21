package com.autamedica.android.presentation.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.dashboard.components.AvailableDoctorsCarousel
import com.autamedica.android.presentation.dashboard.components.NotificationsBottomSheet
import com.autamedica.android.presentation.dashboard.components.ChecklistItem
import com.autamedica.android.presentation.dashboard.components.ClinicalServicesGrid
import com.autamedica.android.presentation.dashboard.components.HealthReserveCard
import com.autamedica.android.presentation.dashboard.components.OnboardingChecklistSection
import com.autamedica.android.presentation.dashboard.components.PatientDashboardHeader
import com.autamedica.android.presentation.dashboard.components.PatientHeroSection
import com.autamedica.android.presentation.dashboard.components.PatientWalletBottomSheet
import com.autamedica.android.presentation.dashboard.components.ReadinessMetricsSection
import com.autamedica.android.presentation.dashboard.components.UpcomingAppointmentHeroCard
import com.autamedica.android.presentation.dashboard.components.WalletTopupDialog
import com.autamedica.android.presentation.theme.AuAccent

private const val PATIENT_TAB_APPOINTMENTS = 1
private const val PATIENT_TAB_CONSULT = 2
private const val PATIENT_TAB_PRESCRIPTIONS = 3
private const val PATIENT_TAB_COMMUNITY = 4

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToTab: (Int) -> Unit = {},
    onNavigateToPatientProfile: () -> Unit = {},
    onNavigateToAnamnesisForm: () -> Unit = {},
    onNavigateToPreventiveHealth: () -> Unit = {},
    onNavigateToBookAppointment: () -> Unit = {},
    onNavigateToPrescriptions: () -> Unit = {},
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
        var score = 0
        if (uiState.userName.isNotBlank()) score += 25
        if (uiState.userEmail.isNotBlank()) score += 25
        if (!uiState.userPhone.isNullOrBlank()) score += 20
        if (!uiState.patientSnapshot?.birthDate.isNullOrBlank()) score += 15
        if (!uiState.patientSnapshot?.gender.isNullOrBlank()) score += 15
        score.coerceAtMost(100)
    }
    val isReadinessCompleted = anamnesisProgress >= 80 && profileProgress >= 70

    // Auto-collapse Health Reserve banner after 5 seconds (matching Web PatientsHomePage.tsx)
    LaunchedEffect(uiState.showReserveBanner) {
        if (uiState.showReserveBanner) {
            delay(5000L)
            viewModel.toggleReserveBanner(false)
        }
    }

    val checklistItems = remember(uiState.userName, uiState.userEmail, uiState.userPhone, uiState.patientSnapshot, uiState.anamnesisSummary) {
        listOf(
            ChecklistItem(
                id = 1,
                label = "Nombre",
                isCompleted = uiState.userName.trim().split(" ").filter { it.isNotBlank() }.size >= 2,
                onClick = onNavigateToPatientProfile,
            ),
            ChecklistItem(
                id = 2,
                label = "Email",
                isCompleted = uiState.userEmail.isNotBlank(),
                onClick = onNavigateToPatientProfile,
            ),
            ChecklistItem(
                id = 3,
                label = "Fecha de nacimiento",
                isCompleted = !uiState.patientSnapshot?.birthDate.isNullOrBlank(),
                onClick = onNavigateToPatientProfile,
            ),
            ChecklistItem(
                id = 4,
                label = "Teléfono",
                isCompleted = !uiState.userPhone.isNullOrBlank(),
                onClick = onNavigateToPatientProfile,
            ),
            ChecklistItem(
                id = 5,
                label = "Género",
                isCompleted = !uiState.patientSnapshot?.gender.isNullOrBlank(),
                onClick = onNavigateToPatientProfile,
            ),
            ChecklistItem(
                id = 6,
                label = "Ficha médica",
                isCompleted = anamnesisProgress >= 80,
                onClick = onNavigateToAnamnesisForm,
            ),
        )
    }

    val onOpenPharmacyExpress: () -> Unit = {
        onNavigateToPharmacyIntake()
    }

    Scaffold(
        topBar = {
            PatientDashboardHeader(
                userName = uiState.userName,
                subscriptionTier = uiState.subscriptionTier,
                subscriptionStatus = uiState.subscriptionStatus,
                walletBalanceCents = uiState.walletBalanceCents,
                hasUpcomingAppointment = nextAppointment != null,
                unreadNotificationsCount = uiState.unreadNotificationsCount,
                onWalletClick = { viewModel.setWalletSheetVisible(true) },
                onNotificationsClick = { viewModel.setNotificationsSheetVisible(true) },
                onProfileClick = onNavigateToPatientProfile,
            )
        },
        containerColor = Color.White,
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
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        // 1. Hero Visual Anchor
                        item {
                            PatientHeroSection(
                                userName = uiState.userName,
                                subscriptionTier = uiState.subscriptionTier,
                                benefitBalanceCredits = uiState.benefitBalanceCredits,
                                onBookConsultation = {
                                    onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                                },
                                onOpenReserveDetails = {
                                    onOpenHealthReserveDetail(
                                        uiState.subscriptionTier,
                                        uiState.benefitBalanceCredits,
                                        uiState.maxCapCredits,
                                    )
                                    onNavigateToHealthReserve()
                                },
                                onPharmacyExpressClick = onOpenPharmacyExpress,
                            )
                        }

                        // 2. Available Doctors Horizontal Carousel
                        item {
                            AvailableDoctorsCarousel(
                                doctors = uiState.availableDoctors,
                                isLoading = uiState.doctorsLoading,
                                onDoctorClick = { _ ->
                                    onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                                },
                                onViewAllClick = {
                                    onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                                },
                            )
                        }

                        // 3. Health Reserve / Subscription Banner
                        item {
                            HealthReserveCard(
                                subscriptionTier = uiState.subscriptionTier,
                                benefitBalanceCredits = uiState.benefitBalanceCredits,
                                maxCapCredits = uiState.maxCapCredits,
                                isVisible = uiState.showReserveBanner,
                                onToggleVisibility = viewModel::toggleReserveBanner,
                                onSubscribeClick = {
                                    onOpenHealthReserveDetail(
                                        uiState.subscriptionTier,
                                        uiState.benefitBalanceCredits,
                                        uiState.maxCapCredits,
                                    )
                                    onNavigateToHealthReserve()
                                },
                                onViewDetailsClick = {
                                    onOpenHealthReserveDetail(
                                        uiState.subscriptionTier,
                                        uiState.benefitBalanceCredits,
                                        uiState.maxCapCredits,
                                    )
                                    onNavigateToHealthReserve()
                                },
                            )
                        }

                        // 4. Status & Readiness / Metrics
                        item {
                            ReadinessMetricsSection(
                                anamnesisProgress = anamnesisProgress,
                                profileProgress = profileProgress,
                                isCompleted = isReadinessCompleted,
                                onPrimaryAction = {
                                    if (!isReadinessCompleted) {
                                        onNavigateToAnamnesisForm()
                                    } else {
                                        onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                                    }
                                },
                            )
                        }

                        // 5. Upcoming Appointment Hero (if scheduled)
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
                                        onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                                    },
                                    joinError = uiState.telemedicineError,
                                )
                            }
                        }

                        // 6. Onboarding Profile Checklist
                        if (checklistItems.any { !it.isCompleted }) {
                            item {
                                OnboardingChecklistSection(items = checklistItems)
                            }
                        }

                        // 7. Clinical Services Grid (All 9 services matching Web!)
                        item {
                            ClinicalServicesGrid(
                                onOnlineDoctorClick = {
                                    when {
                                        telemedicineAppointment != null -> onNavigateToVideoCall(telemedicineAppointment.id)
                                        telemedicineCandidate != null -> onNavigateToVideoCall(telemedicineCandidate.id)
                                        else -> onNavigateToVideoCall(VIDEO_PREVIEW_APPOINTMENT_ID)
                                    }
                                },
                                onSubscriptionClick = {
                                    viewModel.toggleReserveBanner(true)
                                },
                                onScheduleClick = {
                                    onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                                },
                                onPrescriptionsClick = {
                                    onNavigateToPrescriptions()
                                },
                                onHistoryClick = {
                                    onNavigateToAnamnesisForm()
                                },
                                onMentalHealthClick = {
                                    onNavigateToPsychiatry()
                                },
                                onPreventionClick = {
                                    onNavigateToPreventiveHealth()
                                },
                                onReproductiveHealthClick = {
                                    onNavigateToReproductiveHealth()
                                },
                                onCommunityClick = {
                                    onNavigateToCommunity()
                                },
                                onContinuityClick = {
                                    onNavigateToContinuityStatus()
                                },
                                onPharmacyExpressClick = onOpenPharmacyExpress,
                            )
                        }

                        item {
                            Spacer(modifier = Modifier.height(24.dp))
                        }
                    }
                }
            }
        }
    }

    // Wallet Bottom Sheet
    if (uiState.isWalletSheetOpen) {
        PatientWalletBottomSheet(
            walletBalanceCents = uiState.walletBalanceCents,
            freeConsultationsCount = uiState.freeConsultationsCount,
            onDismiss = { viewModel.setWalletSheetVisible(false) },
            onTopupClick = {
                viewModel.setWalletSheetVisible(false)
                viewModel.setTopupDialogVisible(true)
            },
            onReserveClick = {
                viewModel.setWalletSheetVisible(false)
                viewModel.toggleReserveBanner(true)
            },
        )
    }

    // Top-up Dialog
    if (uiState.isTopupDialogOpen) {
        WalletTopupDialog(
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
                when (notification.category?.lowercase()) {
                    "appointment" -> onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                    "prescription" -> onNavigateToPrescriptions()
                    "community" -> onNavigateToCommunity()
                    "chat", "message" -> onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                    else -> onNavigateToTab(PATIENT_TAB_APPOINTMENTS)
                }
            },
            onMarkAllAsRead = viewModel::markAllNotificationsAsRead,
        )
    }
}
