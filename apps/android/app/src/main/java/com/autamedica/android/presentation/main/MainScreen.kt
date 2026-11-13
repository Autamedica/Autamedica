package com.autamedica.android.presentation.main

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.presentation.appointments.AppointmentsScreen
import com.autamedica.android.presentation.consultation.ConsultationHubScreen
import com.autamedica.android.presentation.dashboard.DashboardScreen
import com.autamedica.android.presentation.dashboard.DoctorDashboardScreen
import com.autamedica.android.presentation.patients.PatientsScreen
import com.autamedica.android.presentation.profile.ProfileScreen
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import timber.log.Timber

import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.outlined.Email
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.LogoObsidianBg
import com.autamedica.android.presentation.theme.LogoRingBorder
import com.autamedica.android.presentation.theme.PortalPatients

import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.patients.community.PatientCommunityScreen
import com.autamedica.android.presentation.prescriptions.PrescriptionsScreen
import com.autamedica.android.presentation.health.HealthReserveDetailScreen

private data class TabItem(
    val labelRes: Int,
    val iconRes: Int,
)

private data class PatientTabItem(
    val labelRes: Int,
    val icon: ImageVector,
)

// Patient tabs matching Web/iOS 1:1 (Início, Agenda, Consultar, Receitas, Comunidade)
private val patientTabs = listOf(
    PatientTabItem(R.string.nav_patient_home, Icons.Outlined.FavoriteBorder),
    PatientTabItem(R.string.nav_patient_agenda, Icons.Outlined.CalendarMonth),
    PatientTabItem(R.string.nav_patient_consult, Icons.Outlined.Videocam),
    PatientTabItem(R.string.nav_patient_prescriptions, Icons.Outlined.Description),
    PatientTabItem(R.string.nav_patient_community, Icons.Outlined.Groups),
)

// Doctor tabs
private val doctorTabs = listOf(
    TabItem(R.string.doctor_tab_home, R.drawable.ic_home_outline),
    TabItem(R.string.doctor_tab_messages, R.drawable.ic_chat_outline),
    TabItem(R.string.doctor_tab_appointments, R.drawable.ic_calendar_outline),
    TabItem(R.string.doctor_tab_patients, R.drawable.ic_medical_cross_outline),
    TabItem(R.string.doctor_tab_profile, R.drawable.ic_profile_outline),
)

@Composable
fun MainScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToLogin: () -> Unit,
    onNavigateToPatientDetail: (patientId: String) -> Unit = {},
    onNavigateToChatConversation: (chatId: String) -> Unit = {},
    onNavigateToAnamnesisForm: () -> Unit = {},
    onNavigateToPreventiveHealth: () -> Unit = {},
    onNavigateToBookAppointment: () -> Unit = {},
    onNavigateToPrescriptions: () -> Unit = {},
    onNavigateToClinicalDocuments: () -> Unit = {},
    onNavigateToPsychiatry: () -> Unit = {},
    onNavigateToReproductiveHealth: () -> Unit = {},
    onNavigateToCommunity: () -> Unit = {},
    onNavigateToContinuityStatus: () -> Unit = {},
    onNavigateToDoctorSignature: () -> Unit = {},
    onNavigateToDoctorPrescriptions: () -> Unit = {},
    onNavigateToDoctorCertificates: () -> Unit = {},
    onNavigateToDoctorMedicalOrders: () -> Unit = {},
    onNavigateToDoctorOnDemand: () -> Unit = {},
    onNavigateToPatientProfile: () -> Unit = {},
    onNavigateToPharmacyIntake: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: MainViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    var showHealthReserveDetail by rememberSaveable { mutableStateOf(false) }
    var reserveSubscriptionTier by rememberSaveable { mutableStateOf("free") }
    var reserveBalanceCredits by rememberSaveable { mutableIntStateOf(0) }
    var reserveMaxCapCredits by rememberSaveable { mutableIntStateOf(0) }

    val isDoctor = uiState.userRole == com.autamedica.android.domain.model.UserRole.DOCTOR
    val isWebPortal = uiState.userRole != com.autamedica.android.domain.model.UserRole.DOCTOR && uiState.userRole != com.autamedica.android.domain.model.UserRole.PATIENT
    val accentColor = if (isDoctor) PortalDoctors else com.autamedica.android.presentation.theme.PortalPatients

    if (isWebPortal) {
        WebPortalRedirectScreen(
            userRole = uiState.userRole,
            onLogout = viewModel::logout,
            modifier = modifier,
        )
        return
    }

    // ── Android 13+ notification permission ──
    val context = LocalContext.current
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        Timber.d("[Notifications] POST_NOTIFICATIONS permission granted=$granted")
    }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!hasPermission) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    LaunchedEffect(uiState.isLoggedOut) {
        if (uiState.isLoggedOut) {
            onNavigateToLogin()
        }
    }

    var lastBackPressTime by remember { mutableLongStateOf(0L) }

    // ── BackHandler: cierra HealthReserveDetail con prioridad máxima ──
    BackHandler(enabled = showHealthReserveDetail) {
        showHealthReserveDetail = false
    }

    // ── Phone Back Button Hierarchical Navigation ──
    // Patient: Any screen/tab (Comunidad/Recetas/Agenda) -> Consultar (tab 2) -> Inicio (tab 0) -> Exit app
    if (!isDoctor) {
        BackHandler(enabled = selectedTab != 0) {
            val now = System.currentTimeMillis()
            if (now - lastBackPressTime < 350L) {
                Timber.d("[BackNav] Ignored duplicate back event (debounce)")
                return@BackHandler
            }
            lastBackPressTime = now
            Timber.i("[BackNav] Hardware back pressed. Current tab=%d", selectedTab)
            if (selectedTab != 2) {
                // 1er click en regresar: lleva a Consultar (tab 2)
                Timber.i("[BackNav] Step 1: Navigating to Consultar (tab 2)")
                selectedTab = 2
            } else {
                // 2do click en regresar: lleva a Inicio (tab 0)
                Timber.i("[BackNav] Step 2: Navigating to Inicio (tab 0)")
                selectedTab = 0
            }
            // 3er click en regresar: cuando ya está en Inicio (selectedTab == 0), enabled es false y sale de la app
        }
    } else {
        BackHandler(enabled = selectedTab != 0) {
            selectedTab = 0
        }
    }

    Scaffold(
        bottomBar = {
            NavigationBar(
                    containerColor = Color.White,
                    modifier = Modifier.drawBehind {
                        drawLine(
                            color = Color(0x1F0EA5E9), // rgba(14, 165, 233, 0.12)
                            start = androidx.compose.ui.geometry.Offset(0f, 0f),
                            end = androidx.compose.ui.geometry.Offset(size.width, 0f),
                            strokeWidth = 1.dp.toPx(),
                        )
                    },
                    tonalElevation = 0.dp,
                ) {
                    if (isDoctor) {
                        doctorTabs.forEachIndexed { index, tab ->
                            val isSelected = selectedTab == index
                            NavigationBarItem(
                                selected = isSelected,
                                onClick = { selectedTab = index },
                                icon = {
                                    Icon(
                                        painter = painterResource(id = tab.iconRes),
                                        contentDescription = stringResource(tab.labelRes),
                                        modifier = Modifier.size(24.dp),
                                    )
                                },
                                label = {
                                    Text(
                                        text = stringResource(tab.labelRes),
                                        style = MaterialTheme.typography.labelSmall,
                                        maxLines = 2,
                                        textAlign = TextAlign.Center,
                                        overflow = TextOverflow.Ellipsis,
                                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = accentColor,
                                    selectedTextColor = accentColor,
                                    unselectedIconColor = Color(0xFF64748B),
                                    unselectedTextColor = Color(0xFF64748B),
                                    indicatorColor = Color.Transparent,
                                ),
                            )
                        }
                    } else {
                        patientTabs.forEachIndexed { index, tab ->
                            val isSelected = selectedTab == index
                            NavigationBarItem(
                                selected = isSelected,
                                onClick = { selectedTab = index },
                                icon = {
                                    Icon(
                                        imageVector = tab.icon,
                                        contentDescription = stringResource(tab.labelRes),
                                        modifier = Modifier.size(24.dp),
                                    )
                                },
                                label = {
                                    Text(
                                        text = stringResource(tab.labelRes),
                                        style = MaterialTheme.typography.labelSmall,
                                        maxLines = 2,
                                        softWrap = true,
                                        textAlign = TextAlign.Center,
                                        overflow = TextOverflow.Ellipsis,
                                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = Color(0xFF0284C7),
                                    selectedTextColor = Color(0xFF0284C7),
                                    unselectedIconColor = Color(0xFF64748B),
                                    unselectedTextColor = Color(0xFF64748B),
                                    indicatorColor = Color.Transparent,
                                ),
                            )
                        }
                    }
                }
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { contentPadding ->
        Box(modifier = Modifier.padding(bottom = contentPadding.calculateBottomPadding())) {
            if (isDoctor) {
                // Doctor experience
                when (selectedTab) {
                    0 -> DoctorDashboardScreen(
                        onNavigateToVideoCall = onNavigateToVideoCall,
                        onNavigateToTab = { selectedTab = it },
                        onNavigateToDoctorSignature = onNavigateToDoctorSignature,
                        onNavigateToDoctorPrescriptions = onNavigateToDoctorPrescriptions,
                        onNavigateToDoctorCertificates = onNavigateToDoctorCertificates,
                        onNavigateToDoctorMedicalOrders = onNavigateToDoctorMedicalOrders,
                        onNavigateToDoctorOnDemand = onNavigateToDoctorOnDemand,
                    )
                    1 -> com.autamedica.android.presentation.chat.ChatListScreen(
                        onNavigateToConversation = onNavigateToChatConversation,
                    )
                    2 -> AppointmentsScreen(
                        onNavigateToVideoCall = onNavigateToVideoCall,
                    )
                    3 -> PatientsScreen(
                        onNavigateToPatientDetail = onNavigateToPatientDetail,
                    )
                    4 -> ProfileScreen(
                        onLogout = viewModel::logout,
                    )
                }
            } else {
                // Patient experience matching Web/iOS bottom navigation
                if (showHealthReserveDetail) {
                    HealthReserveDetailScreen(
                        subscriptionTier = reserveSubscriptionTier,
                        benefitBalanceCredits = reserveBalanceCredits,
                        maxCapCredits = reserveMaxCapCredits,
                        onBack = { showHealthReserveDetail = false },
                    )
                } else {
                    when (selectedTab) {
                        0 -> DashboardScreen(
                            onNavigateToVideoCall = onNavigateToVideoCall,
                            onNavigateToTab = { selectedTab = it },
                            onNavigateToPatientProfile = onNavigateToPatientProfile,
                            onNavigateToAnamnesisForm = onNavigateToAnamnesisForm,
                            onNavigateToPreventiveHealth = onNavigateToPreventiveHealth,
                            onNavigateToBookAppointment = { selectedTab = 1 },
                            onNavigateToPrescriptions = onNavigateToPrescriptions,
                            onNavigateToClinicalDocuments = onNavigateToClinicalDocuments,
                            onNavigateToChatConversation = onNavigateToChatConversation,
                            onNavigateToPsychiatry = onNavigateToPsychiatry,
                            onNavigateToReproductiveHealth = onNavigateToReproductiveHealth,
                            onNavigateToCommunity = onNavigateToCommunity,
                            onNavigateToContinuityStatus = onNavigateToContinuityStatus,
                            onNavigateToHealthReserve = { showHealthReserveDetail = true },
                            onOpenHealthReserveDetail = { tier, credits, maxCap ->
                                reserveSubscriptionTier = tier
                                reserveBalanceCredits = credits
                                reserveMaxCapCredits = maxCap
                                showHealthReserveDetail = true
                            },
                            onNavigateToPharmacyIntake = onNavigateToPharmacyIntake,
                        )
                        1 -> AppointmentsScreen(
                            onNavigateToVideoCall = onNavigateToVideoCall,
                            onNavigateToBookAppointment = { selectedTab = 1 },
                        )
                        2 -> ConsultationHubScreen(
                            onNavigateToVideoCall = onNavigateToVideoCall,
                            onNavigateToBookAppointment = { selectedTab = 1 },
                            // Use the real country-isolated dispatch queue instead of
                            // booking the first directory doctor as immediately on duty.
                            onNavigateToPharmacyIntake = onNavigateToPharmacyIntake,
                        )
                        3 -> PrescriptionsScreen(
                            onBack = { selectedTab = 2 },
                        )
                        4 -> PatientCommunityScreen(
                            onBack = { selectedTab = 2 },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WebPortalRedirectScreen(
    userRole: com.autamedica.android.domain.model.UserRole,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uriHandler = LocalUriHandler.current
    val portalUrl = when (userRole) {
        com.autamedica.android.domain.model.UserRole.COMPANY,
        com.autamedica.android.domain.model.UserRole.COMPANY_ADMIN -> "https://empresa.autamedica.com"
        com.autamedica.android.domain.model.UserRole.PHARMACIST -> "https://farmacia.autamedica.com"
        else -> "https://admin.autamedica.com"
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(AuBackground)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = AuSurface,
            border = BorderStroke(1.dp, AuBorder),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Surface(
                    modifier = Modifier.size(80.dp),
                    shape = RoundedCornerShape(24.dp),
                    color = LogoObsidianBg,
                    border = BorderStroke(1.dp, LogoRingBorder),
                    shadowElevation = 12.dp,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Image(
                            painter = painterResource(id = R.drawable.logo_autamedica),
                            contentDescription = "AutaMedica",
                            modifier = Modifier
                                .size(54.dp)
                                .clip(RoundedCornerShape(12.dp)),
                        )
                    }
                }

                Text(
                    text = stringResource(R.string.portal_redirect_title, userRole.displayName),
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )

                Text(
                    text = stringResource(R.string.portal_redirect_desc),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                    textAlign = TextAlign.Center,
                )

                Button(
                    onClick = { uriHandler.openUri(portalUrl) },
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients,
                        contentColor = Color.White,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    Text(stringResource(R.string.portal_redirect_open_browser), fontWeight = FontWeight.SemiBold)
                }

                OutlinedButton(
                    onClick = onLogout,
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    Text(stringResource(R.string.portal_redirect_logout), color = AuTextSecondary)
                }
            }
        }
    }
}

