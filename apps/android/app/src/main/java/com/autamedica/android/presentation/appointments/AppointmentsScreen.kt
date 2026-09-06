package com.autamedica.android.presentation.appointments

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.presentation.dashboard.components.AppointmentCard
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalPatients
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val ALL_DAYS_KEY = "__all_days__"
private val spanishLocale = Locale("es", "AR")

private data class AgendaStat(
    val value: String,
    val label: String,
    val icon: ImageVector,
    val iconColor: Color,
    val iconBgColor: Color,
)

private data class AgendaDay(
    val key: String,
    val date: LocalDate,
    val appointments: List<Appointment>,
    val hasJoinableAppointment: Boolean,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentsScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToBookAppointment: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: AppointmentsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val isDoctor = uiState.userRole == "doctor"
    val accentColor = if (isDoctor) PortalDoctors else PortalPatients
    val title = if (isDoctor) "Agenda de Consultas" else "Mis Turnos"
    val subtitle = if (isDoctor) {
        "Organiza la jornada clinica y controla accesos a videollamadas."
    } else {
        "Revisa tus proximos turnos y entra a la videoconsulta cuando este lista."
    }

    val agendaDays = remember(uiState.appointments, uiState.joinableAppointmentIds) {
        buildAgendaDays(
            appointments = uiState.appointments,
            joinableAppointmentIds = uiState.joinableAppointmentIds,
        )
    }
    val nextAppointment = remember(uiState.appointments) { uiState.appointments.firstOrNull() }
    val stats = remember(uiState.appointments, uiState.joinableAppointmentIds) {
        buildAgendaStats(
            appointments = uiState.appointments,
            joinableAppointmentIds = uiState.joinableAppointmentIds,
            accentColor = accentColor,
        )
    }

    var selectedDayKey by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(agendaDays) {
        val hasCurrentSelection = selectedDayKey == ALL_DAYS_KEY || agendaDays.any { it.key == selectedDayKey }
        if (hasCurrentSelection) return@LaunchedEffect

        val todayKey = LocalDate.now().toString()
        selectedDayKey = agendaDays.firstOrNull { it.key == todayKey }?.key
            ?: agendaDays.firstOrNull()?.key
            ?: ALL_DAYS_KEY
    }

    val visibleDays = remember(agendaDays, selectedDayKey) {
        when {
            selectedDayKey == ALL_DAYS_KEY -> agendaDays
            selectedDayKey.isBlank() -> agendaDays.take(1)
            else -> agendaDays.filter { it.key == selectedDayKey }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = if (isDoctor) "Portal medico" else "Portal paciente",
                            style = MaterialTheme.typography.labelSmall,
                            color = accentColor,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                },
                actions = {
                    if (!isDoctor) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = accentColor.copy(alpha = 0.16f),
                            border = BorderStroke(1.dp, accentColor.copy(alpha = 0.4f)),
                            modifier = Modifier
                                .padding(end = 12.dp)
                                .clickable { onNavigateToBookAppointment() },
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = null,
                                    tint = accentColor,
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    text = "Reservar Turno",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = accentColor,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        floatingActionButton = {
            if (!isDoctor) {
                ExtendedFloatingActionButton(
                    onClick = onNavigateToBookAppointment,
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = null,
                            tint = Color.White,
                        )
                    },
                    text = {
                        Text(
                            text = "Nuevo Turno",
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                        )
                    },
                    containerColor = accentColor,
                    contentColor = Color.White,
                    shape = RoundedCornerShape(16.dp),
                )
            }
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
                        CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp)
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
                    EmptyAppointmentsState(
                        isDoctor = isDoctor,
                        accentColor = accentColor,
                        onNavigateToBookAppointment = onNavigateToBookAppointment,
                    )
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        item {
                            AgendaHeroCard(
                                title = title,
                                subtitle = subtitle,
                                accentColor = accentColor,
                                totalAppointments = uiState.appointments.size,
                                joinableCount = uiState.joinableAppointmentIds.size,
                                nextAppointment = nextAppointment,
                            )
                        }

                        item {
                            StatsRow(stats = stats)
                        }

                        uiState.telemedicineError?.let { telemedicineError ->
                            item {
                                AgendaInfoBanner(
                                    text = telemedicineError,
                                    icon = Icons.Default.Videocam,
                                )
                            }
                        }

                        item {
                            CalendarFilterCard(
                                days = agendaDays,
                                selectedDayKey = selectedDayKey,
                                accentColor = accentColor,
                                onSelectAll = { selectedDayKey = ALL_DAYS_KEY },
                                onSelectDay = { selectedDayKey = it },
                            )
                        }

                        items(visibleDays, key = { it.key }) { day ->
                            AgendaDaySection(
                                day = day,
                                joinableAppointmentIds = uiState.joinableAppointmentIds,
                                onNavigateToVideoCall = onNavigateToVideoCall,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyAppointmentsState(
    isDoctor: Boolean = false,
    accentColor: Color = PortalPatients,
    onNavigateToBookAppointment: () -> Unit = {},
) {
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
                border = BorderStroke(1.dp, AuBorder),
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
                text = "Sin turnos programados",
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Medium,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Cuando tengas nuevas consultas apareceran agrupadas por dia en esta agenda.",
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextTertiary,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Las videoconsultas se habilitan desde turnos de consulta o telemedicina.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            if (!isDoctor) {
                Spacer(modifier = Modifier.height(20.dp))
                Button(
                    onClick = onNavigateToBookAppointment,
                    colors = ButtonDefaults.buttonColors(containerColor = accentColor),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = Color.White,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Reservar Turno",
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun AgendaHeroCard(
    title: String,
    subtitle: String,
    accentColor: Color,
    totalAppointments: Int,
    joinableCount: Int,
    nextAppointment: Appointment?,
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(1.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(accentColor.copy(alpha = 0.14f), RoundedCornerShape(17.dp))
                    .padding(18.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = accentColor.copy(alpha = 0.16f),
                    ) {
                        Text(
                            text = "$totalAppointments turno${if (totalAppointments == 1) "" else "s"} activo${if (totalAppointments == 1) "" else "s"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = accentColor,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.headlineMedium,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextSecondary,
                        )
                    }

                    if (nextAppointment != null) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = AuSurface.copy(alpha = 0.92f),
                            border = BorderStroke(1.dp, AuBorder),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Surface(
                                    modifier = Modifier.size(38.dp),
                                    shape = CircleShape,
                                    color = accentColor.copy(alpha = 0.14f),
                                ) {
                                    Icon(
                                        imageVector = appointmentTypeIcon(nextAppointment.type),
                                        contentDescription = null,
                                        modifier = Modifier.padding(9.dp),
                                        tint = accentColor,
                                    )
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Siguiente turno",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = AuTextTertiary,
                                    )
                                    Text(
                                        text = "${displayAppointmentType(nextAppointment.type)} · ${formatHeroDate(nextAppointment.startTime)}",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = AuTextPrimary,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                                if (joinableCount > 0) {
                                    Surface(
                                        shape = RoundedCornerShape(999.dp),
                                        color = AuSuccess.copy(alpha = 0.14f),
                                    ) {
                                        Text(
                                            text = "$joinableCount lista${if (joinableCount == 1) "" else "s"}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = AuSuccess,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
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
private fun StatsRow(stats: List<AgendaStat>) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(stats, key = { it.label }) { stat ->
            AgendaStatCard(
                stat = stat,
                modifier = Modifier.width(132.dp),
            )
        }
    }
}

@Composable
private fun AgendaStatCard(
    stat: AgendaStat,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(
                modifier = Modifier.size(36.dp),
                shape = CircleShape,
                color = stat.iconBgColor,
            ) {
                Icon(
                    imageVector = stat.icon,
                    contentDescription = null,
                    modifier = Modifier.padding(8.dp),
                    tint = stat.iconColor,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = stat.value,
                style = MaterialTheme.typography.headlineMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stat.label,
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
            )
        }
    }
}

@Composable
private fun AgendaInfoBanner(
    text: String,
    icon: ImageVector,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(34.dp),
                shape = CircleShape,
                color = AuSurfaceHover,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.padding(8.dp),
                    tint = AuTextSecondary,
                )
            }
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
        }
    }
}

@Composable
private fun CalendarFilterCard(
    days: List<AgendaDay>,
    selectedDayKey: String,
    accentColor: Color,
    onSelectAll: () -> Unit,
    onSelectDay: (String) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                Text(
                    text = "Calendario rapido",
                    style = MaterialTheme.typography.titleSmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Explora la agenda por dia o revisa todo el bloque de turnos activos.",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                )
            }

            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (days.size > 1) {
                    item {
                        CalendarChip(
                            label = "Todo",
                            supportingText = "${days.sumOf { it.appointments.size }} turnos",
                            isSelected = selectedDayKey == ALL_DAYS_KEY,
                            accentColor = accentColor,
                            hasHighlight = days.any { it.hasJoinableAppointment },
                            onClick = onSelectAll,
                        )
                    }
                }

                items(days, key = { it.key }) { day ->
                    CalendarChip(
                        label = day.date.format(DateTimeFormatter.ofPattern("EEE d", spanishLocale))
                            .replaceFirstChar { it.uppercase() },
                        supportingText = "${day.appointments.size} cita${if (day.appointments.size == 1) "" else "s"}",
                        isSelected = selectedDayKey == day.key || (selectedDayKey.isBlank() && days.firstOrNull()?.key == day.key),
                        accentColor = accentColor,
                        hasHighlight = day.hasJoinableAppointment,
                        onClick = { onSelectDay(day.key) },
                    )
                }
            }
        }
    }
}

@Composable
private fun CalendarChip(
    label: String,
    supportingText: String,
    isSelected: Boolean,
    accentColor: Color,
    hasHighlight: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (isSelected) accentColor.copy(alpha = 0.14f) else AuBackground,
        border = BorderStroke(
            width = 1.dp,
            color = if (isSelected) accentColor.copy(alpha = 0.45f) else AuBorder,
        ),
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleSmall,
                    color = if (isSelected) AuTextPrimary else AuTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                )
                if (hasHighlight) {
                    Surface(
                        modifier = Modifier.size(8.dp),
                        shape = CircleShape,
                        color = AuSuccess,
                    ) {}
                }
            }
            Text(
                text = supportingText,
                style = MaterialTheme.typography.labelSmall,
                color = if (isSelected) accentColor else AuTextTertiary,
            )
        }
    }
}

@Composable
private fun AgendaDaySection(
    day: AgendaDay,
    joinableAppointmentIds: Set<String>,
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = formatSectionDate(day.date),
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "${day.appointments.size} turno${if (day.appointments.size == 1) "" else "s"} en agenda",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }

                if (day.hasJoinableAppointment) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = AuSuccess.copy(alpha = 0.14f),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = AuSuccess,
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Sala lista",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuSuccess,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                day.appointments.forEach { appointment ->
                    AppointmentCard(
                        appointment = appointment,
                        onJoinCall = if (appointment.id in joinableAppointmentIds) {
                            { onNavigateToVideoCall(appointment.id) }
                        } else null,
                    )
                }
            }
        }
    }
}

private fun buildAgendaStats(
    appointments: List<Appointment>,
    joinableAppointmentIds: Set<String>,
    accentColor: Color,
): List<AgendaStat> {
    val today = LocalDate.now()
    val todayCount = appointments.count { parseLocalDate(it.startTime) == today }
    val telemedicineCount = appointments.count { appointment ->
        appointment.type == AppointmentType.TELEMEDICINE || appointment.meetingUrl != null
    }
    val scheduledCount = appointments.count { appointment ->
        appointment.status == AppointmentStatus.SCHEDULED || appointment.status == AppointmentStatus.CONFIRMED
    }

    return listOf(
        AgendaStat(
            value = scheduledCount.toString(),
            label = "Programadas",
            icon = Icons.Outlined.EventAvailable,
            iconColor = accentColor,
            iconBgColor = accentColor.copy(alpha = 0.16f),
        ),
        AgendaStat(
            value = todayCount.toString(),
            label = "Hoy",
            icon = Icons.Default.Schedule,
            iconColor = AuAccent,
            iconBgColor = AuAccent.copy(alpha = 0.12f),
        ),
        AgendaStat(
            value = joinableAppointmentIds.size.toString().ifBlank { "0" },
            label = "Para entrar",
            icon = Icons.Default.Videocam,
            iconColor = AuSuccess,
            iconBgColor = AuSuccess.copy(alpha = 0.14f),
        ),
        AgendaStat(
            value = telemedicineCount.toString(),
            label = "Telemedicina",
            icon = Icons.Outlined.MedicalServices,
            iconColor = PortalDoctors,
            iconBgColor = PortalDoctors.copy(alpha = 0.14f),
        ),
    ).take(4)
}

private fun buildAgendaDays(
    appointments: List<Appointment>,
    joinableAppointmentIds: Set<String>,
): List<AgendaDay> {
    return appointments
        .sortedBy { appointment ->
            parseDateTime(appointment.startTime)?.toInstant()?.toEpochMilli() ?: Long.MAX_VALUE
        }
        .groupBy { appointment ->
            parseLocalDate(appointment.startTime) ?: LocalDate.MAX
        }
        .filterKeys { it != LocalDate.MAX }
        .map { (date, dayAppointments) ->
            AgendaDay(
                key = date.toString(),
                date = date,
                appointments = dayAppointments,
                hasJoinableAppointment = dayAppointments.any { it.id in joinableAppointmentIds },
            )
        }
        .sortedBy { it.date }
}

private fun appointmentTypeIcon(type: AppointmentType): ImageVector = when (type) {
    AppointmentType.TELEMEDICINE -> Icons.Default.Videocam
    AppointmentType.CHECKUP -> Icons.Outlined.CheckCircle
    AppointmentType.LAB_TEST -> Icons.Outlined.MedicalServices
    else -> Icons.Default.CalendarMonth
}

private fun displayAppointmentType(type: AppointmentType): String = when (type) {
    AppointmentType.CONSULTATION -> "Consulta"
    AppointmentType.FOLLOW_UP -> "Seguimiento"
    AppointmentType.EMERGENCY -> "Urgencia"
    AppointmentType.TELEMEDICINE -> "Telemedicina"
    AppointmentType.LAB_TEST -> "Laboratorio"
    AppointmentType.CHECKUP -> "Chequeo"
}

private fun formatHeroDate(isoString: String): String {
    val dateTime = parseDateTime(isoString) ?: return isoString
    return dateTime.format(DateTimeFormatter.ofPattern("EEE d MMM · HH:mm", spanishLocale))
        .replaceFirstChar { it.uppercase() }
}

private fun formatSectionDate(date: LocalDate): String {
    val today = LocalDate.now()
    val prefix = when {
        date == today -> "Hoy"
        date == today.plusDays(1) -> "Manana"
        else -> date.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", spanishLocale))
            .replaceFirstChar { it.uppercase() }
    }
    return prefix
}

private fun parseDateTime(value: String): OffsetDateTime? {
    return runCatching { OffsetDateTime.parse(value) }.getOrNull()
}

private fun parseLocalDate(value: String): LocalDate? {
    return parseDateTime(value)?.toLocalDate()
}
