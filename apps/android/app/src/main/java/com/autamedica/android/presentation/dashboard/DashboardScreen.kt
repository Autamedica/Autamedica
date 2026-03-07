package com.autamedica.android.presentation.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.PatientPreventiveProfile
import com.autamedica.android.domain.model.anamnesisDisplayStatus
import com.autamedica.android.domain.model.isAnamnesisSummaryReadOnly
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.navigation.VIDEO_PREVIEW_APPOINTMENT_ID
import com.autamedica.android.presentation.health.normalizePreventiveGender
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.AuWarning
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.Secondary
import com.autamedica.android.presentation.theme.SecondaryContainer
import com.autamedica.android.presentation.theme.SuccessContainer
import com.autamedica.android.presentation.theme.WarningContainer
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val PATIENT_TAB_APPOINTMENTS = 2
private const val PATIENT_TAB_HEALTH = 3
private const val PATIENT_TAB_PROFILE = 4

private data class HomeStat(
    val label: String,
    val value: String,
    val accent: Color,
    val container: Color,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToTab: (Int) -> Unit = {},
    onNavigateToAnamnesisForm: () -> Unit = {},
    onNavigateToPreventiveHealth: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Inicio",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.5).sp,
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBackground),
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

                else -> {
                    val nextAppointment = uiState.appointments.firstOrNull()
                    val telemedicineCandidate = uiState.appointments.firstOrNull { it.isTelemedicineJoinCandidate() }
                    val telemedicineAppointment = uiState.appointments.firstOrNull { it.id in uiState.joinableAppointmentIds }
                    val priorityText = buildPriorityMessage(
                        nextAppointment = nextAppointment,
                        telemedicineAppointment = telemedicineAppointment,
                        preventiveProfile = uiState.preventiveProfile,
                        anamnesisSummary = uiState.anamnesisSummary,
                    )
                    val stats = buildHomeStats(
                        appointments = uiState.appointments,
                        joinableCount = uiState.joinableAppointmentIds.size,
                        anamnesisSummary = uiState.anamnesisSummary,
                    )

                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        item {
                            HeaderSection(
                                userName = uiState.userName,
                                priorityText = priorityText,
                            )
                        }

                        if (uiState.error != null) {
                            item {
                                DashboardBanner(
                                    title = "No pudimos actualizar tu agenda",
                                    message = uiState.error ?: "Error desconocido.",
                                    accent = AuDanger,
                                    container = ErrorContainer,
                                )
                            }
                        }

                        item {
                            PriorityActionCard(
                                nextAppointment = nextAppointment,
                                joinableNow = nextAppointment?.id?.let { id ->
                                    id in uiState.joinableAppointmentIds
                                } == true,
                                onOpenAppointments = { onNavigateToTab(PATIENT_TAB_APPOINTMENTS) },
                                onJoinCall = nextAppointment?.let { appointment ->
                                    { onNavigateToVideoCall(appointment.id) }
                                },
                            )
                        }

                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                stats.forEach { stat ->
                                    MetricCard(
                                        stat = stat,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }

                        item {
                            SectionTitle("Acciones de hoy")
                        }

                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                TodayActionCard(
                                    icon = Icons.Default.Videocam,
                                    title = "Telemedicina",
                                    status = telemedicineStatusLabel(
                                        appointment = telemedicineAppointment,
                                        candidate = telemedicineCandidate,
                                    ),
                                    description = telemedicineDescription(
                                        appointment = telemedicineAppointment,
                                        candidate = telemedicineCandidate,
                                        error = uiState.telemedicineError,
                                    ),
                                    accent = PortalPatients,
                                    onClick = {
                                        when {
                                            telemedicineAppointment != null ->
                                                onNavigateToVideoCall(telemedicineAppointment.id)
                                            telemedicineCandidate != null ->
                                                onNavigateToVideoCall(telemedicineCandidate.id)
                                            else ->
                                                onNavigateToVideoCall(VIDEO_PREVIEW_APPOINTMENT_ID)
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                )
                                TodayActionCard(
                                    icon = Icons.Outlined.Description,
                                    title = "Mi anamnesis",
                                    status = anamnesisStatusLabel(uiState.anamnesisSummary),
                                    description = anamnesisDescription(uiState.anamnesisSummary),
                                    accent = Secondary,
                                    onClick = onNavigateToAnamnesisForm,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }

                        item {
                            PreventiveFocusCard(
                                preventiveProfile = uiState.preventiveProfile,
                                preventiveError = uiState.preventiveError,
                                anamnesisSummary = uiState.anamnesisSummary,
                                onOpenPreventive = onNavigateToPreventiveHealth,
                                onOpenHealth = { onNavigateToTab(PATIENT_TAB_HEALTH) },
                                onOpenProfile = { onNavigateToTab(PATIENT_TAB_PROFILE) },
                            )
                        }

                        if (uiState.appointments.size > 1) {
                            item {
                                SectionTitle("Agenda proxima")
                            }
                            uiState.appointments.drop(1).take(3).forEach { appointment ->
                                item(key = appointment.id) {
                                    CompactAppointmentRow(
                                        appointment = appointment,
                                        onClick = if (appointment.id in uiState.joinableAppointmentIds) {
                                            { onNavigateToVideoCall(appointment.id) }
                                        } else {
                                            null
                                        },
                                    )
                                }
                            }
                            if (uiState.appointments.size > 4) {
                                item {
                                    Surface(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onNavigateToTab(PATIENT_TAB_APPOINTMENTS) },
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color.Transparent,
                                    ) {
                                        Text(
                                            text = "Ver todos los turnos",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = PrimaryLight,
                                            fontWeight = FontWeight.Medium,
                                            modifier = Modifier.padding(vertical = 8.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeaderSection(
    userName: String,
    priorityText: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = if (userName.isNotBlank()) "Hola, ${userName.split(" ").first()}" else "Hola",
            style = MaterialTheme.typography.headlineMedium,
            color = AuTextPrimary,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = priorityText,
            style = MaterialTheme.typography.bodyMedium,
            color = AuTextSecondary,
        )
    }
}

@Composable
private fun DashboardBanner(
    title: String,
    message: String,
    accent: Color,
    container: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = container,
        border = BorderStroke(1.dp, accent.copy(alpha = 0.25f)),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
        }
    }
}

@Composable
private fun PriorityActionCard(
    nextAppointment: Appointment?,
    joinableNow: Boolean,
    onOpenAppointments: () -> Unit,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = "Accion prioritaria",
                style = MaterialTheme.typography.labelLarge,
                color = PrimaryLight,
                fontWeight = FontWeight.SemiBold,
            )

            if (nextAppointment != null) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (joinableNow) PortalPatients.copy(alpha = 0.15f) else AuSurfaceHover,
                ) {
                    Text(
                        text = if (joinableNow) "Lista para entrar" else nextAppointment.type.displayName(),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (joinableNow) PortalPatients else AuTextSecondary,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    )
                }

                Text(
                    text = if (joinableNow) {
                        "Tu proxima consulta ya puede abrirse por videollamada."
                    } else {
                        "Tu siguiente paso es revisar la proxima cita y llegar con contexto claro."
                    },
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )

                Text(
                    text = "${formatDate(nextAppointment.startTime)} · ${formatTime(nextAppointment.startTime)}" +
                        (nextAppointment.durationMinutes?.let { " · $it min" } ?: ""),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )

                Button(
                    onClick = {
                        if (joinableNow) onJoinCall?.invoke() else onOpenAppointments()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (joinableNow) PortalPatients else AuAccent,
                        contentColor = if (joinableNow) Color.White else AuBackground,
                    ),
                ) {
                    Text(
                        text = if (joinableNow) "Entrar ahora" else "Ver agenda",
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            } else {
                Text(
                    text = "No tienes consultas proximas cargadas.",
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Revisa tu agenda para preparar una consulta o confirmar si necesitas seguimiento clinico.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )
                Button(
                    onClick = onOpenAppointments,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AuAccent,
                        contentColor = AuBackground,
                    ),
                ) {
                    Text("Abrir mis turnos", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun MetricCard(
    stat: HomeStat,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = stat.container,
        border = BorderStroke(1.dp, stat.accent.copy(alpha = 0.18f)),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = stat.label,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            Text(
                text = stat.value,
                style = MaterialTheme.typography.titleLarge,
                color = stat.accent,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = AuTextSecondary,
        fontWeight = FontWeight.SemiBold,
    )
}

@Composable
private fun TodayActionCard(
    icon: ImageVector,
    title: String,
    status: String,
    description: String,
    accent: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Surface(
                modifier = Modifier.size(42.dp),
                shape = CircleShape,
                color = accent.copy(alpha = 0.15f),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.padding(10.dp),
                    tint = accent,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = status,
                    style = MaterialTheme.typography.labelMedium,
                    color = accent,
                    fontWeight = FontWeight.Medium,
                )
            }
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
        }
    }
}

@Composable
private fun PreventiveFocusCard(
    preventiveProfile: PatientPreventiveProfile?,
    preventiveError: String?,
    anamnesisSummary: AnamnesisSummary?,
    onOpenPreventive: () -> Unit,
    onOpenHealth: () -> Unit,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val normalizedGender = normalizePreventiveGender(preventiveProfile?.gender)
    val preventiveReady = preventiveProfile?.age != null && normalizedGender != null
    val accent = if (preventiveReady) PortalPatients else AuWarning
    val container = if (preventiveReady) SuccessContainer else WarningContainer

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = container,
        border = BorderStroke(1.dp, accent.copy(alpha = 0.18f)),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Salud preventiva",
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = if (preventiveReady) "Plan listo para usar" else "Falta contexto clinico",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = AuSurface.copy(alpha = 0.18f),
                ) {
                    Text(
                        text = if (preventiveReady) "Conectado" else "Manual",
                        style = MaterialTheme.typography.labelSmall,
                        color = accent,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    )
                }
            }

            Text(
                text = when {
                    preventiveError != null -> preventiveError
                    preventiveReady -> "Usando ${preventiveProfile?.age} anos y ${normalizedGender?.label?.lowercase()} para recomendar chequeos preventivos y cronologia."
                    else -> "Todavia puedes explorar chequeos manualmente, pero conviene completar fecha de nacimiento y genero para personalizar el plan."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextSecondary,
            )

            if (anamnesisSummary != null) {
                Text(
                    text = "Anamnesis: ${anamnesisDisplayStatus(anamnesisSummary)} · ${anamnesisSummary.completionPercentage}%",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Button(
                    onClick = onOpenPreventive,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (preventiveReady) PortalPatients else AuAccent,
                        contentColor = if (preventiveReady) Color.White else AuBackground,
                    ),
                ) {
                    Text(
                        text = if (preventiveReady) "Abrir plan preventivo" else "Explorar manualmente",
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Button(
                    onClick = if (preventiveReady) onOpenHealth else onOpenProfile,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AuSurface.copy(alpha = 0.2f),
                        contentColor = AuTextPrimary,
                    ),
                ) {
                    Text(
                        text = if (preventiveReady) "Ver mi salud" else "Ir a perfil",
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
private fun CompactAppointmentRow(
    appointment: Appointment,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = appointment.type.displayName(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "${formatDate(appointment.startTime)} · ${formatTime(appointment.startTime)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                )
            }
            if (onClick != null) {
                Button(
                    onClick = onClick,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients,
                        contentColor = Color.White,
                    ),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Icon(
                        Icons.Default.Videocam,
                        contentDescription = "Unirse",
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        "Entrar",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

private fun buildPriorityMessage(
    nextAppointment: Appointment?,
    telemedicineAppointment: Appointment?,
    preventiveProfile: PatientPreventiveProfile?,
    anamnesisSummary: AnamnesisSummary?,
): String = when {
    telemedicineAppointment != null -> "Hoy tienes una videoconsulta lista para entrar."
    nextAppointment != null -> "Tu siguiente accion es preparar tu proxima cita."
    preventiveProfile?.age == null || normalizePreventiveGender(preventiveProfile.gender) == null ->
        "Completa tu contexto preventivo y calcula tus chequeos."
    anamnesisSummary == null || !isAnamnesisSummaryReadOnly(anamnesisSummary) ->
        "Mantén tu historia clinica al dia para mejorar el seguimiento."
    else -> "Hoy no tienes urgencias, pero puedes revisar tu plan de salud."
}

private fun buildHomeStats(
    appointments: List<Appointment>,
    joinableCount: Int,
    anamnesisSummary: AnamnesisSummary?,
): List<HomeStat> = listOf(
    HomeStat(
        label = "Turnos",
        value = appointments.size.toString(),
        accent = PrimaryLight,
        container = SecondaryContainer,
    ),
    HomeStat(
        label = "Video listas",
        value = joinableCount.toString(),
        accent = PortalPatients,
        container = SuccessContainer,
    ),
    HomeStat(
        label = "Anamnesis",
        value = anamnesisSummary?.completionPercentage?.let { "$it%" } ?: "--",
        accent = Secondary,
        container = AuSurface,
    ),
)

private fun telemedicineStatusLabel(
    appointment: Appointment?,
    candidate: Appointment?,
): String = when {
    appointment != null -> "Lista para entrar"
    candidate != null -> "Sala de espera"
    else -> "Chequeo tecnico"
}

private fun telemedicineDescription(
    appointment: Appointment?,
    candidate: Appointment?,
    error: String?,
): String = when {
    appointment != null -> "Tu consulta ya puede abrirse por videollamada."
    candidate != null -> error ?: "Puedes abrir la sala y esperar al profesional."
    else -> "Sin cita activa. Usa este acceso para probar camara y audio."
}

private fun anamnesisStatusLabel(summary: AnamnesisSummary?): String = when {
    summary == null -> "Sin iniciar"
    else -> anamnesisDisplayStatus(summary)
}

private fun anamnesisDescription(summary: AnamnesisSummary?): String = when {
    summary == null -> "Completa tus antecedentes para darle mejor contexto al equipo clinico."
    isAnamnesisSummaryReadOnly(summary) ->
        "Tu historia clinica esta enviada o aprobada. Puedes revisarla cuando lo necesites."
    else -> "${summary.completionPercentage}% completo · ${summary.completedSections}/${summary.totalSections} secciones."
}

private fun AppointmentType.displayName(): String = when (this) {
    AppointmentType.CONSULTATION -> "Consulta"
    AppointmentType.FOLLOW_UP -> "Seguimiento"
    AppointmentType.EMERGENCY -> "Urgencia"
    AppointmentType.TELEMEDICINE -> "Telemedicina"
    AppointmentType.LAB_TEST -> "Laboratorio"
    AppointmentType.CHECKUP -> "Chequeo"
}

private fun formatDate(isoString: String): String = try {
    val dt = OffsetDateTime.parse(isoString)
    dt.format(DateTimeFormatter.ofPattern("d 'de' MMMM", Locale("es", "AR")))
} catch (_: Exception) {
    isoString
}

private fun formatTime(isoString: String): String = try {
    val dt = OffsetDateTime.parse(isoString)
    dt.format(DateTimeFormatter.ofPattern("HH:mm", Locale("es", "AR")))
} catch (_: Exception) {
    ""
}
