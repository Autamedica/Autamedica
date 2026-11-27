package com.autamedica.android.presentation.patients

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.Bloodtype
import androidx.compose.material.icons.outlined.Cake
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.NoteAlt
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.ClinicalNoteEntry
import com.autamedica.android.domain.model.ClinicalWorkspaceLogic
import com.autamedica.android.domain.model.PatientDetail
import com.autamedica.android.domain.model.PatientFollowupEntry
import com.autamedica.android.domain.model.PatientPrescriptionRenewalItem
import com.autamedica.android.domain.model.RenewalStatus
import com.autamedica.android.domain.model.VitalAlertSeverity
import com.autamedica.android.domain.model.VitalSignAlert
import com.autamedica.android.domain.model.VitalSignEntry
import com.autamedica.android.presentation.dashboard.components.QuickClinicalActionsBar
import com.autamedica.android.presentation.health.healthText
import com.autamedica.android.presentation.health.isPortugueseRuntime
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
import com.autamedica.android.presentation.theme.PrimaryLight
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientDetailScreen(
    onBack: () -> Unit,
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToCreatePrescription: (patientId: String, renewFromPrescriptionId: String) -> Unit = { _, _ -> },
    onNavigateToCreateCertificate: (patientId: String) -> Unit = {},
    onNavigateToCreateMedicalOrder: (patientId: String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: PatientDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val isPt = isPortugueseRuntime()
    var selectedTab by remember { mutableIntStateOf(0) }
    var showNoteDialog by remember { mutableStateOf(false) }
    var showVitalsDialog by remember { mutableStateOf(false) }
    var showFollowupDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.patient?.displayName?.takeIf { it.isNotBlank() }
                            ?: stringResource(R.string.patient_detail_title_fallback),
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.patient_detail_back_cd),
                            tint = AuTextPrimary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBackground),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                }
            }

            uiState.errorMessageRes != null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
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
                            text = stringResource(uiState.errorMessageRes ?: R.string.patient_detail_error_generic),
                            color = AuDanger,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = viewModel::refresh,
                            colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
                        ) {
                            Text(stringResource(R.string.patient_detail_retry))
                        }
                    }
                }
            }

            uiState.patient != null -> {
                val patient = uiState.patient ?: return@Scaffold
                val tabTitles = listOf(
                    stringResource(R.string.patient_detail_tab_summary),
                    stringResource(R.string.patient_detail_tab_prescriptions),
                    stringResource(R.string.patient_detail_tab_evolutions),
                    stringResource(R.string.patient_detail_tab_monitoring),
                )

                Column(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                ) {
                    SecondaryScrollableTabRow(
                        selectedTabIndex = selectedTab,
                        containerColor = AuSurface,
                        contentColor = PortalDoctors,
                        edgePadding = 12.dp,
                    ) {
                        tabTitles.forEachIndexed { idx, title ->
                            Tab(
                                selected = selectedTab == idx,
                                onClick = { selectedTab = idx },
                                text = {
                                    Text(
                                        text = title,
                                        maxLines = 1,
                                        fontWeight = if (selectedTab == idx) FontWeight.Bold else FontWeight.Medium,
                                    )
                                },
                            )
                        }
                    }

                    uiState.workspaceActionMessage?.let { msg ->
                        Surface(
                            color = Color(0xFFECFDF5),
                            border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text(
                                text = msg,
                                color = Color(0xFF065F46),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }

                    uiState.workspaceActionError?.let { err ->
                        Surface(
                            color = ErrorContainer,
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text(
                                text = err,
                                color = AuDanger,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }

                    when (selectedTab) {
                        0 -> SummaryTabContent(
                            patient = patient,
                            isPt = isPt,
                            uiState = uiState,
                            onNavigateToVideoCall = onNavigateToVideoCall,
                            onNavigateToCreatePrescription = { onNavigateToCreatePrescription(patient.id, "") },
                            onNavigateToCreateCertificate = { onNavigateToCreateCertificate(patient.id) },
                            onNavigateToCreateMedicalOrder = { onNavigateToCreateMedicalOrder(patient.id) },
                        )
                        1 -> PrescriptionsTabContent(
                            prescriptions = uiState.prescriptions,
                            isLoading = uiState.isWorkspaceLoading,
                            onNewPrescription = { onNavigateToCreatePrescription(patient.id, "") },
                            onRenewPrescription = { rxId -> onNavigateToCreatePrescription(patient.id, rxId) },
                        )
                        2 -> EvolutionsTabContent(
                            notes = uiState.clinicalNotes,
                            isLoading = uiState.isWorkspaceLoading,
                            onAddNote = {
                                viewModel.clearFeedback()
                                showNoteDialog = true
                            },
                        )
                        3 -> MonitoringTabContent(
                            vitals = uiState.vitals,
                            alerts = uiState.vitalAlerts,
                            followups = uiState.followups,
                            isPt = isPt,
                            isLoading = uiState.isWorkspaceLoading,
                            onAddVitals = {
                                viewModel.clearFeedback()
                                showVitalsDialog = true
                            },
                            onAddFollowup = {
                                viewModel.clearFeedback()
                                showFollowupDialog = true
                            },
                            onCompleteFollowup = { id -> viewModel.updateFollowup(id, "complete") },
                            onCancelFollowup = { id -> viewModel.updateFollowup(id, "cancel") },
                        )
                    }
                }
            }

            else -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
                        Text(
                            text = stringResource(R.string.patient_detail_empty_title),
                            color = AuTextPrimary,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = stringResource(R.string.patient_detail_empty_desc),
                            color = AuTextTertiary,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = viewModel::refresh,
                            colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
                        ) {
                            Text(stringResource(R.string.patient_detail_retry))
                        }
                    }
                }
            }
        }
    }

    if (showNoteDialog) {
        AddClinicalNoteDialog(
            isSaving = uiState.isSubmittingAction,
            onDismiss = { if (!uiState.isSubmittingAction) showNoteDialog = false },
            onConfirm = { title, kind, summary, diagnosis ->
                viewModel.saveClinicalNote(title, kind, summary, diagnosis) {
                    showNoteDialog = false
                }
            },
        )
    }

    if (showVitalsDialog) {
        RecordVitalsDialog(
            isSaving = uiState.isSubmittingAction,
            onDismiss = { if (!uiState.isSubmittingAction) showVitalsDialog = false },
            onConfirm = { sys, dia, hr, spo2, temp, weight, height, pain, notes ->
                viewModel.recordVitals(sys, dia, hr, spo2, temp, weight, height, pain, notes) {
                    showVitalsDialog = false
                }
            },
        )
    }

    if (showFollowupDialog) {
        ScheduleFollowupDialog(
            isSaving = uiState.isSubmittingAction,
            onDismiss = { if (!uiState.isSubmittingAction) showFollowupDialog = false },
            onConfirm = { days, objective, channel ->
                viewModel.createFollowup(days, objective, channel) {
                    showFollowupDialog = false
                }
            },
        )
    }
}

@Composable
private fun SummaryTabContent(
    patient: PatientDetail,
    isPt: Boolean,
    uiState: PatientDetailUiState,
    onNavigateToVideoCall: (String) -> Unit,
    onNavigateToCreatePrescription: () -> Unit,
    onNavigateToCreateCertificate: () -> Unit,
    onNavigateToCreateMedicalOrder: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { PatientHeaderCard(patient, isPt) }

        if (uiState.vitalAlerts.isNotEmpty()) {
            item { VitalAlertsBanner(uiState.vitalAlerts, isPt) }
        }

        item {
            QuickClinicalActionsBar(
                onNavigateToPrescriptions = onNavigateToCreatePrescription,
                onNavigateToCertificates = onNavigateToCreateCertificate,
                onNavigateToMedicalOrders = onNavigateToCreateMedicalOrder,
            )
        }

        item { PatientInfoPills(patient) }

        if (patient.bloodType != null || patient.allergies != null) {
            item { MedicalInfoSection(patient) }
        }

        uiState.vitals.firstOrNull()?.let { latest ->
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = stringResource(R.string.patient_detail_latest_vitals_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    VitalSignCard(latest)
                }
            }
        }

        val pendingFollowups = uiState.followups.filter { it.status == "pending" }
        if (pendingFollowups.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = stringResource(R.string.patient_detail_pending_followups_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    pendingFollowups.take(2).forEach { f ->
                        FollowupCard(f, showActions = false, onComplete = {}, onCancel = {})
                    }
                }
            }
        }

        if (patient.appointmentHistory.isNotEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.patient_detail_history_title),
                    style = MaterialTheme.typography.titleSmall,
                    color = AuTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            items(patient.appointmentHistory.take(10), key = { it.id }) { appointment ->
                AppointmentHistoryRow(
                    appointment = appointment,
                    onJoinCall = if (appointment.id in uiState.joinableAppointmentIds) {
                        { onNavigateToVideoCall(appointment.id) }
                    } else null,
                )
            }
        } else {
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuBorder),
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(Icons.Outlined.History, contentDescription = null, modifier = Modifier.size(40.dp), tint = AuTextTertiary)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.patient_detail_empty_history),
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextTertiary,
                        )
                    }
                }
            }
        }

        uiState.telemedicineError?.let { telemedicineError ->
            item {
                Text(text = telemedicineError, style = MaterialTheme.typography.bodySmall, color = AuTextSecondary)
            }
        }
    }
}

@Composable
private fun PrescriptionsTabContent(
    prescriptions: List<PatientPrescriptionRenewalItem>,
    isLoading: Boolean,
    onNewPrescription: () -> Unit,
    onRenewPrescription: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Button(
                onClick = onNewPrescription,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.patient_detail_new_rx_btn), fontWeight = FontWeight.Bold)
            }
        }

        if (isLoading && prescriptions.isEmpty()) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                }
            }
        } else if (prescriptions.isEmpty()) {
            item {
                EmptySectionCard(
                    icon = Icons.Outlined.Medication,
                    text = stringResource(R.string.patient_detail_empty_rx),
                )
            }
        } else {
            items(prescriptions, key = { it.id }) { rx ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuBorder),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = listOf(rx.medicationName, rx.dosage).filter { it.isNotBlank() }.joinToString(" · "),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                                modifier = Modifier.weight(1f),
                            )
                            RenewalBadge(rx.renewalStatus, rx.daysRemaining)
                        }
                        if (rx.diagnosis.isNotBlank()) {
                            Text(text = rx.diagnosis, style = MaterialTheme.typography.bodySmall, color = AuTextSecondary)
                        }
                        Text(
                            text = buildString {
                                append(formatDate(rx.createdAt))
                                rx.cuir?.let { append(" · $it") }
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                        if (rx.canRenew) {
                            OutlinedButton(
                                onClick = { onRenewPrescription(rx.id) },
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, PortalDoctors),
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null, tint = PortalDoctors, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = stringResource(R.string.patient_detail_renew_rx_btn),
                                    color = PortalDoctors,
                                    fontWeight = FontWeight.Bold,
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
private fun RenewalBadge(status: RenewalStatus, daysRemaining: Int?) {
    val (bg, fg, label) = when (status) {
        RenewalStatus.EXPIRED -> Triple(ErrorContainer, AuDanger, stringResource(R.string.patient_detail_rx_expired))
        RenewalStatus.EXPIRING_SOON -> Triple(
            Color(0xFFFEF3C7),
            Color(0xFF92400E),
            stringResource(R.string.patient_detail_rx_expiring_days, daysRemaining ?: 0),
        )
        RenewalStatus.CANCELLED -> Triple(AuSurfaceHover, AuTextTertiary, stringResource(R.string.patient_detail_rx_cancelled))
        RenewalStatus.ACTIVE -> Triple(Color(0xFFECFDF5), Color(0xFF065F46), stringResource(R.string.patient_detail_rx_active))
    }
    Surface(shape = RoundedCornerShape(999.dp), color = bg) {
        Text(
            text = label,
            color = fg,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun EvolutionsTabContent(
    notes: List<ClinicalNoteEntry>,
    isLoading: Boolean,
    onAddNote: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Button(
                onClick = onAddNote,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.patient_detail_add_note_btn), fontWeight = FontWeight.Bold)
            }
        }

        if (isLoading && notes.isEmpty()) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                }
            }
        } else if (notes.isEmpty()) {
            item {
                EmptySectionCard(
                    icon = Icons.Outlined.NoteAlt,
                    text = stringResource(R.string.patient_detail_empty_notes),
                )
            }
        } else {
            items(notes, key = { it.id }) { note ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = AuSurface,
                    border = BorderStroke(1.dp, AuBorder),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(note.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = AuTextPrimary)
                            Text(formatDate(note.dateRecorded), style = MaterialTheme.typography.labelSmall, color = AuTextTertiary)
                        }
                        note.diagnosis?.takeIf { it.isNotBlank() }?.let { diag ->
                            Text(text = diag, style = MaterialTheme.typography.labelMedium, color = PortalDoctors, fontWeight = FontWeight.SemiBold)
                        }
                        if (note.summary.isNotBlank()) {
                            Text(text = note.summary, style = MaterialTheme.typography.bodySmall, color = AuTextSecondary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MonitoringTabContent(
    vitals: List<VitalSignEntry>,
    alerts: List<VitalSignAlert>,
    followups: List<PatientFollowupEntry>,
    isPt: Boolean,
    isLoading: Boolean,
    onAddVitals: () -> Unit,
    onAddFollowup: () -> Unit,
    onCompleteFollowup: (String) -> Unit,
    onCancelFollowup: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (alerts.isNotEmpty()) {
            item { VitalAlertsBanner(alerts, isPt) }
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onAddVitals,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
                ) {
                    Icon(Icons.Outlined.FavoriteBorder, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(stringResource(R.string.patient_detail_add_vitals_btn), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                OutlinedButton(
                    onClick = onAddFollowup,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, PortalDoctors),
                ) {
                    Icon(Icons.Outlined.CalendarMonth, contentDescription = null, tint = PortalDoctors, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(stringResource(R.string.patient_detail_add_followup_btn), color = PortalDoctors, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }

        item {
            Text(
                text = stringResource(R.string.patient_detail_vitals_section_title),
                style = MaterialTheme.typography.titleSmall,
                color = AuTextSecondary,
                fontWeight = FontWeight.SemiBold,
            )
        }

        if (isLoading && vitals.isEmpty()) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                }
            }
        } else if (vitals.isEmpty()) {
            item {
                EmptySectionCard(icon = Icons.Outlined.FavoriteBorder, text = stringResource(R.string.patient_detail_empty_vitals))
            }
        } else {
            items(vitals.take(10), key = { it.id }) { v -> VitalSignCard(v) }
        }

        item {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.patient_detail_followups_section_title),
                style = MaterialTheme.typography.titleSmall,
                color = AuTextSecondary,
                fontWeight = FontWeight.SemiBold,
            )
        }

        if (followups.isEmpty()) {
            item {
                EmptySectionCard(icon = Icons.Outlined.CalendarMonth, text = stringResource(R.string.patient_detail_empty_followups))
            }
        } else {
            items(followups, key = { it.id }) { f ->
                FollowupCard(
                    followup = f,
                    showActions = f.status == "pending",
                    onComplete = { onCompleteFollowup(f.id) },
                    onCancel = { onCancelFollowup(f.id) },
                )
            }
        }
    }
}

@Composable
private fun VitalAlertsBanner(alerts: List<VitalSignAlert>, isPt: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        alerts.forEach { alert ->
            val critical = alert.severity == VitalAlertSeverity.CRITICAL
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (critical) ErrorContainer else Color(0xFFFEF3C7),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Outlined.Warning,
                        contentDescription = null,
                        tint = if (critical) AuDanger else Color(0xFF92400E),
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isPt) alert.labelPt else alert.labelEs,
                        color = if (critical) AuDanger else Color(0xFF92400E),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun VitalSignCard(vital: VitalSignEntry) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatDate(vital.measuredAt), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = AuTextPrimary)
                vital.bmi?.let { Text("IMC $it", style = MaterialTheme.typography.labelSmall, color = PortalDoctors, fontWeight = FontWeight.SemiBold) }
            }
            val metrics = buildList {
                if (vital.bloodPressureSystolic != null && vital.bloodPressureDiastolic != null) {
                    add("PA ${vital.bloodPressureSystolic}/${vital.bloodPressureDiastolic} mmHg")
                }
                vital.heartRate?.let { add("FC $it") }
                vital.oxygenSaturation?.let { add("SpO2 $it%") }
                vital.temperature?.let { add("$it °C") }
                vital.weight?.let { add("$it kg") }
                vital.painScale?.let { add("${healthText("Dolor", "Dor")} $it/10") }
            }
            Text(
                text = metrics.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = AuTextPrimary,
            )
            vital.notes?.takeIf { it.isNotBlank() }?.let {
                Text(text = it, style = MaterialTheme.typography.labelSmall, color = AuTextSecondary)
            }
        }
    }
}

@Composable
private fun FollowupCard(
    followup: PatientFollowupEntry,
    showActions: Boolean,
    onComplete: () -> Unit,
    onCancel: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(followup.message, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = AuTextPrimary)
            Text(
                text = "${formatDate(followup.scheduledFor)} · ${followup.channel.uppercase()} · ${followup.status}",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
            )
            if (showActions) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onComplete, shape = RoundedCornerShape(10.dp)) {
                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp), tint = AuSuccess)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(stringResource(R.string.patient_detail_followup_complete), color = AuSuccess)
                    }
                    TextButton(onClick = onCancel) {
                        Text(stringResource(R.string.common_cancel), color = AuTextSecondary)
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptySectionCard(icon: ImageVector, text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(32.dp), tint = AuTextTertiary)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = text, style = MaterialTheme.typography.bodyMedium, color = AuTextTertiary)
        }
    }
}

@Composable
private fun AddClinicalNoteDialog(
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (title: String, kind: String, summary: String, diagnosis: String?) -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("evolution") }
    var diagnosis by remember { mutableStateOf("") }
    var summary by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.patient_detail_add_note_btn), fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text(stringResource(R.string.patient_detail_note_title_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = kind == "evolution",
                        onClick = { kind = "evolution" },
                        label = { Text(healthText("Evolución", "Evolução")) },
                    )
                    FilterChip(
                        selected = kind == "soap",
                        onClick = { kind = "soap" },
                        label = { Text("SOAP") },
                    )
                }
                OutlinedTextField(
                    value = diagnosis,
                    onValueChange = { diagnosis = it },
                    label = { Text(stringResource(R.string.patient_detail_note_diagnosis_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = summary,
                    onValueChange = { summary = it },
                    label = { Text(stringResource(R.string.patient_detail_note_summary_label)) },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(title, kind, summary, diagnosis.takeIf { it.isNotBlank() }) },
                enabled = !isSaving && title.trim().length >= 2 && summary.trim().length >= 3,
                colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
            ) {
                Text(stringResource(R.string.patient_detail_save_btn))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text(stringResource(R.string.common_cancel))
            }
        },
    )
}

@Composable
private fun RecordVitalsDialog(
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (Int?, Int?, Int?, Int?, Double?, Double?, Int?, Int?, String?) -> Unit,
) {
    var sys by remember { mutableStateOf("") }
    var dia by remember { mutableStateOf("") }
    var hr by remember { mutableStateOf("") }
    var spo2 by remember { mutableStateOf("") }
    var temp by remember { mutableStateOf("") }
    var weight by remember { mutableStateOf("") }
    var height by remember { mutableStateOf("") }
    var pain by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.patient_detail_add_vitals_btn), fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.verticalScroll(rememberScrollState())) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = sys, onValueChange = { sys = it.filter(Char::isDigit) }, label = { Text("PAS") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                    OutlinedTextField(value = dia, onValueChange = { dia = it.filter(Char::isDigit) }, label = { Text("PAD") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = hr, onValueChange = { hr = it.filter(Char::isDigit) }, label = { Text("FC") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                    OutlinedTextField(value = spo2, onValueChange = { spo2 = it.filter(Char::isDigit) }, label = { Text("SpO2 %") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = temp, onValueChange = { temp = it }, label = { Text("Temp °C") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
                    OutlinedTextField(value = pain, onValueChange = { pain = it.filter(Char::isDigit) }, label = { Text(healthText("Dolor 0-10", "Dor 0-10")) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = weight, onValueChange = { weight = it }, label = { Text("Peso kg") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
                    OutlinedTextField(value = height, onValueChange = { height = it.filter(Char::isDigit) }, label = { Text("Altura cm") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                }
                OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text(stringResource(R.string.patient_detail_vitals_notes_label)) }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            val hasAny = listOf(sys, dia, hr, spo2, temp, weight, height, pain).any { it.isNotBlank() }
            Button(
                onClick = {
                    onConfirm(
                        sys.toIntOrNull(),
                        dia.toIntOrNull(),
                        hr.toIntOrNull(),
                        spo2.toIntOrNull(),
                        temp.toDoubleOrNull(),
                        weight.toDoubleOrNull(),
                        height.toIntOrNull(),
                        pain.toIntOrNull(),
                        notes.takeIf { it.isNotBlank() },
                    )
                },
                enabled = !isSaving && hasAny,
                colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
            ) {
                Text(stringResource(R.string.patient_detail_save_btn))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text(stringResource(R.string.common_cancel))
            }
        },
    )
}

@Composable
private fun ScheduleFollowupDialog(
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (daysAhead: Long, objective: String, channel: String) -> Unit,
) {
    var daysAhead by remember { mutableLongStateOf(7L) }
    var objective by remember { mutableStateOf("") }
    var channel by remember { mutableStateOf("whatsapp") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.patient_detail_add_followup_btn), fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(2L to "48h", 7L to "7d", 15L to "15d", 30L to "30d").forEach { (d, label) ->
                        FilterChip(selected = daysAhead == d, onClick = { daysAhead = d }, label = { Text(label) })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("whatsapp" to "WhatsApp", "email" to "E-mail", "push" to "Push").forEach { (c, label) ->
                        FilterChip(selected = channel == c, onClick = { channel = c }, label = { Text(label) })
                    }
                }
                OutlinedTextField(
                    value = objective,
                    onValueChange = { objective = it },
                    label = { Text(stringResource(R.string.patient_detail_followup_objective_label)) },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(daysAhead, objective, channel) },
                enabled = !isSaving && objective.trim().length >= 3,
                colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
            ) {
                Text(stringResource(R.string.patient_detail_save_btn))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text(stringResource(R.string.common_cancel))
            }
        },
    )
}

@Composable
private fun PatientHeaderCard(patient: PatientDetail, isPt: Boolean) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = Color.Transparent,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(
                    Brush.verticalGradient(
                        colors = listOf(PortalDoctors.copy(alpha = 0.12f), AuSurface),
                    ),
                )
                .padding(24.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(64.dp),
                    shape = CircleShape,
                    color = AuSurfaceHover,
                ) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.padding(16.dp),
                        tint = AuTextSecondary,
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = patient.displayName.ifBlank { stringResource(R.string.patients_anonymous) },
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    val localizedGender = ClinicalWorkspaceLogic.localizeGender(patient.gender, isPt)
                    if (patient.age != null || localizedGender != null) {
                        val details = listOfNotNull(
                            patient.age?.let { stringResource(R.string.patient_detail_age_format, it) },
                            localizedGender,
                        ).joinToString(" · ")
                        Text(
                            text = details,
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextSecondary,
                        )
                    }
                    val totalConsultationsText = if (patient.totalAppointments == 1) {
                        stringResource(R.string.patients_consultations_total_single, patient.totalAppointments)
                    } else {
                        stringResource(R.string.patients_consultations_total_plural, patient.totalAppointments)
                    }
                    Text(
                        text = totalConsultationsText,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }
        }
    }
}

@Composable
private fun PatientInfoPills(patient: PatientDetail) {
    val emailLabel = stringResource(R.string.patient_detail_email_label)
    val phoneLabel = stringResource(R.string.patient_detail_phone_label)
    val birthDateLabel = stringResource(R.string.patient_detail_birthdate_label)

    val pills = listOfNotNull(
        patient.email?.let { Triple(Icons.Outlined.Email, emailLabel, it) },
        patient.phone?.let { Triple(Icons.Outlined.Phone, phoneLabel, it) },
        patient.birthDate?.let { Triple(Icons.Outlined.Cake, birthDateLabel, formatDate(it)) },
    )

    if (pills.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            pills.forEach { (icon, label, value) ->
                InfoRow(icon = icon, label = label, value = value)
            }
        }
    }
}

@Composable
private fun InfoRow(
    icon: ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = AuTextTertiary)
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(text = label, style = MaterialTheme.typography.labelSmall, color = AuTextTertiary)
                Text(text = value, style = MaterialTheme.typography.bodyMedium, color = AuTextPrimary, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun MedicalInfoSection(patient: PatientDetail) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.patient_detail_medical_info_title),
            style = MaterialTheme.typography.titleSmall,
            color = AuTextSecondary,
            fontWeight = FontWeight.SemiBold,
        )

        if (patient.bloodType != null) {
            InfoRow(
                icon = Icons.Outlined.Bloodtype,
                label = stringResource(R.string.patient_detail_blood_type_label),
                value = patient.bloodType,
            )
        }

        if (patient.allergies != null) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
                    Icon(
                        Icons.Outlined.Warning,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = AuDanger.copy(alpha = 0.8f),
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = stringResource(R.string.patient_detail_allergies_label),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuDanger.copy(alpha = 0.8f),
                        )
                        Text(text = patient.allergies, style = MaterialTheme.typography.bodyMedium, color = AuTextPrimary)
                    }
                }
            }
        }
    }
}

@Composable
private fun AppointmentHistoryRow(
    appointment: Appointment,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = BorderStroke(
            1.dp,
            if (appointment.status == AppointmentStatus.IN_PROGRESS) PortalDoctors.copy(alpha = 0.4f) else AuBorder,
        ),
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.width(56.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = formatDayMonth(appointment.startTime), style = MaterialTheme.typography.labelMedium, color = AuTextPrimary, fontWeight = FontWeight.SemiBold)
                Text(text = formatTime(appointment.startTime), style = MaterialTheme.typography.labelSmall, color = AuTextTertiary, fontSize = 10.sp)
            }
            Spacer(modifier = Modifier.width(12.dp))
            HorizontalDivider(modifier = Modifier.height(36.dp).width(1.dp), color = AuBorder)
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(text = displayAppointmentType(appointment.type), style = MaterialTheme.typography.bodyMedium, color = AuTextPrimary, fontWeight = FontWeight.Medium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(statusColor(appointment.status)))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = displayStatus(appointment.status), style = MaterialTheme.typography.labelSmall, color = AuTextTertiary)
                }
            }
            if (onJoinCall != null) {
                Button(
                    onClick = onJoinCall,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                ) {
                    Icon(Icons.Default.Videocam, contentDescription = stringResource(R.string.patient_detail_start_call_btn), modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(stringResource(R.string.patient_detail_start_call_btn), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

private fun statusColor(status: AppointmentStatus): Color = when (status) {
    AppointmentStatus.PAYMENT_PENDING -> Color(0xFFD97706)
    AppointmentStatus.IN_PROGRESS -> PortalDoctors
    AppointmentStatus.CONFIRMED -> AuSuccess
    AppointmentStatus.SCHEDULED -> PrimaryLight
    AppointmentStatus.COMPLETED -> AuTextTertiary
    AppointmentStatus.CANCELLED -> AuDanger
    AppointmentStatus.NO_SHOW -> AuDanger
}

@Composable
private fun displayAppointmentType(type: AppointmentType): String = when (type) {
    AppointmentType.CONSULTATION -> stringResource(R.string.patient_appointment_type_consultation)
    AppointmentType.FOLLOW_UP -> stringResource(R.string.patient_appointment_type_follow_up)
    AppointmentType.EMERGENCY -> stringResource(R.string.patient_appointment_type_emergency)
    AppointmentType.TELEMEDICINE -> stringResource(R.string.patient_appointment_type_telemedicine)
    AppointmentType.LAB_TEST -> stringResource(R.string.patient_appointment_type_lab_test)
    AppointmentType.CHECKUP -> stringResource(R.string.patient_appointment_type_checkup)
}

@Composable
private fun displayStatus(status: AppointmentStatus): String = when (status) {
    AppointmentStatus.PAYMENT_PENDING -> stringResource(R.string.patient_appointment_status_payment_pending)
    AppointmentStatus.SCHEDULED -> stringResource(R.string.patient_appointment_status_scheduled)
    AppointmentStatus.CONFIRMED -> stringResource(R.string.patient_appointment_status_confirmed)
    AppointmentStatus.IN_PROGRESS -> stringResource(R.string.patient_appointment_status_in_progress)
    AppointmentStatus.COMPLETED -> stringResource(R.string.patient_appointment_status_completed)
    AppointmentStatus.CANCELLED -> stringResource(R.string.patient_appointment_status_cancelled)
    AppointmentStatus.NO_SHOW -> stringResource(R.string.patient_appointment_status_no_show)
}

private fun formatDate(isoString: String): String {
    return try {
        val date = java.time.LocalDate.parse(isoString)
        date.format(DateTimeFormatter.ofPattern("d 'de' MMMM, yyyy", Locale.getDefault()))
    } catch (_: Exception) {
        try {
            val dt = OffsetDateTime.parse(isoString)
            dt.format(DateTimeFormatter.ofPattern("d 'de' MMMM, yyyy", Locale.getDefault()))
        } catch (_: Exception) {
            isoString
        }
    }
}

private fun formatDayMonth(isoString: String): String {
    return try {
        OffsetDateTime.parse(isoString).format(DateTimeFormatter.ofPattern("d MMM", Locale.getDefault()))
    } catch (_: Exception) {
        ""
    }
}

private fun formatTime(isoString: String): String {
    return try {
        OffsetDateTime.parse(isoString).format(DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault()))
    } catch (_: Exception) {
        ""
    }
}
