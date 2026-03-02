package com.autamedica.android.presentation.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.autamedica.android.presentation.dashboard.components.AppointmentCard
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PrimaryLight

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToVideoCall: (appointmentId: String, userId: String, userType: String, userName: String) -> Unit,
    onNavigateToProfile: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "AutaMedica",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.5).sp,
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
                actions = {
                    IconButton(onClick = onNavigateToProfile) {
                        Surface(
                            modifier = Modifier.size(36.dp),
                            shape = CircleShape,
                            color = AuSurface,
                        ) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = "Perfil",
                                modifier = Modifier.padding(8.dp),
                                tint = AuTextSecondary,
                            )
                        }
                    }
                    IconButton(onClick = viewModel::logout) {
                        Icon(
                            Icons.AutoMirrored.Filled.ExitToApp,
                            contentDescription = "Cerrar sesion",
                            tint = AuTextTertiary,
                        )
                    }
                }
            )
        },
        containerColor = AuBackground,
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

                uiState.error != null -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(32.dp),
                        ) {
                            Surface(
                                modifier = Modifier.size(64.dp),
                                shape = CircleShape,
                                color = ErrorContainer,
                            ) {
                                Icon(
                                    Icons.Outlined.EventBusy,
                                    contentDescription = null,
                                    modifier = Modifier.padding(16.dp),
                                    tint = AuDanger,
                                )
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = uiState.error ?: "Error",
                                color = AuDanger,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Deslizar hacia abajo para reintentar",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                }

                uiState.appointments.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(32.dp),
                        ) {
                            Surface(
                                modifier = Modifier.size(80.dp),
                                shape = CircleShape,
                                color = AuSurface,
                            ) {
                                Icon(
                                    Icons.Outlined.CalendarMonth,
                                    contentDescription = null,
                                    modifier = Modifier.padding(20.dp),
                                    tint = AuTextSecondary,
                                )
                            }
                            Spacer(modifier = Modifier.height(20.dp))
                            Text(
                                text = "Sin consultas programadas",
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Las proximas consultas apareceran aqui",
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextTertiary,
                            )
                        }
                    }
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        item {
                            Column(modifier = Modifier.padding(bottom = 4.dp)) {
                                Text(
                                    text = if (uiState.userName.isNotBlank()) "Hola, ${uiState.userName}"
                                        else "Bienvenido",
                                    style = MaterialTheme.typography.headlineMedium,
                                    color = AuTextPrimary,
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "Tus proximas consultas",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = AuTextSecondary,
                                )
                            }
                        }

                        items(uiState.appointments, key = { it.id }) { appointment ->
                            AppointmentCard(
                                appointment = appointment,
                                onJoinCall = if (appointment.meetingUrl != null) {
                                    {
                                        onNavigateToVideoCall(
                                            appointment.id,
                                            uiState.userId,
                                            uiState.userRole,
                                            uiState.userName,
                                        )
                                    }
                                } else null,
                            )
                        }
                    }
                }
            }
        }
    }
}
