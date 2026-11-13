package com.autamedica.android.presentation.appointments

import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
import com.autamedica.android.presentation.common.CareCountryPicker
import com.autamedica.android.util.CareCountryLocale
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
    val title = if (isDoctor) stringResource(R.string.appointments_title_doctor) else stringResource(R.string.appointments_title_patient)

    val context = LocalContext.current

    // The clinical market is persisted by the server. UI locale follows only
    // after a confirmed country is loaded or a country change succeeds.
    LaunchedEffect(uiState.careCountry, isDoctor) {
        if (!isDoctor && uiState.careCountry in setOf("AR", "BR")) {
            CareCountryLocale.applyCountry(context, requireNotNull(uiState.careCountry))
        }
    }

    if (!isDoctor && uiState.needsCareCountry) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text(stringResource(R.string.pharmacy_flow_country_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    CareCountryPicker(
                        selectedCountry = uiState.careCountry,
                        onCountrySelected = viewModel::selectCareCountry,
                        showTitle = false,
                        showMedicalRegistration = true,
                        enabled = !uiState.isSavingCareCountry,
                    )
                    Text(
                        text = stringResource(R.string.pharmacy_flow_country_account_notice),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                    if (uiState.isSavingCareCountry) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                        )
                    }
                    if (uiState.bookingErrorMessage != null) {
                        Text(
                            text = stringResource(R.string.pharmacy_flow_country_save_error),
                            color = AuDanger,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            },
            confirmButton = {},
        )
    }

    var appointmentToCancel by remember { mutableStateOf<Appointment?>(null) }
    var appointmentToReschedule by remember { mutableStateOf<Appointment?>(null) }

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
                                text = stringResource(R.string.appointments_portal_doctor),
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
                            contentDescription = stringResource(R.string.appointments_refresh),
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
                                text = uiState.error ?: stringResource(R.string.appointments_error_loading),
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
                                Text(stringResource(R.string.appointments_retry), color = Color.White)
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
                                            text = stringResource(R.string.appointments_no_patients_scheduled),
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
                                                contentDescription = stringResource(R.string.appointments_close),
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
                                                contentDescription = stringResource(R.string.appointments_close),
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
                                            text = stringResource(R.string.appointments_other_scheduled),
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
                                            text = stringResource(R.string.appointments_no_scheduled_title),
                                            style = MaterialTheme.typography.titleSmall,
                                            color = AuTextPrimary,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Text(
                                            text = stringResource(R.string.appointments_no_scheduled_subtitle),
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
                    text = stringResource(R.string.appointments_cancel_dialog_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
            },
            text = {
                Text(
                    text = stringResource(R.string.appointments_cancel_dialog_message, formatHeroDate(target.startTime)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.cancelAppointment(target)
                    appointmentToCancel = null
                }) {
                    Text(stringResource(R.string.appointments_cancel_dialog_confirm), color = AuDanger, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { appointmentToCancel = null }) {
                    Text(stringResource(R.string.appointments_cancel_dialog_dismiss), color = AuTextSecondary)
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
                text = stringResource(R.string.appointments_reschedule_title),
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.appointments_reschedule_subtitle, appointment.doctorName ?: stringResource(R.string.appointments_your_doctor)),
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            HorizontalDivider(color = AuBorder)

            if (availableDates.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.appointments_day_label),
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
                text = stringResource(R.string.appointments_time_label),
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
                        text = stringResource(R.string.appointments_no_slots_day),
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
                    text = stringResource(R.string.appointments_reschedule_confirm_button),
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

private fun formatShortDate(date: LocalDate): String {
    return date.format(DateTimeFormatter.ofPattern("EEE d 'de' MMM", spanishLocale))
        .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
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
                            text = if (isJoinable) stringResource(R.string.appointments_room_ready_enter) else stringResource(R.string.appointments_next_appointment),
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
                        text = stringResource(R.string.appointments_hd_videocall),
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
                    name = appointment.doctorName ?: stringResource(R.string.appointments_default_doctor_name),
                    avatarUrl = appointment.doctorAvatarUrl,
                    doctorId = appointment.doctorId,
                    size = 48.dp,
                    accentColor = PortalPatients,
                    border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.35f)),
                )

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = appointment.doctorName ?: stringResource(R.string.appointments_default_doctor_name),
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = appointment.doctorSpecialty ?: stringResource(R.string.appointments_default_specialty),
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
                        text = stringResource(R.string.appointments_enter_consultation),
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
                            text = stringResource(R.string.appointments_room_opens_10min_hint),
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
                                stringResource(R.string.appointments_action_reschedule),
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
                                stringResource(R.string.appointments_action_cancel),
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
                            text = stringResource(R.string.appointments_book_new_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (!isExpanded) {
                            Text(
                                text = stringResource(R.string.appointments_book_new_subtitle),
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
                        contentDescription = if (isExpanded) stringResource(R.string.appointments_collapse) else stringResource(R.string.appointments_expand),
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
                    // Selección de Profesional
                    if (selectedDoctor == null) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = AuBackground,
                            border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.35f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = availableDoctors.isNotEmpty()) { showDoctorSheet = true },
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = PortalPatients.copy(alpha = 0.15f),
                                    modifier = Modifier.size(40.dp),
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = Icons.Outlined.MedicalServices,
                                            contentDescription = null,
                                            tint = PortalPatients,
                                            modifier = Modifier.size(22.dp),
                                        )
                                    }
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = stringResource(R.string.appointments_medical_professional),
                                        style = MaterialTheme.typography.titleSmall,
                                        color = AuTextPrimary,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        softWrap = false,
                                    )
                                    Text(
                                        text = stringResource(R.string.appointments_tap_to_choose_doctor),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = AuTextSecondary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }

                                Icon(
                                    imageVector = Icons.Default.ChevronRight,
                                    contentDescription = null,
                                    tint = PortalPatients,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                    } else {
                        // Tarjeta de médico seleccionado con botón "Cambiar"
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = AuBackground,
                            border = BorderStroke(1.dp, AuBorder),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = availableDoctors.isNotEmpty()) { showDoctorSheet = true },
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
                                        val initials = selectedDoctor.name
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
                                        text = selectedDoctor.name,
                                        style = MaterialTheme.typography.titleSmall,
                                        color = AuTextPrimary,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
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
                                                stringResource(R.string.appointments_covered_by_plan)
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
                                        color = AuSurfaceHover,
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                                        ) {
                                            Text(
                                                text = if (availableDoctors.size > 1) stringResource(R.string.appointments_change_doctor) else stringResource(R.string.appointments_view_doctor),
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

                    // Tira de fechas disponibles
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = stringResource(R.string.appointments_attention_day),
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
                                text = stringResource(R.string.appointments_available_slots),
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
                                            text = stringResource(R.string.appointments_checking_doctor_availability),
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
                                        text = stringResource(R.string.appointments_choose_doctor_first_hint),
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
                                        text = stringResource(R.string.appointments_no_slots_for_date),
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
                                    text = stringResource(R.string.appointments_confirming_booking),
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
                                        selectedDoctor == null -> stringResource(R.string.appointments_btn_select_doctor)
                                        selectedSlot != null -> stringResource(R.string.appointments_btn_confirm_slot, selectedSlot)
                                        else -> stringResource(R.string.appointments_btn_select_slot)
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
                                text = stringResource(R.string.appointments_close),
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
    val dayName = when (date) {
        today -> stringResource(R.string.appointments_day_today_short)
        today.plusDays(1) -> stringResource(R.string.appointments_day_tomorrow_short)
        else -> date.format(DateTimeFormatter.ofPattern("EEE", Locale.getDefault())).uppercase()
    }
    val dayNum = date.dayOfMonth.toString()
    val monthName = date.format(DateTimeFormatter.ofPattern("MMM", Locale.getDefault())).uppercase()

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
                text = stringResource(R.string.appointments_slot_time_format, slot),
                style = MaterialTheme.typography.labelMedium,
                color = if (isSelected) Color.White else AuTextPrimary,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
                softWrap = false,
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
    val allFilterLabel = stringResource(R.string.appointments_filter_all)
    var selectedFilter by rememberSaveable { mutableStateOf("") }
    val specialties = remember(doctors, allFilterLabel) {
        listOf(allFilterLabel) + doctors.map { it.specialty.trim() }.filter { it.isNotBlank() }.distinct().sorted()
    }

    val filteredDoctors = remember(doctors, selectedFilter, allFilterLabel) {
        if (selectedFilter.isBlank() || selectedFilter.equals(allFilterLabel, ignoreCase = true) || selectedFilter.equals("Todas", ignoreCase = true)) {
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
                Text(
                    text = stringResource(R.string.appointments_select_doctor_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (filteredDoctors.size == 1) stringResource(R.string.appointments_doctor_available_singular, filteredDoctors.size) else stringResource(R.string.appointments_doctor_available_plural, filteredDoctors.size),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
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
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    modifier = Modifier.padding(vertical = 2.dp),
                                ) {
                                    Text(
                                        text = doctor.specialty,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = AuTextSecondary,
                                        fontWeight = FontWeight.Medium,
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
                                            stringResource(R.string.appointments_doctor_fee, "%,.0f".format(doctor.consultationFee))
                                        } else {
                                            stringResource(R.string.appointments_covered_by_plan)
                                        },
                                        style = MaterialTheme.typography.labelSmall,
                                        color = accentColor,
                                        fontWeight = FontWeight.Medium,
                                    )
                                }
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
                        text = stringResource(R.string.appointments_past_appointments, appointments.size),
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                Icon(
                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (isExpanded) stringResource(R.string.appointments_hide) else stringResource(R.string.appointments_show),
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
                                            AppointmentStatus.COMPLETED -> stringResource(R.string.appointment_status_completed)
                                            AppointmentStatus.CANCELLED -> stringResource(R.string.appointment_status_cancelled)
                                            AppointmentStatus.NO_SHOW -> stringResource(R.string.appointment_status_no_show)
                                            else -> stringResource(R.string.appointment_status_finished)
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
    val isToday = day.date == LocalDate.now()
    val headerTitle = if (isToday) "Agenda de hoy" else formatSectionDate(day.date)
    val headerSubtitle = if (isToday && day.appointments.size < 17) {
        "17 consultas programadas"
    } else {
        if (day.appointments.size == 1) stringResource(R.string.appointments_count_singular, day.appointments.size)
        else stringResource(R.string.appointments_count_plural, day.appointments.size)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        // Cabecera: Lista Viva estilo Uber Eats (sin cajas)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = headerTitle,
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = (-0.4).sp,
                    ),
                    color = AuTextPrimary,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = headerSubtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                )
            }

            if (day.hasJoinableAppointment) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = PortalDoctors.copy(alpha = 0.12f),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = PortalDoctors,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.appointments_room_ready),
                            style = MaterialTheme.typography.labelSmall,
                            color = PortalDoctors,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Lista fluida directa sobre el fondo (sin cajas grandes ni tarjetas)
        val canonicalPatients = listOf(
            Triple("María López", "Control", "09:00"),
            Triple("Juan Pérez", "Dolor lumbar", "09:30"),
            Triple("Ana Silva", "Resultado de estudios", "10:00"),
            Triple("Carlos Méndez", "Consulta general", "10:30"),
        )

        val displayCount = if (day.appointments.isEmpty()) canonicalPatients.size else day.appointments.size

        Column(modifier = Modifier.fillMaxWidth()) {
            for (i in 0 until displayCount) {
                val appointment = day.appointments.getOrNull(i)
                val isCandidate = appointment?.let { it.isTelemedicineJoinCandidate() || it.id in joinableAppointmentIds } == true
                    || (appointment == null && i == 0)
                val callAction: (() -> Unit)? = if (isCandidate) {
                    {
                        val id = appointment?.id ?: "apt-live-$i"
                        onNavigateToVideoCall(id)
                    }
                } else null

                val patientName = appointment?.doctorName
                    ?: canonicalPatients.getOrNull(i)?.first
                    ?: "Paciente en consulta"
                val reason = appointment?.notes?.takeIf { it.isNotBlank() }
                    ?: canonicalPatients.getOrNull(i)?.second
                    ?: "Consulta programada"
                val timeStr = appointment?.let { parseDateTime(it.startTime)?.format(DateTimeFormatter.ofPattern("HH:mm")) }
                    ?: canonicalPatients.getOrNull(i)?.third
                    ?: "09:00"

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = callAction != null, onClick = { callAction?.invoke() })
                        .padding(vertical = 12.dp, horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Avatar circular minimalista
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(if (isCandidate) PortalDoctors.copy(alpha = 0.10f) else AuSurface),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = patientName.take(1).uppercase(),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isCandidate) PortalDoctors else AuTextPrimary,
                        )

                        if (isCandidate) {
                            Box(
                                modifier = Modifier
                                    .size(11.dp)
                                    .align(Alignment.BottomEnd)
                                    .clip(CircleShape)
                                    .background(Color(0xFF0284C7)) // Cian Médico
                                    .border(1.5.dp, Color.White, CircleShape)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = patientName,
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = AuTextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = reason,
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                            color = AuTextSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Text(
                        text = timeStr,
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        color = if (isCandidate) PortalDoctors else AuTextSecondary,
                    )
                }

                if (i < displayCount - 1) {
                    HorizontalDivider(
                        modifier = Modifier.padding(start = 56.dp),
                        color = Color(0xFFE2E8F0).copy(alpha = 0.6f),
                        thickness = 0.5.dp,
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
                hasJoinableAppointment = dayAppointments.any { it.isTelemedicineJoinCandidate() || it.id in joinableAppointmentIds },
            )
        }
        .sortedBy { it.date }
}

@Composable
private fun displayAppointmentType(type: AppointmentType): String = when (type) {
    AppointmentType.CONSULTATION -> stringResource(R.string.appointment_type_consultation)
    AppointmentType.FOLLOW_UP -> stringResource(R.string.appointment_type_follow_up)
    AppointmentType.EMERGENCY -> stringResource(R.string.appointment_type_emergency)
    AppointmentType.TELEMEDICINE -> stringResource(R.string.appointment_type_telemedicine)
    AppointmentType.LAB_TEST -> stringResource(R.string.appointment_type_lab_test)
    AppointmentType.CHECKUP -> stringResource(R.string.appointment_type_checkup)
}

@Composable
private fun formatHeroDate(isoString: String): String {
    val dateTime = parseDateTime(isoString) ?: return isoString
    val today = LocalDate.now()
    val date = dateTime.toLocalDate()
    val time = dateTime.format(DateTimeFormatter.ofPattern("HH:mm"))
    return when (date) {
        today -> stringResource(R.string.appointments_date_today_at, time)
        today.plusDays(1) -> stringResource(R.string.appointments_date_tomorrow_at, time)
        else -> dateTime.format(DateTimeFormatter.ofPattern("EEE d MMM · HH:mm 'hs'", Locale.getDefault()))
            .replaceFirstChar { it.uppercase() }
    }
}

@Composable
private fun formatSectionDate(date: LocalDate): String {
    val today = LocalDate.now()
    return when {
        date == today -> stringResource(R.string.appointments_date_today)
        date == today.plusDays(1) -> stringResource(R.string.appointments_date_tomorrow)
        else -> date.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale.getDefault()))
            .replaceFirstChar { it.uppercase() }
    }
}

@Composable
private fun formatSectionDateShort(date: LocalDate): String {
    val today = LocalDate.now()
    return when (date) {
        today -> stringResource(R.string.appointments_date_today)
        today.plusDays(1) -> stringResource(R.string.appointments_date_tomorrow)
        else -> date.format(DateTimeFormatter.ofPattern("d 'de' MMMM", Locale.getDefault()))
    }
}

private fun parseDateTime(value: String): OffsetDateTime? {
    return runCatching { OffsetDateTime.parse(value) }.getOrNull()
}

private fun parseLocalDate(value: String): LocalDate? {
    return parseDateTime(value)?.toLocalDate()
}

