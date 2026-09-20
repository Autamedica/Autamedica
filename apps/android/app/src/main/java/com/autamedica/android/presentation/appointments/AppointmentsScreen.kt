package com.autamedica.android.presentation.appointments

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronRight
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
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
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
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import com.autamedica.android.util.CountryContext

private val currentLocale: Locale
    get() = CountryContext.getLocale()

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
    val title = if (isDoctor) "Agenda médica" else "Agenda"

    var appointmentToCancel by remember { mutableStateOf<Appointment?>(null) }
    var appointmentToReschedule by remember { mutableStateOf<Appointment?>(null) }
    var selectedDoctorFilter by rememberSaveable { mutableStateOf("all") }

    // Separar turnos activos vs historial para pacientes
    val activeAppointments = remember(uiState.appointments) {
        uiState.appointments.filter { apt ->
            apt.status in setOf(
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.CONFIRMED,
                AppointmentStatus.IN_PROGRESS,
                AppointmentStatus.PAYMENT_PENDING
            ) && runCatching {
                parseDateTime(apt.startTime)?.isAfter(OffsetDateTime.now().minusMinutes(30)) == true
            }.getOrDefault(false)
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
                        if (isDoctor) {
                            Text(
                                text = "Portal médico",
                                style = MaterialTheme.typography.labelSmall,
                                color = accentColor,
                                fontWeight = FontWeight.Medium,
                            )
                        }
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
                    val todayDate = LocalDate.now()
                    val todayDay = doctorAgendaDays.firstOrNull { it.date == todayDate }
                    val todayCount = todayDay?.appointments?.size ?: 0
                    val filteredAgendaDays = when (selectedDoctorFilter) {
                        "today" -> doctorAgendaDays.filter { it.date == todayDate }
                        "upcoming" -> doctorAgendaDays.filter { it.date > todayDate }
                        else -> doctorAgendaDays
                    }

                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // Chips de filtrado rápido de agenda
                        if (doctorAgendaDays.isNotEmpty()) {
                            item {
                                DoctorAgendaFilterChips(
                                    selectedFilter = selectedDoctorFilter,
                                    onSelectFilter = { selectedDoctorFilter = it },
                                    todayCount = todayCount,
                                    totalCount = uiState.appointments.size,
                                )
                            }
                        }

                        if (filteredAgendaDays.isEmpty()) {
                            item {
                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = Color.White,
                                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                    shadowElevation = 1.dp,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Column(
                                        modifier = Modifier.padding(32.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFF1F5F9),
                                            modifier = Modifier.size(56.dp),
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    imageVector = Icons.Default.CalendarMonth,
                                                    contentDescription = null,
                                                    tint = AuTextTertiary,
                                                    modifier = Modifier.size(28.dp),
                                                )
                                            }
                                        }
                                        Spacer(modifier = Modifier.height(14.dp))
                                        Text(
                                            text = if (selectedDoctorFilter == "today") {
                                                "Sin turnos programados para hoy"
                                            } else {
                                                stringResource(R.string.doctor_agenda_no_patients)
                                            },
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = AuTextPrimary,
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(
                                            text = "Los pacientes con turno confirmado aparecerán en tu agenda de guardia.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AuTextTertiary,
                                            textAlign = TextAlign.Center,
                                        )
                                    }
                                }
                            }
                        } else {
                            items(filteredAgendaDays, key = { it.key }) { day ->
                                DoctorAgendaDaySection(
                                    day = day,
                                    patientNames = uiState.patientNames,
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
                            val isPrimaryJoinable = primary.isTelemedicineJoinCandidate() || primary.id in uiState.joinableAppointmentIds
                            item {
                                ActiveAppointmentCard(
                                    appointment = primary,
                                    isJoinable = isPrimaryJoinable,
                                    onJoinCall = { onNavigateToVideoCall(primary.id) },
                                    onCancel = { appointmentToCancel = primary },
                                    onReschedule = { appointmentToReschedule = primary },
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
                                            val isExtraJoinable = extraApt.isTelemedicineJoinCandidate() || extraApt.id in uiState.joinableAppointmentIds
                                            AppointmentCard(
                                                appointment = extraApt,
                                                onJoinCall = if (isExtraJoinable) {
                                                    { onNavigateToVideoCall(extraApt.id) }
                                                } else null,
                                                onCancel = { appointmentToCancel = extraApt },
                                                onReschedule = { appointmentToReschedule = extraApt },
                                            )
                                        }
                                    }
                                }
                            }
                        } else {
                            // Cuando no hay turnos activos, mostrar estado vacío de agenda
                            item {
                                Surface(
                                    shape = RoundedCornerShape(18.dp),
                                    color = AuSurface,
                                    border = BorderStroke(1.dp, AuBorder),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Column(
                                        modifier = Modifier.padding(24.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Surface(
                                            modifier = Modifier.size(48.dp),
                                            shape = CircleShape,
                                            color = PortalPatients.copy(alpha = 0.12f),
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    imageVector = Icons.Default.CalendarMonth,
                                                    contentDescription = null,
                                                    tint = PortalPatients,
                                                    modifier = Modifier.size(24.dp),
                                                )
                                            }
                                        }
                                        Text(
                                            text = stringResource(R.string.appointments_no_scheduled),
                                            style = MaterialTheme.typography.titleSmall,
                                            color = AuTextPrimary,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Text(
                                            text = stringResource(R.string.appointments_no_scheduled_hint),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AuTextSecondary,
                                            textAlign = TextAlign.Center,
                                        )
                                    }
                                }
                            }
                        }

                        // B. AGENDAR TURNO (Sección colapsable para priorizar la agenda)
                        item {
                            BookingCalendarCard(
                                availableDoctors = uiState.availableDoctors,
                                selectedDoctor = uiState.selectedDoctor,
                                availableDates = uiState.availableDates,
                                selectedDate = uiState.selectedDate,
                                availableSlots = uiState.availableSlots,
                                selectedSlot = uiState.selectedSlot,
                                isBooking = uiState.isBooking,
                                isExpanded = uiState.isBookingExpanded,
                                isLoadingSlots = uiState.isLoadingSlots,
                                onToggleExpanded = viewModel::toggleBookingSection,
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

    appointmentToCancel?.let { target ->
        AlertDialog(
            onDismissRequest = { appointmentToCancel = null },
            containerColor = AuSurface,
            title = {
                Text(
                    text = "¿Cancelar el turno?",
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
            },
            text = {
                Text(
                    text = "El turno del ${formatHeroDate(target.startTime)} quedará cancelado y el horario volverá a estar disponible para otros pacientes.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.cancelAppointment(target)
                    appointmentToCancel = null
                }) {
                    Text("Sí, cancelar", color = AuDanger, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { appointmentToCancel = null }) {
                    Text("No", color = AuTextSecondary)
                }
            },
        )
    }

    appointmentToReschedule?.let { target ->
        RescheduleSheet(
            appointment = target,
            availableDates = uiState.availableDates,
            rescheduleDate = uiState.rescheduleSelectedDate,
            rescheduleSlots = uiState.rescheduleSlots,
            rescheduleSlot = uiState.rescheduleSelectedSlot,
            isLoadingSlots = uiState.rescheduleLoading,
            onLoadSlots = viewModel::loadRescheduleSlots,
            onSelectDate = viewModel::selectRescheduleDate,
            onSelectSlot = viewModel::selectRescheduleSlot,
            onDismiss = { appointmentToReschedule = null },
            onConfirm = { date, slot ->
                viewModel.rescheduleAppointment(target, date, slot)
                appointmentToReschedule = null
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun RescheduleSheet(
    appointment: Appointment,
    availableDates: List<LocalDate>,
    rescheduleDate: LocalDate,
    rescheduleSlots: List<String>,
    rescheduleSlot: String?,
    isLoadingSlots: Boolean,
    onLoadSlots: (String?, LocalDate) -> Unit,
    onSelectDate: (LocalDate) -> Unit,
    onSelectSlot: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: (LocalDate, String) -> Unit,
) {
    LaunchedEffect(appointment.id) {
        val initialDate = parseDateTime(appointment.startTime)?.toLocalDate() ?: LocalDate.now()
        onSelectDate(initialDate)
        onLoadSlots(appointment.doctorId, initialDate)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = AuSurface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = "Reprogramar turno",
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Con ${appointment.doctorName ?: "tu profesional"} · Elegí el nuevo día y horario.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            HorizontalDivider(color = AuBorder)

            if (availableDates.isNotEmpty()) {
                Text(
                    text = "Día",
                    style = MaterialTheme.typography.labelMedium,
                    color = AuTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(availableDates, key = { it.toString() }) { date ->
                        val isSelected = date == rescheduleDate
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (isSelected) PortalPatients else AuSurfaceHover,
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) PortalPatients else AuBorder,
                            ),
                            modifier = Modifier.clickable {
                                onSelectDate(date)
                                onLoadSlots(appointment.doctorId, date)
                            },
                        ) {
                            Text(
                                text = formatShortDate(date),
                                style = MaterialTheme.typography.labelMedium,
                                color = if (isSelected) Color.White else AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            )
                        }
                    }
                }
            }

            Text(
                text = "Horario",
                style = MaterialTheme.typography.labelMedium,
                color = AuTextSecondary,
                fontWeight = FontWeight.SemiBold,
            )
            when {
                isLoadingSlots -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            color = PortalPatients,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }

                rescheduleSlots.isEmpty() -> {
                    Text(
                        text = "No hay horarios disponibles para este día.",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }

                else -> {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        rescheduleSlots.forEach { slot ->
                            val isSelected = slot == rescheduleSlot
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (isSelected) PortalPatients else AuSurfaceHover,
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) PortalPatients else AuBorder,
                                ),
                                modifier = Modifier.clickable { onSelectSlot(slot) },
                            ) {
                                Text(
                                    text = slot,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (isSelected) Color.White else AuTextPrimary,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                )
                            }
                        }
                    }
                }
            }

            Button(
                onClick = {
                    val slot = rescheduleSlot
                    if (slot != null) onConfirm(rescheduleDate, slot)
                },
                enabled = rescheduleSlot != null && !isLoadingSlots,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
            ) {
                Text(
                    text = "Confirmar reprogramación",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

private fun formatShortDate(date: LocalDate): String {
    val locale = currentLocale
    val pattern = if (CountryContext.isBrazil(locale = locale)) "EEE, d 'de' MMM" else "EEE d 'de' MMM"
    return date.format(DateTimeFormatter.ofPattern(pattern, locale))
        .replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
}

@Composable
private fun ActiveAppointmentCard(
    appointment: Appointment,
    isJoinable: Boolean,
    onJoinCall: () -> Unit,
    modifier: Modifier = Modifier,
    onCancel: (() -> Unit)? = null,
    onReschedule: (() -> Unit)? = null,
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
                            maxLines = 1,
                            softWrap = false,
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
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            // Doctor Info + Date & Time
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                DoctorAvatar(
                    name = appointment.doctorName ?: "Profesional Médico",
                    avatarUrl = appointment.doctorAvatarUrl,
                    doctorId = appointment.doctorId,
                    size = 48.dp,
                    accentColor = PortalPatients,
                    border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.35f)),
                )

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

            // Patient actions: Reschedule / Cancel
            if (onReschedule != null || onCancel != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    onReschedule?.let { reschedule ->
                        OutlinedButton(
                            onClick = reschedule,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                            border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.5f)),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = PortalPatients,
                            ),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Schedule,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                "Reprogramar",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 12.sp,
                                maxLines = 1,
                                softWrap = false,
                            )
                        }
                    }
                    onCancel?.let { cancel ->
                        OutlinedButton(
                            onClick = cancel,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                            border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.5f)),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = AuDanger,
                            ),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.EventBusy,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                "Cancelar",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 12.sp,
                                maxLines = 1,
                                softWrap = false,
                            )
                        }
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
    isExpanded: Boolean,
    isLoadingSlots: Boolean,
    onToggleExpanded: () -> Unit,
    onSelectDate: (LocalDate) -> Unit,
    onSelectSlot: (String) -> Unit,
    onSelectDoctor: (DoctorBookingInfo) -> Unit,
    onConfirmBooking: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showDoctorSheet by remember { mutableStateOf(false) }

    // Autoapertura anti-fricción estilo Uber: al expandir sin médico elegido,
    // se despliega automáticamente el selector tras una breve pausa para que termine la animación.
    LaunchedEffect(isExpanded, selectedDoctor) {
        if (isExpanded && selectedDoctor == null && availableDoctors.isNotEmpty()) {
            kotlinx.coroutines.delay(280L)
            showDoctorSheet = true
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, if (isExpanded) PortalPatients.copy(alpha = 0.45f) else AuBorder),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(if (isExpanded) 18.dp else 14.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header colapsable
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onToggleExpanded() },
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = if (isExpanded) PortalPatients else PortalPatients.copy(alpha = 0.15f),
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = if (isExpanded) Icons.Default.CalendarMonth else Icons.Default.Add,
                                contentDescription = null,
                                tint = if (isExpanded) Color.White else PortalPatients,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                    Column {
                        Text(
                            text = "Agendar nuevo turno",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (!isExpanded) {
                            Text(
                                text = "Elegir profesional, fecha y horario",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                IconButton(onClick = onToggleExpanded) {
                    Icon(
                        imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = if (isExpanded) "Colapsar" else "Expandir",
                        tint = AuTextSecondary,
                    )
                }
            }

            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    // Stepper estilo Nubank (1 acción por paso, transparente e informativo)
                    val currentStep = when {
                        selectedDoctor == null -> 1
                        selectedSlot == null -> 2
                        else -> 3
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        BookingStepPill(step = 1, title = "Profesional", isActive = currentStep == 1, isCompleted = currentStep > 1, modifier = Modifier.weight(1f))
                        BookingStepPill(step = 2, title = "Día y hora", isActive = currentStep == 2, isCompleted = currentStep > 2, modifier = Modifier.weight(1f))
                        BookingStepPill(step = 3, title = "Confirmar", isActive = currentStep == 3, isCompleted = false, modifier = Modifier.weight(1f))
                    }

                    // Selección de Profesional: CTA Primario inflado estilo Uber
                    if (selectedDoctor == null) {
                        val hasDoctors = availableDoctors.isNotEmpty()
                        Button(
                            onClick = { showDoctorSheet = true },
                            enabled = hasDoctors,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PortalPatients,
                                disabledContainerColor = AuSurfaceHover,
                                contentColor = Color.White,
                                disabledContentColor = AuTextTertiary,
                            ),
                            elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp, pressedElevation = 0.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = if (hasDoctors) Color.White.copy(alpha = 0.2f) else AuBorder,
                                        modifier = Modifier.size(32.dp),
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                imageVector = Icons.Outlined.MedicalServices,
                                                contentDescription = null,
                                                tint = if (hasDoctors) Color.White else AuTextTertiary,
                                                modifier = Modifier.size(18.dp),
                                            )
                                        }
                                    }
                                    Column {
                                        Text(
                                            text = if (hasDoctors) {
                                                if (availableDoctors.size == 1) {
                                                    "Elegir a ${availableDoctors.first().name.split(" ").take(2).joinToString(" ")}"
                                                } else {
                                                    "Elegir doctor"
                                                }
                                            } else {
                                                "Sin médicos disponibles"
                                            },
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = if (hasDoctors) Color.White else AuTextTertiary,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        if (hasDoctors) {
                                            Text(
                                                text = "${availableDoctors.size} especialista${if (availableDoctors.size != 1) "s" else ""} de guardia",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = Color.White.copy(alpha = 0.82f),
                                                maxLines = 1,
                                            )
                                        }
                                    }
                                }

                                if (hasDoctors) {
                                    Icon(
                                        imageVector = Icons.Default.ChevronRight,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(22.dp),
                                    )
                                }
                            }
                        }
                    } else {
                        // Tarjeta de médico seleccionado con botón "Cambiar" pulido estilo Nubank
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = PortalPatients.copy(alpha = 0.06f),
                            border = BorderStroke(1.5.dp, PortalPatients.copy(alpha = 0.35f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = availableDoctors.isNotEmpty()) { showDoctorSheet = true },
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                DoctorAvatar(
                                    name = selectedDoctor.name,
                                    avatarUrl = selectedDoctor.avatarUrl,
                                    doctorId = selectedDoctor.id,
                                    modifier = Modifier.size(42.dp),
                                )

                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Text(
                                            text = selectedDoctor.name,
                                            style = MaterialTheme.typography.titleSmall,
                                            color = AuTextPrimary,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f, fill = false),
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(4.dp),
                                            color = AuSuccess.copy(alpha = 0.14f),
                                        ) {
                                            Text(
                                                text = "Elegido",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = AuSuccess,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 9.sp,
                                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                                            )
                                        }
                                    }
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Text(
                                            text = selectedDoctor.specialty,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = PortalPatients,
                                            fontWeight = FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        if (!selectedDoctor.subspecialty.isNullOrBlank()) {
                                            Surface(
                                                shape = RoundedCornerShape(4.dp),
                                                color = PortalPatients.copy(alpha = 0.12f),
                                            ) {
                                                Text(
                                                    text = selectedDoctor.subspecialty,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = PortalPatients,
                                                    fontWeight = FontWeight.SemiBold,
                                                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                                                    maxLines = 1,
                                                    softWrap = false,
                                                )
                                            }
                                        }
                                        Text(
                                            text = "·",
                                            color = AuTextTertiary,
                                        )
                                        Text(
                                            text = if (selectedDoctor.consultationFee != null && selectedDoctor.consultationFee > 0) {
                                                "$${"%,.0f".format(selectedDoctor.consultationFee)}"
                                            } else {
                                                "Cubierto por plan"
                                            },
                                            style = MaterialTheme.typography.labelSmall,
                                            color = AuTextSecondary,
                                            maxLines = 1,
                                            softWrap = false,
                                        )
                                    }
                                }

                                if (availableDoctors.isNotEmpty()) {
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = PortalPatients.copy(alpha = 0.12f),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        ) {
                                            Text(
                                                text = if (availableDoctors.size > 1) "Cambiar" else "Ver",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = PortalPatients,
                                                fontWeight = FontWeight.Bold,
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

                    // Tira de fechas disponibles
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
                                val dayOfWeekInt = when (date.dayOfWeek) {
                                    DayOfWeek.SUNDAY -> 0
                                    DayOfWeek.MONDAY -> 1
                                    DayOfWeek.TUESDAY -> 2
                                    DayOfWeek.WEDNESDAY -> 3
                                    DayOfWeek.THURSDAY -> 4
                                    DayOfWeek.FRIDAY -> 5
                                    DayOfWeek.SATURDAY -> 6
                                }
                                val hasAttention = selectedDoctor?.availableDays?.let { days ->
                                    days.isNotEmpty() && dayOfWeekInt in days
                                } ?: true

                                DatePill(
                                    date = date,
                                    isSelected = isSelected,
                                    hasDoctorAttention = hasAttention,
                                    accentColor = PortalPatients,
                                    onClick = { onSelectDate(date) },
                                )
                            }
                        }
                    }

                    // Horarios disponibles desde el backend
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

                        when {
                            isLoadingSlots -> {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = AuBackground,
                                    border = BorderStroke(1.dp, AuBorder),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Row(
                                        modifier = Modifier.padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        CircularProgressIndicator(
                                            color = PortalPatients,
                                            strokeWidth = 2.dp,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Text(
                                            text = "Consultando disponibilidad del médico...",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AuTextSecondary,
                                        )
                                    }
                                }
                            }
                            selectedDoctor == null -> {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = AuBackground,
                                    border = BorderStroke(1.dp, AuBorder),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(
                                        text = "Elegí un profesional arriba para consultar sus horarios.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = AuTextTertiary,
                                        modifier = Modifier.padding(14.dp),
                                    )
                                }
                            }
                            availableSlots.isEmpty() -> {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = AuBackground,
                                    border = BorderStroke(1.dp, AuBorder),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(
                                        text = stringResource(R.string.booking_no_slots_for_date),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = AuTextTertiary,
                                        modifier = Modifier.padding(14.dp),
                                    )
                                }
                            }
                            else -> {
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
                    }

                    // Botones de acción: Confirmar y Cerrar
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = onConfirmBooking,
                            enabled = selectedDoctor != null && selectedSlot != null && !isBooking,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PortalPatients,
                                disabledContainerColor = AuSurfaceHover,
                                contentColor = Color.White,
                                disabledContentColor = AuTextTertiary,
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
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
                                    text = when {
                                        selectedDoctor == null -> "Seleccioná un médico"
                                        selectedSlot != null -> "Confirmar $selectedSlot hs"
                                        else -> "Seleccioná un horario"
                                    },
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    softWrap = false,
                                )
                            }
                        }

                        TextButton(
                            onClick = onToggleExpanded,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = "Cerrar",
                                color = AuTextSecondary,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
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
    hasDoctorAttention: Boolean = true,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val today = LocalDate.now()
    val locale = currentLocale
    val isPt = CountryContext.isBrazil(locale = locale)
    val dayName = when (date) {
        today -> if (isPt) "HOJE" else "HOY"
        today.plusDays(1) -> if (isPt) "AMAN" else "MAÑ"
        else -> date.format(DateTimeFormatter.ofPattern("EEE", locale)).uppercase()
    }
    val dayNum = date.dayOfMonth.toString()
    val monthName = date.format(DateTimeFormatter.ofPattern("MMM", locale)).uppercase()

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = when {
            isSelected -> accentColor
            hasDoctorAttention -> AuBackground
            else -> AuSurfaceHover.copy(alpha = 0.45f)
        },
        border = BorderStroke(
            width = 1.dp,
            color = when {
                isSelected -> accentColor
                hasDoctorAttention -> AuBorder
                else -> AuBorder.copy(alpha = 0.4f)
            },
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
                color = when {
                    isSelected -> Color.White.copy(alpha = 0.9f)
                    hasDoctorAttention -> AuTextTertiary
                    else -> AuTextTertiary.copy(alpha = 0.5f)
                },
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
                maxLines = 1,
                softWrap = false,
            )
            Text(
                text = dayNum,
                style = MaterialTheme.typography.titleLarge,
                color = when {
                    isSelected -> Color.White
                    hasDoctorAttention -> AuTextPrimary
                    else -> AuTextTertiary.copy(alpha = 0.6f)
                },
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                softWrap = false,
            )
            Text(
                text = monthName,
                style = MaterialTheme.typography.labelSmall,
                color = when {
                    isSelected -> Color.White.copy(alpha = 0.8f)
                    hasDoctorAttention -> AuTextTertiary
                    else -> AuTextTertiary.copy(alpha = 0.4f)
                },
                fontSize = 9.sp,
                maxLines = 1,
                softWrap = false,
            )
            if (hasDoctorAttention && !isSelected) {
                Surface(
                    shape = CircleShape,
                    color = PortalPatients,
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .size(4.dp),
                ) {}
            } else {
                Spacer(modifier = Modifier.height(6.dp))
            }
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
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}

@Composable
private fun BookingStepPill(
    step: Int,
    title: String,
    isActive: Boolean,
    isCompleted: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = when {
            isActive -> PortalPatients.copy(alpha = 0.14f)
            isCompleted -> AuSuccess.copy(alpha = 0.12f)
            else -> AuBackground
        },
        border = BorderStroke(
            width = 1.dp,
            color = when {
                isActive -> PortalPatients
                isCompleted -> AuSuccess
                else -> AuBorder
            },
        ),
        modifier = modifier.height(34.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Surface(
                shape = CircleShape,
                color = when {
                    isActive -> PortalPatients
                    isCompleted -> AuSuccess
                    else -> AuTextTertiary.copy(alpha = 0.3f)
                },
                modifier = Modifier.size(16.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isCompleted) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(12.dp),
                        )
                    } else {
                        Text(
                            text = step.toString(),
                            color = Color.White,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.width(5.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                color = when {
                    isActive -> PortalPatients
                    isCompleted -> AuSuccess
                    else -> AuTextTertiary
                },
                fontWeight = if (isActive || isCompleted) FontWeight.Bold else FontWeight.Medium,
                fontSize = 10.sp,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
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
    var selectedFilter by rememberSaveable { mutableStateOf("Todas") }
    val specialties = remember(doctors) {
        listOf("Todas") + doctors.map { it.specialty.trim() }.filter { it.isNotBlank() }.distinct().sorted()
    }

    val filteredDoctors = remember(doctors, selectedFilter) {
        if (selectedFilter.equals("Todas", ignoreCase = true)) {
            doctors
        } else {
            doctors.filter {
                it.specialty.contains(selectedFilter, ignoreCase = true) ||
                    it.subspecialty?.contains(selectedFilter, ignoreCase = true) == true
            }
        }
    }

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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Elegir profesional",
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "Tocá un médico para ver sus días y horarios disponibles",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = accentColor.copy(alpha = 0.12f),
                ) {
                    Text(
                        text = "${filteredDoctors.size} disponible${if (filteredDoctors.size != 1) "s" else ""}",
                        style = MaterialTheme.typography.labelSmall,
                        color = accentColor,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            if (specialties.size > 2) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(specialties, key = { it }) { spec ->
                        val isFilterSelected = spec.equals(selectedFilter, ignoreCase = true)
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = if (isFilterSelected) accentColor.copy(alpha = 0.16f) else AuBackground,
                            border = BorderStroke(
                                width = 1.dp,
                                color = if (isFilterSelected) accentColor else AuBorder,
                            ),
                            modifier = Modifier.clickable { selectedFilter = spec },
                        ) {
                            Text(
                                text = spec,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isFilterSelected) accentColor else AuTextSecondary,
                                fontWeight = if (isFilterSelected) FontWeight.Bold else FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            )
                        }
                    }
                }
            }

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filteredDoctors, key = { it.id }) { doctor ->
                    val isSelected = selectedDoctor?.id == doctor.id
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = if (isSelected) accentColor.copy(alpha = 0.10f) else Color.White,
                        border = BorderStroke(
                            width = if (isSelected) 2.dp else 1.dp,
                            color = if (isSelected) accentColor else Color(0xFFE2E8F0),
                        ),
                        shadowElevation = if (isSelected) 0.dp else 1.dp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelectDoctor(doctor) },
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            DoctorAvatar(
                                name = doctor.name,
                                avatarUrl = doctor.avatarUrl,
                                doctorId = doctor.id,
                                modifier = Modifier.size(46.dp),
                            )

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = doctor.name,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = AuTextPrimary,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    modifier = Modifier.padding(vertical = 2.dp),
                                ) {
                                    Text(
                                        text = doctor.specialty,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = accentColor,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (!doctor.subspecialty.isNullOrBlank()) {
                                        Surface(
                                            shape = RoundedCornerShape(4.dp),
                                            color = accentColor.copy(alpha = 0.12f),
                                        ) {
                                            Text(
                                                text = doctor.subspecialty,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = accentColor,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                                                maxLines = 1,
                                                softWrap = false,
                                            )
                                        }
                                    }
                                }
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text(
                                        text = doctor.licenseNumber,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = AuTextTertiary,
                                    )
                                    Text(text = "·", color = AuTextTertiary)
                                    Text(
                                        text = if (doctor.consultationFee != null && doctor.consultationFee > 0) {
                                            "Arancel: $${"%,.0f".format(doctor.consultationFee)}"
                                        } else {
                                            "Cubierto por plan"
                                        },
                                        style = MaterialTheme.typography.labelSmall,
                                        color = if (doctor.consultationFee != null && doctor.consultationFee > 0) AuTextSecondary else AuSuccess,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }

                            if (isSelected) {
                                Icon(
                                    imageVector = Icons.Outlined.CheckCircle,
                                    contentDescription = "Seleccionado",
                                    tint = accentColor,
                                    modifier = Modifier.size(24.dp),
                                )
                            } else {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = accentColor.copy(alpha = 0.08f),
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                                    ) {
                                        Text(
                                            text = "Elegir",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = accentColor,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Icon(
                                            imageVector = Icons.Default.ChevronRight,
                                            contentDescription = null,
                                            tint = accentColor,
                                            modifier = Modifier.size(14.dp),
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
private fun DoctorAgendaFilterChips(
    selectedFilter: String,
    onSelectFilter: (String) -> Unit,
    todayCount: Int,
    totalCount: Int,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DoctorFilterChip(
            label = "Todos ($totalCount)",
            selected = selectedFilter == "all",
            onClick = { onSelectFilter("all") },
        )
        DoctorFilterChip(
            label = "Hoy ($todayCount)",
            selected = selectedFilter == "today",
            onClick = { onSelectFilter("today") },
        )
        DoctorFilterChip(
            label = "Próximos",
            selected = selectedFilter == "upcoming",
            onClick = { onSelectFilter("upcoming") },
        )
    }
}

@Composable
private fun DoctorFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (selected) PortalDoctors else Color.White,
        border = BorderStroke(
            1.dp,
            if (selected) PortalDoctors else Color(0xFFE2E8F0),
        ),
        shadowElevation = if (selected) 1.dp else 0.dp,
        modifier = modifier.clickable(onClick = onClick),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = if (selected) Color.White else AuTextSecondary,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
        )
    }
}

@Composable
private fun DoctorAgendaDaySection(
    day: AgendaDay,
    patientNames: Map<String, String>,
    joinableAppointmentIds: Set<String>,
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = formatSectionDate(day.date),
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "${day.appointments.size} turno${if (day.appointments.size == 1) "" else "s"} programado${if (day.appointments.size == 1) "" else "s"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                )
            }

            if (day.hasJoinableAppointment) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0xFFECFDF5),
                    border = BorderStroke(1.dp, Color(0xFF10B981).copy(alpha = 0.4f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF10B981)),
                        )
                        Text(
                            text = "Sala lista",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            color = Color(0xFF047857),
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            day.appointments.forEach { appointment ->
                val isJoinable = appointment.isTelemedicineJoinCandidate() || appointment.id in joinableAppointmentIds
                DoctorAgendaAppointmentCard(
                    appointment = appointment,
                    patientName = patientNames[appointment.patientId],
                    isJoinable = isJoinable,
                    onJoinCall = if (isJoinable) {
                        { onNavigateToVideoCall(appointment.id) }
                    } else null,
                )
            }
        }
    }
}

@Composable
private fun DoctorAgendaAppointmentCard(
    appointment: Appointment,
    patientName: String?,
    isJoinable: Boolean,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val isInProgress = appointment.status == AppointmentStatus.IN_PROGRESS
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        border = BorderStroke(
            1.dp,
            when {
                isInProgress -> Color(0xFF10B981)
                isJoinable -> Color(0xFF38BDF8)
                else -> Color(0xFFE2E8F0)
            },
        ),
        shadowElevation = if (isInProgress || isJoinable) 2.dp else 1.dp,
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Pill con hora y duración
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = when {
                    isInProgress -> Color(0xFFECFDF5)
                    isJoinable -> Color(0xFFF0F9FF)
                    else -> Color(0xFFF8FAFC)
                },
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = formatAppointmentTime(appointment.startTime),
                        style = MaterialTheme.typography.labelMedium,
                        color = when {
                            isInProgress -> Color(0xFF047857)
                            isJoinable -> Color(0xFF0284C7)
                            else -> AuTextPrimary
                        },
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "${appointment.durationMinutes ?: 15}min",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                        fontSize = 9.sp,
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Información clínica y nombre del paciente
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = patientName ?: "Paciente #${appointment.id.takeLast(4)}",
                    style = MaterialTheme.typography.bodyLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = displayAppointmentType(appointment.type),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = " · ",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                    DoctorStatusDot(appointment.status)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = displayDoctorStatus(appointment.status),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                appointment.notes?.takeIf { it.isNotBlank() }?.let { notes ->
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = notes,
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            // Botón de atención directa si está joinable
            if (onJoinCall != null) {
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = onJoinCall,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF10B981),
                        contentColor = Color.White,
                    ),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Icon(
                        Icons.Default.Videocam,
                        contentDescription = "Atender",
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        "Atender",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun DoctorStatusDot(status: AppointmentStatus) {
    val color = when (status) {
        AppointmentStatus.PAYMENT_PENDING -> Color(0xFFD97706)
        AppointmentStatus.IN_PROGRESS -> PortalDoctors
        AppointmentStatus.CONFIRMED -> AuSuccess
        AppointmentStatus.SCHEDULED -> AuAccent
        AppointmentStatus.COMPLETED -> AuTextTertiary
        AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW -> Color(0xFFEF4444)
    }
    Box(
        modifier = Modifier
            .size(6.dp)
            .clip(CircleShape)
            .background(color),
    )
}

private fun displayDoctorStatus(status: AppointmentStatus): String = when (status) {
    AppointmentStatus.PAYMENT_PENDING -> "Pago pendiente"
    AppointmentStatus.SCHEDULED -> "Programada"
    AppointmentStatus.CONFIRMED -> "Confirmada"
    AppointmentStatus.IN_PROGRESS -> "En curso"
    AppointmentStatus.COMPLETED -> "Completada"
    AppointmentStatus.CANCELLED -> "Cancelada"
    AppointmentStatus.NO_SHOW -> "Ausente"
}

private fun formatAppointmentTime(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("HH:mm", CountryContext.getLocale()))
    } catch (_: Exception) {
        ""
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
                hasJoinableAppointment = dayAppointments.any { it.isTelemedicineJoinCandidate() || it.id in joinableAppointmentIds },
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
    val locale = currentLocale
    val isPt = CountryContext.isBrazil(locale = locale)
    return when (date) {
        today -> if (isPt) "Hoje às $time" else "Hoy a las $time hs"
        today.plusDays(1) -> if (isPt) "Amanhã às $time" else "Mañana a las $time hs"
        else -> {
            val pattern = if (isPt) "EEE, d 'de' MMM · HH:mm" else "EEE d MMM · HH:mm 'hs'"
            dateTime.format(DateTimeFormatter.ofPattern(pattern, locale))
                .replaceFirstChar { it.uppercase() }
        }
    }
}

private fun formatSectionDate(date: LocalDate): String {
    val today = LocalDate.now()
    val locale = currentLocale
    val isPt = CountryContext.isBrazil(locale = locale)
    return when {
        date == today -> if (isPt) "Hoje" else "Hoy"
        date == today.plusDays(1) -> if (isPt) "Amanhã" else "Mañana"
        else -> {
            val pattern = if (isPt) "EEEE, d 'de' MMMM" else "EEEE d 'de' MMMM"
            date.format(DateTimeFormatter.ofPattern(pattern, locale))
                .replaceFirstChar { it.uppercase() }
        }
    }
}

private fun formatSectionDateShort(date: LocalDate): String {
    val today = LocalDate.now()
    val locale = currentLocale
    val isPt = CountryContext.isBrazil(locale = locale)
    return when (date) {
        today -> if (isPt) "Hoje" else "Hoy"
        today.plusDays(1) -> if (isPt) "Amanhã" else "Mañana"
        else -> date.format(DateTimeFormatter.ofPattern("d 'de' MMMM", locale))
    }
}

private fun parseDateTime(value: String): OffsetDateTime? {
    return runCatching { OffsetDateTime.parse(value) }.getOrNull()
}

private fun parseLocalDate(value: String): LocalDate? {
    return parseDateTime(value)?.toLocalDate()
}
