package com.autamedica.android.presentation.main

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
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

import androidx.compose.ui.res.painterResource

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
    modifier: Modifier = Modifier,
    viewModel: MainViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }

    val isDoctor = uiState.userRole.wireName == "doctor"
    val tabs = if (isDoctor) doctorTabs else patientTabs
    val accentColor = if (isDoctor) PortalDoctors else AuAccent

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
                    )
                    1 -> com.autamedica.android.presentation.chat.ChatListScreen(
                        onNavigateToConversation = onNavigateToChatConversation,
                    )
                    2 -> AppointmentsScreen(
                        onNavigateToVideoCall = onNavigateToVideoCall,
                    )
                    3 -> HealthScreen(
                        onNavigateToAnamnesisForm = onNavigateToAnamnesisForm,
                    )
                    4 -> ProfileScreen(
                        onLogout = viewModel::logout,
                    )
                }
            }
        }
    }
}
