package com.autamedica.android.presentation.main

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
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
import com.autamedica.android.presentation.dashboard.DashboardScreen
import com.autamedica.android.presentation.dashboard.DoctorDashboardScreen
import com.autamedica.android.presentation.health.HealthScreen
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

private data class TabItem(
    val labelRes: Int,
    val iconRes: Int,
)

// Patient tabs
private val patientTabs = listOf(
    TabItem(R.string.nav_home, R.drawable.ic_home_outline),
    TabItem(R.string.nav_messages, R.drawable.ic_chat_outline),
    TabItem(R.string.nav_appointments, R.drawable.ic_calendar_outline),
    TabItem(R.string.nav_health, R.drawable.ic_medical_cross_outline),
    TabItem(R.string.nav_profile, R.drawable.ic_profile_outline),
)

// Doctor tabs
private val doctorTabs = listOf(
    TabItem(R.string.nav_home, R.drawable.ic_home_outline),
    TabItem(R.string.nav_messages, R.drawable.ic_chat_outline),
    TabItem(R.string.nav_appointments, R.drawable.ic_calendar_outline),
    TabItem(R.string.nav_patients, R.drawable.ic_medical_cross_outline),
    TabItem(R.string.nav_profile, R.drawable.ic_profile_outline),
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
    modifier: Modifier = Modifier,
    viewModel: MainViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }

    val isDoctor = uiState.userRole == com.autamedica.android.domain.model.UserRole.DOCTOR
    val isWebPortal = uiState.userRole != com.autamedica.android.domain.model.UserRole.DOCTOR && uiState.userRole != com.autamedica.android.domain.model.UserRole.PATIENT
    val tabs = if (isDoctor) doctorTabs else patientTabs
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

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = AuSurface,
            ) {
                tabs.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        icon = {
                            Icon(
                                painter = painterResource(id = tab.iconRes),
                                contentDescription = stringResource(tab.labelRes),
                            )
                        },
                        label = {
                            Text(
                                text = stringResource(tab.labelRes),
                                fontWeight = if (selectedTab == index) FontWeight.SemiBold
                                else FontWeight.Normal,
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = accentColor,
                            selectedTextColor = accentColor,
                            unselectedIconColor = AuTextTertiary,
                            unselectedTextColor = AuTextTertiary,
                            indicatorColor = AuSurfaceHover,
                        ),
                    )
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
                // Patient experience
                when (selectedTab) {
                    0 -> DashboardScreen(
                        onNavigateToVideoCall = onNavigateToVideoCall,
                        onNavigateToTab = { selectedTab = it },
                        onNavigateToAnamnesisForm = onNavigateToAnamnesisForm,
                        onNavigateToPreventiveHealth = onNavigateToPreventiveHealth,
                    )
                    1 -> com.autamedica.android.presentation.chat.ChatListScreen(
                        onNavigateToConversation = onNavigateToChatConversation,
                    )
                    2 -> AppointmentsScreen(
                        onNavigateToVideoCall = onNavigateToVideoCall,
                        onNavigateToBookAppointment = onNavigateToBookAppointment,
                    )
                    3 -> HealthScreen(
                        onNavigateToAnamnesisForm = onNavigateToAnamnesisForm,
                        onNavigateToPreventiveHealth = onNavigateToPreventiveHealth,
                        onNavigateToPrescriptions = onNavigateToPrescriptions,
                        onNavigateToClinicalDocuments = onNavigateToClinicalDocuments,
                    )
                    4 -> ProfileScreen(
                        onLogout = viewModel::logout,
                    )
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
                    text = "Portal ${userRole.displayName}",
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )

                Text(
                    text = "Las funciones de gestión y administración para tu cuenta están optimizadas para la plataforma web de escritorio.",
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
                    Text("Abrir Portal en el Navegador", fontWeight = FontWeight.SemiBold)
                }

                OutlinedButton(
                    onClick = onLogout,
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    Text("Cerrar Sesión", color = AuTextSecondary)
                }
            }
        }
    }
}

