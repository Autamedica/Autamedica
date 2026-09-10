package com.autamedica.android.presentation.appointments

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorBookingInfo
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
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

private val spanishLocale = Locale("es", "AR")

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
    val title = if (isDoctor) "Agenda médica" else "Mis turnos"

    // Separar turnos activos vs historial para pacientes
    val activeAppointments = remember(uiState.appointments) {
        uiState.appointments.filter { apt ->
            apt.status in setOf(
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.CONFIRMED,
                AppointmentStatus.IN_PROGRESS,
                AppointmentStatus.PAYMENT_PENDING
            )
        }
    }
    val pastAppointments = remember(uiState.appointments, activeAppointments) {
        uiState.appointments.filter { it !in activeAppointments }
    }

    // Para doctores: días de agenda
    val doctorAgendaDays = remember(uiState.appointments, uiState.joinableAppointmentIds) {
        if (isDoctor) {
            buildDoctorAgendaDays(uiState.appointments, uiState.joinableAppointmentIds)
        } else emptyList()
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
                            text = if (isDoctor) "Portal médico" else "Videoconsulta médica",
                            style = MaterialTheme.typography.labelSmall,
                            color = accentColor,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Actualizar",
                            tint = AuTextSecondary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
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
                uiState.isLoading && uiState.appointments.isEmpty() && uiState.availableDoctors.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp)
                    }
                }

                uiState.error != null && uiState.appointments.isEmpty() -> {
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
                                text = uiState.error ?: "Error al cargar los turnos",
                                color = AuDanger,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = viewModel::refresh,
                                colors = ButtonDefaults.buttonColors(containerColor = accentColor),
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Text("Reintentar", color = Color.White)
                            }
                        }
                    }
                }

                isDoctor -> {
                    // Vista limpia y sin estadísticas para el médico
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        if (doctorAgendaDays.isEmpty()) {
                            item {
                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = AuSurface,
                                    border = BorderStroke(1.dp, AuBorder),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Column(
                                        modifier = Modifier.padding(24.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.CalendarMonth,
                                            contentDescription = null,
                                            tint = AuTextTertiary,
                                            modifier = Modifier.size(36.dp),
                                        )
                                        Spacer(modifier = Modifier.height(10.dp))
                                        Text(
                                            text = "No tenés pacientes agendados actualmente.",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = AuTextSecondary,
                                        )
                                    }
                                }
                            }
                        } else {
                            items(doctorAgendaDays, key = { it.key }) { day ->
                                DoctorAgendaDaySection(
                                    day = day,
                                    joinableAppointmentIds = uiState.joinableAppointmentIds,
                                    onNavigateToVideoCall = onNavigateToVideoCall,
                                )
                            }
                        }
                    }
                }

                else -> {
                    // Vista orientada al objetivo para el Paciente: Cita real rápida en 1 pantalla
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // Banner de éxito al agendar
                        uiState.bookingSuccessMessage?.let { successMsg ->
                            item {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = AuSuccess.copy(alpha = 0.14f),
                                    border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.4f)),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Row(
                                        modifier = Modifier.padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.CheckCircle,
                                            contentDescription = null,
                                            tint = AuSuccess,
                                            modifier = Modifier.size(22.dp),
                                        )
                                        Text(
                                            text = successMsg,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = Color.White,
                                            fontWeight = FontWeight.Medium,
                                            modifier = Modifier.weight(1f),
                                        )
                                        IconButton(
                                            onClick = viewModel::dismissBookingMessages,
                                            modifier = Modifier.size(24.dp),
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Close,
                                                contentDescription = "Cerrar",
                                                tint = AuTextSecondary,
                                                modifier = Modifier.size(16.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Banner de error al agendar
                        uiState.bookingErrorMessage?.let { errorMsg ->
                            item {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = ErrorContainer,
                                    border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.4f)),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Row(
                                        modifier = Modifier.padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.Info,
                                            contentDescription = null,
                                            tint = AuDanger,
                                            modifier = Modifier.size(22.dp),
                                        )
                                        Text(
                                            text = errorMsg,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = AuDanger,
                                            fontWeight = FontWeight.Medium,
                                            modifier = Modifier.weight(1f),
                                        )
                                        IconButton(
                                            onClick = viewModel::dismissBookingMessages,
                                            modifier = Modifier.size(24.dp),
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Close,
                                                contentDescription = "Cerrar",
                                                tint = AuDanger,
                                                modifier = Modifier.size(16.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // A. TURNO ACTIVO (si ya tiene uno o más)
                        if (activeAppointments.isNotEmpty()) {
                            val primary = activeAppointments.first()
                            val isJoinable = primary.id in uiState.joinableAppointmentIds || primary.isTelemedicineJoinCandidate()
                            item {
                                ActiveAppointmentCard(
                                    appointment = primary,
                                    isJoinable = isJoinable,
                                    onJoinCall = { onNavigateToVideoCall(primary.id) },
                                )
                            }

                            // Si tiene más de 1 turno activo, mostrarlos de forma compacta
                            if (activeAppointments.size > 1) {
                                item {
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(
                                            text = "Otros turnos programados",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = AuTextSecondary,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        activeAppointments.drop(1).forEach { extraApt ->
                                            val extraJoinable = extraApt.id in uiState.joinableAppointmentIds || extraApt.isTelemedicineJoinCandidate()
                                            AppointmentCard(
                                                appointment = extraApt,
                                                onJoinCall = if (extraJoinable) {
                                                    { onNavigateToVideoCall(extraApt.id) }
                                                } else null,
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // B. CALENDARIO CON FECHAS Y HORARIOS DISPONIBLES (Directo en la pantalla)
                        item {
                            BookingCalendarCard(
                                availableDoctors = uiState.availableDoctors,
                                selectedDoctor = uiState.selectedDoctor,
                                availableDates = uiState.availableDates,
                                selectedDate = uiState.selectedDate,
                                availableSlots = uiState.availableSlots,
                                selectedSlot = uiState.selectedSlot,
                                isBooking = uiState.isBooking,
                                onSelectDate = viewModel::selectDate,
                                onSelectSlot = viewModel::selectSlot,
                                onSelectDoctor = viewModel::selectDoctor,
                                onConfirmBooking = viewModel::confirmQuickBooking,
                            )
                        }

                        // D. TURNOS PASADOS / HISTORIAL (Plegado / compacto)
                        if (pastAppointments.isNotEmpty()) {
                            item {
                                PastAppointmentsSection(appointments = pastAppointments)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ActiveAppointmentCard(
    appointment: Appointment,
    isJoinable: Boolean,
    onJoinCall: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(
            width = if (isJoinable) 1.5.dp else 1.dp,
            color = if (isJoinable) AuSuccess.copy(alpha = 0.5f) else AuBorder,
        ),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Header: Status badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (isJoinable) AuSuccess.copy(alpha = 0.16f) else PortalPatients.copy(alpha = 0.16f),
                    border = BorderStroke(
                        width = 1.dp,
                        color = if (isJoinable) AuSuccess.copy(alpha = 0.4f) else PortalPatients.copy(alpha = 0.4f),
                    ),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (isJoinable) {
                            Surface(
                                modifier = Modifier.size(8.dp),
                                shape = CircleShape,
                                color = AuSuccess,
                            ) {}
                        }
                        Text(
                            text = if (isJoinable) "SALA LISTA • ENTRAR AHORA" else "PRÓXIMO TURNO",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isJoinable) AuSuccess else PortalPatients,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp,
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = AuSurfaceHover,
                ) {
                    Text(
                        text = "Videoconsulta HD",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextSecondary,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            // Doctor Info + Date & Time
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = PortalPatients.copy(alpha = 0.18f),
                    border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.35f)),
                    modifier = Modifier.size(48.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        val initials = (appointment.doctorName ?: "Dr.")
                            .replace("Dr.", "")
                            .replace("Dra.", "")
                            .trim()
                            .split(" ")
                            .take(2)
                            .mapNotNull { it.firstOrNull()?.toString() }
                            .joinToString("")
                            .ifBlank { "MD" }

                        Text(
                            text = initials,
                            style = MaterialTheme.typography.titleMedium,
                            color = PortalPatients,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = appointment.doctorName ?: "Profesional Médico",
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = appointment.doctorSpecialty ?: "Medicina General",
                        style = MaterialTheme.typography.bodySmall,
                        color = PortalPatients,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.CalendarMonth,
                            contentDescription = null,
                            tint = AuTextSecondary,
                            modifier = Modifier.size(14.dp),
                        )
                        Text(
                            text = formatHeroDate(appointment.startTime),
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            // Action: Direct Button to enter call or schedule note
            if (isJoinable) {
                Button(
                    onClick = onJoinCall,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AuSuccess,
                        contentColor = Color.White,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = Color.White,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Entrar a la consulta",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            } else {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = AuBackground,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Schedule,
                            contentDescription = null,
                            tint = AuTextTertiary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = "La sala se habilitará 10 minutos antes del horario.",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BookingCalendarCard(
    availableDoctors: List<DoctorBookingInfo>,
    selectedDoctor: DoctorBookingInfo?,
    availableDates: List<LocalDate>,
    selectedDate: LocalDate,
    availableSlots: List<String>,
    selectedSlot: String?,
    isBooking: Boolean,
    onSelectDate: (LocalDate) -> Unit,
    onSelectSlot: (String) -> Unit,
    onSelectDoctor: (DoctorBookingInfo) -> Unit,
    onConfirmBooking: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showDoctorSheet by remember { mutableStateOf(false) }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Section Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "Agendar videoconsulta",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Text(
                        text = "Elegí fecha y horario disponible",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }

                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = PortalPatients.copy(alpha = 0.14f),
                ) {
                    Text(
                        text = "Turno directo",
                        style = MaterialTheme.typography.labelSmall,
                        color = PortalPatients,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }

            // 1-Line Doctor Assigned/Selected
            selectedDoctor?.let { doctor ->
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = AuBackground,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = availableDoctors.size > 1) { showDoctorSheet = true },
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = PortalPatients.copy(alpha = 0.16f),
                            modifier = Modifier.size(38.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                val initials = doctor.name
                                    .replace("Dr.", "")
                                    .replace("Dra.", "")
                                    .trim()
                                    .split(" ")
                                    .take(2)
                                    .mapNotNull { it.firstOrNull()?.toString() }
                                    .joinToString("")
                                    .ifBlank { "MD" }

                                Text(
                                    text = initials,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = PortalPatients,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = doctor.name,
                                style = MaterialTheme.typography.titleSmall,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(
                                    text = doctor.specialty,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = PortalPatients,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    text = "·",
                                    color = AuTextTertiary,
                                )
                                Text(
                                    text = if (doctor.consultationFee != null && doctor.consultationFee > 0) {
                                        "$${"%,.0f".format(doctor.consultationFee)}"
                                    } else {
                                        "Cubierto por plan"
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = AuTextSecondary,
                                )
                            }
                        }

                        if (availableDoctors.size > 1) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = AuSurfaceHover,
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                                ) {
                                    Text(
                                        text = "Cambiar",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = PortalPatients,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Icon(
                                        imageVector = Icons.Default.ExpandMore,
                                        contentDescription = null,
                                        tint = PortalPatients,
                                        modifier = Modifier.size(14.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Tira interactiva de fechas
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Día de atención",
                    style = MaterialTheme.typography.labelMedium,
                    color = AuTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                )

                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(availableDates, key = { it.toString() }) { date ->
                        val isSelected = date == selectedDate
                        DatePill(
                            date = date,
                            isSelected = isSelected,
                            accentColor = PortalPatients,
                            onClick = { onSelectDate(date) },
                        )
                    }
                }
            }

            // Grilla de horarios disponibles
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Horarios disponibles",
                        style = MaterialTheme.typography.labelMedium,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = formatSectionDateShort(selectedDate),
                        style = MaterialTheme.typography.labelSmall,
                        color = PortalPatients,
                        fontWeight = FontWeight.Medium,
                    )
                }

                if (availableSlots.isEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = AuBackground,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = "Sin turnos disponibles para esta fecha. Elegí otro día.",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                            modifier = Modifier.padding(14.dp),
                        )
                    }
                } else {
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        availableSlots.forEach { slot ->
                            val isSelected = slot == selectedSlot
                            SlotChip(
                                slot = slot,
                                isSelected = isSelected,
                                accentColor = PortalPatients,
                                onClick = { onSelectSlot(slot) },
                            )
                        }
                    }
                }
            }

            // Botón de acción directo: Confirmar turno
            Button(
                onClick = onConfirmBooking,
                enabled = selectedSlot != null && !isBooking,
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PortalPatients,
                    disabledContainerColor = AuSurfaceHover,
                    contentColor = Color.White,
                    disabledContentColor = AuTextTertiary,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                if (isBooking) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Confirmando turno...",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.CalendarMonth,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (selectedSlot != null) {
                            "Confirmar $selectedSlot hs"
                        } else {
                            "Elegí un horario para confirmar"
                        },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }

    // Modal Bottom Sheet para cambiar doctor
    if (showDoctorSheet) {
        DoctorPickerBottomSheet(
            doctors = availableDoctors,
            selectedDoctor = selectedDoctor,
            accentColor = PortalPatients,
            onSelectDoctor = {
                onSelectDoctor(it)
                showDoctorSheet = false
            },
            onDismiss = { showDoctorSheet = false },
        )
    }
}

@Composable
private fun DatePill(
    date: LocalDate,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val today = LocalDate.now()
    val dayName = when (date) {
        today -> "HOY"
        today.plusDays(1) -> "MAÑ"
        else -> date.format(DateTimeFormatter.ofPattern("EEE", spanishLocale)).uppercase()
    }
    val dayNum = date.dayOfMonth.toString()
    val monthName = date.format(DateTimeFormatter.ofPattern("MMM", spanishLocale)).uppercase()

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (isSelected) accentColor else AuBackground,
        border = BorderStroke(
            width = 1.dp,
            color = if (isSelected) accentColor else AuBorder,
        ),
        modifier = Modifier
            .width(62.dp)
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(vertical = 10.dp, horizontal = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = dayName,
                style = MaterialTheme.typography.labelSmall,
                color = if (isSelected) Color.White.copy(alpha = 0.9f) else AuTextTertiary,
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
            )
            Text(
                text = dayNum,
                style = MaterialTheme.typography.titleLarge,
                color = if (isSelected) Color.White else AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = monthName,
                style = MaterialTheme.typography.labelSmall,
                color = if (isSelected) Color.White.copy(alpha = 0.8f) else AuTextTertiary,
                fontSize = 9.sp,
            )
        }
    }
}

@Composable
private fun SlotChip(
    slot: String,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (isSelected) accentColor else AuBackground,
        border = BorderStroke(
            width = 1.dp,
            color = if (isSelected) accentColor else AuBorder,
        ),
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = Icons.Default.AccessTime,
                contentDescription = null,
                modifier = Modifier.size(13.dp),
                tint = if (isSelected) Color.White else AuTextSecondary,
            )
            Text(
                text = "$slot hs",
                style = MaterialTheme.typography.labelMedium,
                color = if (isSelected) Color.White else AuTextPrimary,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DoctorPickerBottomSheet(
    doctors: List<DoctorBookingInfo>,
    selectedDoctor: DoctorBookingInfo?,
    accentColor: Color,
    onSelectDoctor: (DoctorBookingInfo) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = AuSurface,
        dragHandle = {
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = AuBorder,
                modifier = Modifier
                    .padding(vertical = 12.dp)
                    .size(width = 36.dp, height = 4.dp),
            ) {}
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = "Elegir profesional de atención",
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                doctors.forEach { doctor ->
                    val isSelected = selectedDoctor?.id == doctor.id
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = if (isSelected) accentColor.copy(alpha = 0.12f) else AuBackground,
                        border = BorderStroke(
                            width = if (isSelected) 1.5.dp else 1.dp,
                            color = if (isSelected) accentColor else AuBorder,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelectDoctor(doctor) },
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = accentColor.copy(alpha = 0.16f),
                                modifier = Modifier.size(42.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    val initials = doctor.name
                                        .replace("Dr.", "")
                                        .replace("Dra.", "")
                                        .trim()
                                        .split(" ")
                                        .take(2)
                                        .mapNotNull { it.firstOrNull()?.toString() }
                                        .joinToString("")
                                        .ifBlank { "MD" }

                                    Text(
                                        text = initials,
                                        style = MaterialTheme.typography.titleSmall,
                                        color = accentColor,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = doctor.name,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = AuTextPrimary,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = "${doctor.specialty} · ${doctor.licenseNumber}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuTextSecondary,
                                )
                                Text(
                                    text = if (doctor.consultationFee != null && doctor.consultationFee > 0) {
                                        "Arancel: $${"%,.0f".format(doctor.consultationFee)}"
                                    } else {
                                        "Cubierto por plan"
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = accentColor,
                                    fontWeight = FontWeight.Medium,
                                )
                            }

                            if (isSelected) {
                                Icon(
                                    imageVector = Icons.Outlined.CheckCircle,
                                    contentDescription = null,
                                    tint = accentColor,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PastAppointmentsSection(
    appointments: List<Appointment>,
    modifier: Modifier = Modifier,
) {
    var isExpanded by rememberSaveable { mutableStateOf(false) }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { isExpanded = !isExpanded },
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.History,
                        contentDescription = null,
                        tint = AuTextTertiary,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = "Consultas anteriores (${appointments.size})",
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                Icon(
                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (isExpanded) "Ocultar" else "Mostrar",
                    tint = AuTextSecondary,
                    modifier = Modifier.size(20.dp),
                )
            }

            if (isExpanded) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    appointments.forEach { apt ->
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = AuBackground,
                            border = BorderStroke(1.dp, AuBorder),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = apt.doctorName ?: displayAppointmentType(apt.type),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = AuTextPrimary,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = formatHeroDate(apt.startTime),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = AuTextTertiary,
                                    )
                                }

                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = AuSurfaceHover,
                                ) {
                                    Text(
                                        text = when (apt.status) {
                                            AppointmentStatus.COMPLETED -> "Completada"
                                            AppointmentStatus.CANCELLED -> "Cancelada"
                                            AppointmentStatus.NO_SHOW -> "No asistió"
                                            else -> "Finalizada"
                                        },
                                        style = MaterialTheme.typography.labelSmall,
                                        color = AuTextSecondary,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
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

@Composable
private fun DoctorAgendaDaySection(
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

private fun buildDoctorAgendaDays(
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
    val today = LocalDate.now()
    val date = dateTime.toLocalDate()
    val time = dateTime.format(DateTimeFormatter.ofPattern("HH:mm"))
    return when (date) {
        today -> "Hoy a las $time hs"
        today.plusDays(1) -> "Mañana a las $time hs"
        else -> dateTime.format(DateTimeFormatter.ofPattern("EEE d MMM · HH:mm 'hs'", spanishLocale))
            .replaceFirstChar { it.uppercase() }
    }
}

private fun formatSectionDate(date: LocalDate): String {
    val today = LocalDate.now()
    return when {
        date == today -> "Hoy"
        date == today.plusDays(1) -> "Mañana"
        else -> date.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", spanishLocale))
            .replaceFirstChar { it.uppercase() }
    }
}

private fun formatSectionDateShort(date: LocalDate): String {
    val today = LocalDate.now()
    return when (date) {
        today -> "Hoy"
        today.plusDays(1) -> "Mañana"
        else -> date.format(DateTimeFormatter.ofPattern("d 'de' MMMM", spanishLocale))
    }
}

private fun parseDateTime(value: String): OffsetDateTime? {
    return runCatching { OffsetDateTime.parse(value) }.getOrNull()
}

private fun parseLocalDate(value: String): LocalDate? {
    return parseDateTime(value)?.toLocalDate()
}
