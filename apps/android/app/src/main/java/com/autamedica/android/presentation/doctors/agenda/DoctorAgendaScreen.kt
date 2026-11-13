package com.autamedica.android.presentation.doctors.agenda

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.presentation.dashboard.components.DoctorPharmacyOnDutyCard
import com.autamedica.android.presentation.doctors.agenda.components.AppointmentDetailsBottomSheet
import com.autamedica.android.presentation.doctors.agenda.components.AppointmentListItem
import com.autamedica.android.presentation.doctors.agenda.components.AvailabilityEditor
import com.autamedica.android.presentation.doctors.agenda.components.CreateDoctorAppointmentBottomSheet
import com.autamedica.android.presentation.doctors.agenda.components.DoctorTimelineView
import com.autamedica.android.presentation.doctors.agenda.components.ThirtyDayWaffleCalendar
import com.autamedica.android.presentation.doctors.agenda.components.TurnoActualHeroCard
import com.autamedica.android.presentation.doctors.agenda.components.WeekDaySelectorStrip
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorAgendaScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToVideoCall: (appointmentId: String) -> Unit = {},
    onNavigateToDoctorOnDemand: () -> Unit = {},
    onNavigateToCreatePrescription: (patientId: String) -> Unit = {},
    onNavigateToCreateMedicalOrder: (patientId: String) -> Unit = {},
    onNavigateToCreateCertificate: (patientId: String) -> Unit = {},
    onNavigateToConsultationReport: (appointmentId: String) -> Unit = {},
    viewModel: DoctorAgendaViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val isToday = uiState.selectedDate == LocalDate.now()
    val patientRegisteredFallback = stringResource(R.string.doctor_agenda_patient_registered)
    val guestExternalFallback = stringResource(R.string.doctor_agenda_guest_external)
    fun resolvePatientName(appt: com.autamedica.android.domain.model.Appointment) =
        viewModel.getPatientName(appt, patientRegisteredFallback, guestExternalFallback)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.doctor_agenda_title),
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = if (uiState.isTimelineView) {
                                stringResource(R.string.doctor_agenda_subtitle_timeline)
                            } else {
                                stringResource(R.string.doctor_agenda_subtitle_list)
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = PortalDoctors,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.doctor_agenda_nav_back),
                            tint = AuTextPrimary,
                        )
                    }
                },
                actions = {
                    // Toggle View Mode (Timeline vs List)
                    IconButton(onClick = viewModel::toggleViewMode) {
                        Surface(
                            shape = CircleShape,
                            color = if (uiState.isTimelineView) PortalDoctors.copy(alpha = 0.12f) else Color.Transparent,
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                imageVector = if (uiState.isTimelineView) Icons.AutoMirrored.Filled.FormatListBulleted else Icons.Outlined.Schedule,
                                contentDescription = if (uiState.isTimelineView) {
                                    stringResource(R.string.doctor_agenda_cd_view_list)
                                } else {
                                    stringResource(R.string.doctor_agenda_cd_view_timeline)
                                },
                                tint = if (uiState.isTimelineView) PortalDoctors else AuTextTertiary,
                                modifier = Modifier.padding(7.dp),
                            )
                        }
                    }

                    // Waffle Calendar toggle icon
                    IconButton(onClick = viewModel::toggleWaffleCalendar) {
                        Surface(
                            shape = CircleShape,
                            color = if (uiState.showWaffleCalendar) PortalDoctors.copy(alpha = 0.15f) else Color.Transparent,
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CalendarMonth,
                                contentDescription = stringResource(R.string.doctor_agenda_cd_waffle_calendar),
                                tint = if (uiState.showWaffleCalendar) PortalDoctors else AuTextTertiary,
                                modifier = Modifier.padding(7.dp),
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBackground),
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { viewModel.openCreateAppointment() },
                containerColor = PortalDoctors,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp),
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text(stringResource(R.string.doctor_agenda_btn_new_appointment), fontWeight = FontWeight.Bold) },
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // Horizontal Weekday Strip (Doctolib style)
            WeekDaySelectorStrip(
                selectedDate = uiState.selectedDate,
                appointments = uiState.appointments,
                onSelectDate = viewModel::selectDate,
            )

            PullToRefreshBox(
                isRefreshing = uiState.isRefreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    uiState.isLoading && uiState.appointments.isEmpty() -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                                Text(
                                    text = stringResource(R.string.doctor_agenda_loading_sync),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = AuTextTertiary,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp,
                                )
                            }
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
                                        imageVector = Icons.Outlined.EventBusy,
                                        contentDescription = null,
                                        modifier = Modifier.padding(16.dp),
                                        tint = AuDanger,
                                    )
                                }
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    text = when (uiState.error) {
                                        "No se pudo cargar la agenda médica" -> stringResource(R.string.doctor_agenda_error_loading)
                                        else -> uiState.error.orEmpty()
                                    },
                                    color = AuDanger,
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.Medium,
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = stringResource(R.string.doctor_agenda_swipe_retry),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuTextTertiary,
                                )
                            }
                        }
                    }

                    else -> {
                        LazyColumn(
                            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 88.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            // 1. Editor de Disponibilidad Semanal
                            item {
                                AvailabilityEditor(
                                    slots = uiState.availabilitySlots,
                                    isOpen = uiState.isAvailabilityOpen,
                                    saveStatus = uiState.availabilitySaveStatus,
                                    errorMessage = uiState.availabilityError,
                                    onToggleOpen = viewModel::toggleAvailabilityOpen,
                                    onAddSlot = viewModel::addSlot,
                                    onRemoveSlot = viewModel::removeSlot,
                                    onUpdateSlot = viewModel::updateSlot,
                                    onApplyTemplate = viewModel::applyTemplate,
                                    onSave = viewModel::saveAvailability,
                                )
                            }

                            // 2. Calendario Waffle 30 días (si está activo)
                            if (uiState.showWaffleCalendar) {
                                item {
                                    ThirtyDayWaffleCalendar(
                                        appointments = uiState.appointments,
                                        selectedDate = uiState.selectedDate,
                                        onSelectDate = viewModel::selectDate,
                                    )
                                }
                            }

                            // 2.5 Guardia Farmacia On-Demand
                            item {
                                DoctorPharmacyOnDutyCard(
                                    state = uiState.pharmacyOnDutyState,
                                    onToggleDuty = viewModel::togglePharmacyOnDuty,
                                    // Agenda is only a shortcut; the verified
                                    // offer countdown/claim lives in DoctorOnDemand.
                                    onClaimRequest = { _ -> onNavigateToDoctorOnDemand() },
                                    claimingRequestId = uiState.claimingPharmacyRequestId,
                                )
                            }

                            // 3. Turno Actual Hero Card (si estamos viendo el día de hoy)
                            if (isToday) {
                                uiState.currentTurno?.let { turno ->
                                    item {
                                        TurnoActualHeroCard(
                                            appointment = turno,
                                            patientName = resolvePatientName(turno),
                                            patientContext = turno.patientId?.let { uiState.patientContexts[it] },
                                            isContextLoading = uiState.isContextLoading,
                                            onStartCall = { onNavigateToVideoCall(turno.id) },
                                            onViewDetail = { viewModel.selectAppointment(turno) },
                                        )
                                    }
                                }
                            }

                            // 4. Modo Línea de Tiempo vs. Modo Lista
                            if (uiState.isTimelineView) {
                                item {
                                    DoctorTimelineView(
                                        selectedDate = uiState.selectedDate,
                                        appointments = uiState.appointments,
                                        getPatientName = ::resolvePatientName,
                                        onSelectAppointment = viewModel::selectAppointment,
                                        onBookSlot = { hourStr -> viewModel.openCreateAppointment(hourStr) },
                                        onStartCall = onNavigateToVideoCall,
                                    )
                                }
                            } else {
                                // Vista de Lista
                                item {
                                    Surface(
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(20.dp),
                                        color = Color.White,
                                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                        shadowElevation = 1.dp,
                                    ) {
                                        Column(modifier = Modifier.padding(16.dp)) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Text(
                                                    text = stringResource(R.string.doctor_agenda_daily_list_title),
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = AuTextTertiary,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 10.sp,
                                                    letterSpacing = 1.5.sp,
                                                )

                                                Surface(
                                                    shape = RoundedCornerShape(999.dp),
                                                    color = Color(0xFFF1F5F9),
                                                ) {
                                                    Text(
                                                        text = if (uiState.filteredAppointments.size == 1) {
                                                            stringResource(R.string.doctor_agenda_appointments_count_single, uiState.filteredAppointments.size)
                                                        } else {
                                                            stringResource(R.string.doctor_agenda_appointments_count_plural, uiState.filteredAppointments.size)
                                                        },
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = Color(0xFF475569),
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 10.sp,
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                                    )
                                                }
                                            }

                                            Spacer(modifier = Modifier.height(12.dp))
                                            HorizontalDivider(color = Color(0xFFF1F5F9))
                                            Spacer(modifier = Modifier.height(10.dp))

                                            if (uiState.filteredAppointments.isEmpty()) {
                                                Column(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .padding(vertical = 32.dp),
                                                    horizontalAlignment = Alignment.CenterHorizontally,
                                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Outlined.CalendarMonth,
                                                        contentDescription = null,
                                                        tint = AuTextTertiary.copy(alpha = 0.5f),
                                                        modifier = Modifier.size(36.dp),
                                                    )
                                                    Text(
                                                        text = stringResource(R.string.doctor_agenda_empty_day_title),
                                                        style = MaterialTheme.typography.bodyMedium,
                                                        fontWeight = FontWeight.Bold,
                                                        color = AuTextTertiary,
                                                    )
                                                    Text(
                                                        text = stringResource(R.string.doctor_agenda_empty_day_hint),
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = AuTextTertiary.copy(alpha = 0.8f),
                                                    )
                                                }
                                            } else {
                                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    uiState.filteredAppointments.forEach { appt ->
                                                        AppointmentListItem(
                                                            appointment = appt,
                                                            patientName = resolvePatientName(appt),
                                                            isSelected = uiState.selectedAppointment?.id == appt.id,
                                                            isCurrent = uiState.currentTurno?.id == appt.id,
                                                            onClick = { viewModel.selectAppointment(appt) },
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
            }
        }
    }

    // 5. Panel / BottomSheet de Detalle de Cita con Cockpit Clínico Completo
    if (uiState.isDetailsSheetOpen && uiState.selectedAppointment != null) {
        val selectedAppt = uiState.selectedAppointment!!
        AppointmentDetailsBottomSheet(
            appointment = selectedAppt,
            patientName = resolvePatientName(selectedAppt),
            patientContext = selectedAppt.patientId?.let { uiState.patientContexts[it] },
            isContextLoading = uiState.isContextLoading,
            onDismiss = viewModel::closeDetailsSheet,
            onStartCall = {
                viewModel.closeDetailsSheet()
                onNavigateToVideoCall(selectedAppt.id)
            },
            onStatusChange = { newStatus ->
                viewModel.updateAppointmentStatus(selectedAppt.id, newStatus)
            },
            onNavigateToCreatePrescription = onNavigateToCreatePrescription,
            onNavigateToCreateMedicalOrder = onNavigateToCreateMedicalOrder,
            onNavigateToCreateCertificate = onNavigateToCreateCertificate,
            onNavigateToConsultationReport = onNavigateToConsultationReport,
        )
    }

    // 6. Modal / BottomSheet para Crear Nuevo Turno / Sobreturno Express
    if (uiState.isCreateSheetOpen) {
        CreateDoctorAppointmentBottomSheet(
            selectedDate = uiState.selectedDate,
            initialTime = uiState.createSheetInitialTime,
            patients = uiState.doctorPatients,
            isSubmitting = uiState.isSubmittingAppointment,
            onDismiss = viewModel::closeCreateAppointment,
            onSubmit = { patientId, guestName, guestPhone, startTime, endTime, type, reason ->
                viewModel.createDoctorAppointment(
                    patientId = patientId,
                    guestName = guestName,
                    guestPhone = guestPhone,
                    startTime = startTime,
                    endTime = endTime,
                    type = type,
                    reason = reason,
                )
            },
        )
    }

    // Do not build a synthetic offer without offer_id/expires_at on Agenda.
    // The clinician opens the verified radar from the on-duty card instead.

}
