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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.presentation.doctors.agenda.components.AppointmentDetailsBottomSheet
import com.autamedica.android.presentation.doctors.agenda.components.AppointmentListItem
import com.autamedica.android.presentation.doctors.agenda.components.AvailabilityEditor
import com.autamedica.android.presentation.doctors.agenda.components.ThirtyDayWaffleCalendar
import com.autamedica.android.presentation.doctors.agenda.components.TurnoActualHeroCard
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalDoctors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorAgendaScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToVideoCall: (appointmentId: String) -> Unit = {},
    viewModel: DoctorAgendaViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Agenda médica",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Portal médico",
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
                            contentDescription = "Volver",
                            tint = AuTextPrimary,
                        )
                    }
                },
                actions = {
                    // Waffle Calendar toggle icon
                    IconButton(onClick = viewModel::toggleWaffleCalendar) {
                        Surface(
                            shape = CircleShape,
                            color = if (uiState.showWaffleCalendar) PortalDoctors.copy(alpha = 0.15f) else Color.Transparent,
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CalendarMonth,
                                contentDescription = "Calendario 30 días",
                                tint = if (uiState.showWaffleCalendar) PortalDoctors else AuTextTertiary,
                                modifier = Modifier.padding(6.dp),
                            )
                        }
                    }
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
                                text = "SINCRONIZANDO AGENDA...",
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
                                text = uiState.error.orEmpty(),
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

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
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

                        // 3. Turno Actual (Hero Card Redesign Premium)
                        uiState.currentTurno?.let { turno ->
                            item {
                                TurnoActualHeroCard(
                                    appointment = turno,
                                    patientName = viewModel.getPatientName(turno),
                                    patientContext = turno.patientId?.let { uiState.patientContexts[it] },
                                    isContextLoading = uiState.isContextLoading,
                                    onStartCall = { onNavigateToVideoCall(turno.id) },
                                    onViewDetail = { viewModel.selectAppointment(turno) },
                                )
                            }
                        }

                        // 4. Agenda del Día / Listado de Citas
                        item {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                shadowElevation = 1.dp,
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    // Header + Filters
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            text = "AGENDA DEL DÍA",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = AuTextTertiary,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 10.sp,
                                            letterSpacing = 1.5.sp,
                                        )

                                        // Total badge
                                        Surface(
                                            shape = RoundedCornerShape(999.dp),
                                            color = Color(0xFFF1F5F9),
                                        ) {
                                            Text(
                                                text = "${uiState.filteredAppointments.size} turnos",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = Color(0xFF475569),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 10.sp,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                            )
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(12.dp))

                                    // Filter pills
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.FilterList,
                                            contentDescription = null,
                                            tint = AuTextTertiary,
                                            modifier = Modifier.size(16.dp),
                                        )

                                        AgendaFilter.entries.forEach { filter ->
                                            val isSelected = uiState.selectedFilter == filter && uiState.selectedDate == null
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = if (isSelected) Color(0xFFE0F2FE) else Color.Transparent,
                                                border = BorderStroke(
                                                    1.dp,
                                                    if (isSelected) Color(0xFFBAE6FD) else Color(0xFFE2E8F0),
                                                ),
                                                modifier = Modifier.clickable { viewModel.setFilter(filter) },
                                            ) {
                                                Text(
                                                    text = filter.label,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                    color = if (isSelected) Color(0xFF0284C7) else AuTextTertiary,
                                                    fontSize = 11.sp,
                                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                                )
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(14.dp))
                                    HorizontalDivider(color = Color(0xFFF1F5F9))
                                    Spacer(modifier = Modifier.height(10.dp))

                                    // List of Appointments
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
                                                text = "Agenda vacía",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = AuTextTertiary,
                                            )
                                            Text(
                                                text = "No hay citas para este filtro.",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = AuTextTertiary.copy(alpha = 0.8f),
                                            )
                                        }
                                    } else {
                                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            uiState.filteredAppointments.forEach { appt ->
                                                AppointmentListItem(
                                                    appointment = appt,
                                                    patientName = viewModel.getPatientName(appt),
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

    // 5. Panel / BottomSheet de Detalle de Cita (AppointmentDetailsBottomSheet)
    if (uiState.isDetailsSheetOpen && uiState.selectedAppointment != null) {
        val selectedAppt = uiState.selectedAppointment!!
        AppointmentDetailsBottomSheet(
            appointment = selectedAppt,
            patientName = viewModel.getPatientName(selectedAppt),
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
        )
    }
}
