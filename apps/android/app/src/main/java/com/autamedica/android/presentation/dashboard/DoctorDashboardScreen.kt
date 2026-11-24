package com.autamedica.android.presentation.dashboard

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.autamedica.android.R
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.AppointmentStatus
import com.autamedica.android.domain.model.AppointmentType
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.model.isTelemedicineJoinCandidate
import com.autamedica.android.presentation.dashboard.components.DoctorCockpitHeader
import com.autamedica.android.presentation.dashboard.components.LivePatientRadarDrawer
import com.autamedica.android.presentation.dashboard.components.NubankClinicalMetricsSection
import com.autamedica.android.presentation.dashboard.components.QuickClinicalActionsBar
import com.autamedica.android.presentation.dashboard.components.UberIncomingDispatchAlert
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val DOCTOR_TAB_PATIENTS = 2
private const val DOCTOR_TAB_PROFILE = 3

// =============================================================================
// DESIGN TOKENS "AUTAMEDICA OS v2 — UBER DRIVER PARA TELEMEDICINA" (MATERIAL 3)
// Sensación: "Hay pacientes esperando ahora mismo y yo puedo aceptarlos."
// Apple + Uber + Nubank + Linear | M3 | Glassmorphism sutil
// Card radius: 20 dp | Botón principal: 20 dp radius, 58 dp altura
// Switch Guardia: Muy grande (escala 1.5f) con track verde activo
// Triaje: Rojo urgencia, Cian quirúrgico prioritario, Azul control, Verde estable
// =============================================================================
private val AutaBlue = Color(0xFF0EA5E9)      // AutaMedica sky-500
private val AutaGreen = Color(0xFF16C784)     // EN LÍNEA, disponible, éxito
private val AutaRed = Color(0xFFFF4D4F)       // Urgencias de triaje
private val MedicalBlue = AutaBlue            // Alias de compatibilidad
private val MedicalCyan = Color(0xFF0284C7)   // AutaMedica sky-600
private val SoftBlueBg = Color(0xFFE0F2FE)
private val SoftGreenBg = Color(0xFFECFDF5)
private val SoftRedBg = Color(0xFFFEF2F2)
private val SoftCyanBg = Color(0xFFF0F9FF)
private val GlassBorder = Color(0x1E0EA5E9)   // Glassmorphism borde sutil
private val Slate50 = Color(0xFFF8FAFC)
private val Slate100 = Color(0xFFF1F5F9)
private val Slate200 = Color(0xFFE2E8F0)
private val Slate500 = Color(0xFF64748B)
private val Slate700 = Color(0xFF334155)
private val Slate800 = Color(0xFF1E293B)
private val Slate900 = Color(0xFF0F172A)
private val CardRadius = 20.dp

/**
 * Modificador de sombra ultra-suave con glow azul AutaMedica (#0EA5E9)
 */
private fun Modifier.auSoftShadow(radius: Dp = CardRadius): Modifier = this.shadow(
    elevation = 3.dp,
    shape = RoundedCornerShape(radius),
    ambientColor = Color(0x0A000000),
    spotColor = AutaBlue.copy(alpha = 0.10f),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorDashboardScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToTab: (Int) -> Unit = {},
    onNavigateToDoctorSignature: () -> Unit = {},
    onNavigateToDoctorOnboarding: () -> Unit = {},
    onNavigateToDoctorPrescriptions: () -> Unit = {},
    onNavigateToDoctorCertificates: () -> Unit = {},
    onNavigateToDoctorMedicalOrders: () -> Unit = {},
    onNavigateToCreatePrescription: () -> Unit = onNavigateToDoctorPrescriptions,
    onNavigateToCreateCertificate: () -> Unit = onNavigateToDoctorCertificates,
    onNavigateToCreateMedicalOrder: () -> Unit = onNavigateToDoctorMedicalOrders,
    onNavigateToDoctorOnDemand: () -> Unit = {},
    onNavigateToDoctorAgenda: () -> Unit = {},
    onNavigateToDoctorMessages: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: DoctorDashboardViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var showBrazilMemedPatientPrompt by remember { mutableStateOf(false) }
    val isBrazilianDoctor = uiState.doctorProfile?.let { profile ->
        profile.countryCode == "BR" || (profile.licenseType.equals("CRM", ignoreCase = true) &&
            !profile.ufBrazil.isNullOrBlank())
    } == true


    if (showBrazilMemedPatientPrompt && isBrazilianDoctor) {
        AlertDialog(
            onDismissRequest = { showBrazilMemedPatientPrompt = false },
            title = { Text(stringResource(R.string.ui_memed_select_patient_title)) },
            text = { Text(stringResource(R.string.ui_memed_select_patient_body)) },
            confirmButton = {
                TextButton(onClick = {
                    showBrazilMemedPatientPrompt = false
                    onNavigateToTab(DOCTOR_TAB_PATIENTS)
                }) { Text(stringResource(R.string.ui_memed_select_patient_action)) }
            },
            dismissButton = {
                TextButton(onClick = { showBrazilMemedPatientPrompt = false }) {
                    Text(stringResource(R.string.ui_action_cancel))
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(11.dp))
                                .background(com.autamedica.android.presentation.theme.PortalPatientsAction),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.MedicalServices,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        Column {
                            Text(
                                text = "AutaMedica",
                                style = MaterialTheme.typography.titleLarge,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = (-0.6).sp,
                            )
                            Text(
                                text = stringResource(R.string.doctor_portal_title),
                                style = MaterialTheme.typography.labelSmall,
                                color = com.autamedica.android.presentation.theme.PortalPatientsAction,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToDoctorAgenda) {
                        Icon(
                            imageVector = Icons.Default.CalendarMonth,
                            contentDescription = stringResource(R.string.doctor_header_agenda_cd),
                            tint = com.autamedica.android.presentation.theme.PortalPatientsAction,
                        )
                    }
                    IconButton(onClick = onNavigateToDoctorMessages) {
                        Box {
                            Icon(
                                imageVector = Icons.Outlined.Email,
                                contentDescription = stringResource(R.string.doctor_header_messages_cd),
                                tint = com.autamedica.android.presentation.theme.PortalPatientsAction,
                            )
                            if (uiState.unreadMessagesCount > 0) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .align(Alignment.TopEnd)
                                        .clip(CircleShape)
                                        .background(com.autamedica.android.presentation.theme.PortalPatientsAction),
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
        bottomBar = {
            // The server has explicitly offered this exact patient to this
            // logged-in doctor. Never derive a room ID from a request ID.
            val incomingAlert: PharmacyDispatchRequest? =
                uiState.simulatedDispatchAlert?.takeIf {
                    uiState.guardApproved == true &&
                        uiState.pharmacyOnDutyState.isOnDuty && !it.offerId.isNullOrBlank()
                }
            UberIncomingDispatchAlert(
                request = incomingAlert,
                isClaiming = uiState.claimingPharmacyRequestId == incomingAlert?.id,
                errorMessage = uiState.claimErrorMessage,
                onAccept = { reqId ->
                    viewModel.claimPharmacyRequest(reqId, onNavigateToVideoCall)
                },
                onDismiss = {
                    incomingAlert?.id?.let { viewModel.dismissDispatchAlert(it) } ?: viewModel.dismissDispatchAlert()
                },
                totalSeconds = 30,
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
                        CircularProgressIndicator(color = MedicalBlue, strokeWidth = 2.dp)
                    }
                }

                uiState.guardApproved != true -> {
                    val lifecycleOwner = LocalLifecycleOwner.current
                    var pausedWhilePending by remember { mutableStateOf(false) }
                    DisposableEffect(lifecycleOwner, uiState.guardApproved, uiState.isLoading) {
                        val observer = LifecycleEventObserver { _, event ->
                            if (event == Lifecycle.Event.ON_PAUSE) {
                                pausedWhilePending = true
                            } else if (
                                event == Lifecycle.Event.ON_RESUME &&
                                pausedWhilePending &&
                                uiState.guardApproved == false &&
                                !uiState.isLoading
                            ) {
                                pausedWhilePending = false
                                viewModel.refresh()
                            }
                        }
                        lifecycleOwner.lifecycle.addObserver(observer)
                        onDispose {
                            lifecycleOwner.lifecycle.removeObserver(observer)
                        }
                    }

                    val submittedLicense = uiState.doctorProfile?.licenseNumber
                        ?.trim()
                        ?.takeUnless { it.isBlank() || it.uppercase().startsWith("PENDING") }

                    // A registered doctor is not automatically an approved
                    // clinical practitioner. Keep profile/onboarding navigation
                    // accessible, but no appointments, patient charts, queue
                    // acceptance, video or other clinical shortcuts here.
                    Box(
                        modifier = Modifier.fillMaxSize().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = if (uiState.guardApproved == null)
                                    stringResource(R.string.ui_doctor_approval_checking)
                                else
                                    stringResource(R.string.ui_doctor_approval_pending),
                                style = MaterialTheme.typography.titleLarge,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = when {
                                    uiState.guardApproved == null ->
                                        stringResource(R.string.ui_doctor_approval_checking_body)
                                    submittedLicense != null ->
                                        stringResource(R.string.doctor_approval_submitted_body, submittedLicense)
                                    else ->
                                        stringResource(R.string.doctor_approval_incomplete_body)
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = Slate500,
                            )
                            if (uiState.guardApproved == false) {
                                Button(
                                    onClick = onNavigateToDoctorOnboarding,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(
                                        stringResource(
                                            if (submittedLicense != null) R.string.doctor_approval_cta_edit
                                            else R.string.doctor_approval_cta_complete
                                        )
                                    )
                                }
                                OutlinedButton(
                                    onClick = viewModel::refresh,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(stringResource(R.string.ui_doctor_approval_refresh))
                                }
                            } else {
                                Button(onClick = viewModel::refresh) {
                                    Text(stringResource(R.string.ui_doctor_approval_refresh))
                                }
                            }
                        }
                    }
                }

                else -> {
                    // The next patient must be an actual appointment, never a synthetic one.
                    val nextInQueue = uiState.todayAppointments.firstOrNull {
                        it.status == AppointmentStatus.SCHEDULED ||
                            it.status == AppointmentStatus.CONFIRMED ||
                            it.status == AppointmentStatus.IN_PROGRESS
                    }
                    val nextSummary = nextInQueue?.patientId?.let { uiState.patientsMap[it] }
                    val nextName = nextSummary?.let {
                        "${it.firstName} ${it.lastName}".trim().ifBlank { "Paciente" }
                    } ?: "Paciente"
                    val nextReason = nextInQueue?.let { cleanConsultationReason(it.notes, it.type) }.orEmpty()
                    val isNextJoinable = nextInQueue?.let { it.id in uiState.joinableAppointmentIds } ?: false

                    var inspectingPatient by remember { mutableStateOf<QueuedPatient?>(null) }

                    inspectingPatient?.let { patient ->
                        PreConsultationBottomSheet(
                            patient = patient,
                            onDismiss = { inspectingPatient = null },
                        )
                    }

                    LazyColumn(
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 140.dp),
                        verticalArrangement = Arrangement.spacedBy(22.dp),
                    ) {
                        // 1. COCKPIT HEADER & STATUS RING (Uber Driver + Epic Haiku)
                        if (!uiState.acceptedDispatchRoomId.isNullOrBlank()) {
                            item {
                                Button(
                                    onClick = { viewModel.retryAcceptedVideo(onNavigateToVideoCall) },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(stringResource(R.string.ui_doctor_retry_video))
                                }
                            }
                        }

                        // 1. HEADER DR. + FOTO AVATAR + SWITCH DE GUARDIA
                        item {
                            DoctorCockpitHeader(
                                doctorName = uiState.userName,
                                specialty = uiState.doctorProfile?.specialty?.let { raw ->
                                    formatDoctorSpecialty(raw, stringResource(R.string.doctor_specialty_general))
                                },
                                licenseNumber = uiState.doctorProfile?.licenseNumber,
                                licenseType = uiState.doctorProfile?.licenseType,
                                countryCode = uiState.doctorProfile?.countryCode,
                                ufBrazil = uiState.doctorProfile?.ufBrazil,
                                avatarUrl = uiState.userAvatarUrl,
                                isOnDuty = uiState.pharmacyOnDutyState.isOnDuty,
                                isLoading = uiState.pharmacyOnDutyState.isLoading,
                                guardApproved = uiState.guardApproved,
                                onToggleOnDuty = viewModel::togglePharmacyOnDuty,
                                onOpenProfile = { onNavigateToTab(DOCTOR_TAB_PROFILE) },
                            )
                        }

                        // 2. 3 BOTONES GRANDES DE EMISIÓN DIRECTA ARRIBA DE TODO (Receta · Certificado · Órdenes)
                        item {
                            QuickClinicalActionsBar(
                                onNavigateToPrescriptions = onNavigateToCreatePrescription,
                                onNavigateToCertificates = onNavigateToCreateCertificate,
                                onNavigateToMedicalOrders = onNavigateToCreateMedicalOrder,
                            )
                        }

                        // 3. RADAR DE GUARDIA (Visible SOLO cuando el switch de Guardia está ACTIVO)
                        if (uiState.pharmacyOnDutyState.isOnDuty) {
                            item {
                                LivePatientRadarDrawer(
                                    isOnDuty = true,
                                    liveWaitingQueue = uiState.liveWaitingQueue,
                                    activelyDispatchedPatientId = uiState.activelyDispatchedPatientId,
                                    onViewPatientChart = { patient ->
                                        inspectingPatient = patient
                                    },
                                    onNavigateToRadarDetail = onNavigateToDoctorOnDemand,
                                )
                            }
                        }

                        // 4. PRÓXIMO PACIENTE EN ESPERA + AGENDA DE HOY
                        if (nextInQueue != null) {
                            item {
                                HeroNextInQueueCard(
                                    appointment = nextInQueue,
                                    patientName = nextName,
                                    avatarUrl = nextSummary?.avatarUrl,
                                    reason = nextReason,
                                    isJoinable = isNextJoinable,
                                    onJoinCall = { onNavigateToVideoCall(nextInQueue.id) },
                                )
                            }
                        }

                        item {
                            UberEatsLiveAgendaSection(
                                appointments = uiState.todayAppointments,
                                joinableAppointmentIds = uiState.joinableAppointmentIds,
                                patientsMap = uiState.patientsMap,
                                onJoinCall = onNavigateToVideoCall,
                                onViewAll = onNavigateToDoctorAgenda,
                                onNavigateToCreateAppointment = onNavigateToDoctorAgenda,
                            )
                        }

                        // 5. MÉTRICAS DEL DÍA AL FINAL (Fila compacta de 3 números, oculta si están en 0)
                        item {
                            NubankClinicalMetricsSection(
                                stats = uiState.stats,
                                statsAvailable = uiState.statsAvailable,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES JETPACK COMPOSE MATERIAL 3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Cabecera médica con nombre y matrícula
 */
@Composable
private fun DoctorGreetingHeader(
    name: String,
    licenseNumber: String?,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (name.isNotBlank()) stringResource(R.string.doctor_greeting_name, name.split(" ").first()) else stringResource(R.string.doctor_greeting_fallback),
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontSize = 24.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.4).sp,
                ),
                color = AuTextPrimary,
            )

            if (licenseNumber != null) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = SoftBlueBg,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                            tint = MedicalBlue,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.doctor_license_badge, licenseNumber),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = MedicalBlue,
                        )
                    }
                }
            }
        }
    }
}

/**
 * 2. COCKPIT DE GUARDIA UBER DRIVER (Telemedicina On-Demand)
 * Card radius: 28dp | Háptica inmediata | Presencia telemetría | Zero-Yellow Gate
 */
@Composable
private fun AutaMedicaOsDutyHero(
    isOnDuty: Boolean,
    isLoading: Boolean,
    guardApproved: Boolean?,
    onToggleOnDuty: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val hapticFeedback = LocalHapticFeedback.current
    val infiniteTransition = rememberInfiniteTransition(label = "heroPulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "heroPulseAlpha",
    )

    Card(
        modifier = modifier
            .fillMaxWidth()
            .auSoftShadow(CardRadius),
        shape = RoundedCornerShape(CardRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(
            1.dp,
            if (isOnDuty) MedicalCyan.copy(alpha = 0.5f + (pulseAlpha * 0.3f)) else Color(0xFFE2E8F0)
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (isOnDuty) Color(0xFFF0FDF4) else Color.White)
                .padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f),
                ) {
                    // Indicador de estado (Verde vivo / Cyan vivo pulsante)
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(
                                if (isOnDuty) AutaGreen.copy(alpha = pulseAlpha)
                                else Color(0xFF94A3B8)
                            )
                    )
                    Spacer(modifier = Modifier.width(14.dp))
                    Column {
                        Text(
                            text = when {
                                guardApproved != true -> stringResource(R.string.doctor_duty_label_pending)
                                isOnDuty -> stringResource(R.string.doctor_duty_label_active)
                                else -> stringResource(R.string.doctor_duty_label_paused)
                            },
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontSize = 16.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = (-0.2).sp,
                            ),
                            color = if (isOnDuty) Color(0xFF0F172A) else Color(0xFF475569),
                        )
                        Text(
                            text = when {
                                guardApproved != true -> stringResource(R.string.ui_doctor_duty_requires_approval)
                                isOnDuty -> stringResource(R.string.ui_doctor_duty_receiving)
                                else -> stringResource(R.string.ui_doctor_duty_activate)
                            },
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                            color = if (isOnDuty) AutaGreen else Slate500,
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                // Switch táctil con háptica inmediata
                Switch(
                    checked = isOnDuty,
                    onCheckedChange = { isChecked ->
                        hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                        onToggleOnDuty(isChecked)
                    },
                    enabled = !isLoading && (guardApproved == true || isOnDuty),
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = AutaGreen,
                        uncheckedThumbColor = Color.White,
                        uncheckedTrackColor = Color(0xFFCBD5E1),
                        checkedBorderColor = Color.Transparent,
                        uncheckedBorderColor = Color.Transparent,
                    ),
                )
            }

            // Pill de Telemetría de Presencia
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = if (isOnDuty) SoftCyanBg else Slate100,
                border = BorderStroke(
                    0.5.dp,
                    if (isOnDuty) MedicalCyan.copy(alpha = 0.3f) else Slate200
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Sensors,
                        contentDescription = null,
                        tint = if (isOnDuty) MedicalCyan else Slate500,
                        modifier = Modifier.size(13.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isOnDuty) stringResource(R.string.doctor_duty_connected) else stringResource(R.string.doctor_duty_disconnected),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = if (isOnDuty) FontWeight.Bold else FontWeight.Medium,
                            color = if (isOnDuty) MedicalCyan else Slate700,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/**
 * 3. QUICK ACTIONS BAR MÉDICA
 * Card radius: 28dp | Iconografía Outlined | Sombra ultra suave
 */
@Composable
private fun DoctorQuickActionsBar(
    onNavigateToPrescriptions: () -> Unit,
    onNavigateToCertificates: () -> Unit,
    onNavigateToMedicalOrders: () -> Unit,
    onNavigateToCreateAppointment: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        QuickActionItem(
            label = "Recetas",
            icon = Icons.Outlined.Description,
            onClick = onNavigateToPrescriptions,
            modifier = Modifier.weight(1f),
        )
        QuickActionItem(
            label = "Certificados",
            icon = Icons.Outlined.Verified,
            onClick = onNavigateToCertificates,
            modifier = Modifier.weight(1f),
        )
        QuickActionItem(
            label = "Órdenes",
            icon = Icons.AutoMirrored.Outlined.Assignment,
            onClick = onNavigateToMedicalOrders,
            modifier = Modifier.weight(1f),
        )
        QuickActionItem(
            label = "+ Turno",
            icon = Icons.Default.Add,
            onClick = onNavigateToCreateAppointment,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun QuickActionItem(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier
            .auSoftShadow(CardRadius),
        shape = RoundedCornerShape(CardRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(
            modifier = Modifier.padding(vertical = 14.dp, horizontal = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(SoftBlueBg),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = MedicalBlue,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.3).sp,
                ),
                color = AuTextPrimary,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Clip,
            )
        }
    }
}

/**
 * 4. SEGUIMIENTO COMO FUNCIÓN ESTRELLA (Continuidad Asistencial & Telemetría)
 * Card radius: 28dp | Iconos Outlined + Filled | Sombra suave
 */
@Composable
private fun FollowUpStarSection(
    patients: List<PatientSummary>,
    onViewAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.doctor_continuity_title),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 1.sp,
                    ),
                    color = MedicalBlue,
                    maxLines = 1,
                )
                Text(
                    text = stringResource(R.string.doctor_continuity_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.doctor_view_all),
                style = MaterialTheme.typography.labelMedium,
                color = MedicalBlue,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onViewAll)
                    .padding(vertical = 4.dp, horizontal = 6.dp),
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(patients, key = { it.id }) { patient ->
                FollowUpPatientCard(patient = patient)
            }
        }
    }
}

@Composable
private fun FollowUpPatientCard(
    patient: PatientSummary,
    modifier: Modifier = Modifier,
) {
    val patientName = "${patient.firstName} ${patient.lastName}".trim().ifBlank { stringResource(R.string.doctor_patient_fallback_name) }
    Card(
        modifier = modifier
            .width(230.dp)
            .auSoftShadow(CardRadius),
        shape = RoundedCornerShape(CardRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Avatar con iniciales o AsyncImage
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(SoftBlueBg),
                    contentAlignment = Alignment.Center,
                ) {
                    if (!patient.avatarUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = patient.avatarUrl,
                            contentDescription = patientName,
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(CircleShape),
                            contentScale = ContentScale.Crop,
                        )
                    } else {
                        Text(
                            text = initialsOf(patientName),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = MedicalBlue,
                        )
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = patientName,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontWeight = FontWeight.Bold,
                        ),
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = if (patient.appointmentCount == 1) stringResource(R.string.doctor_prior_consultations_single, patient.appointmentCount) else stringResource(R.string.doctor_prior_consultations_plural, patient.appointmentCount),
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = AuTextTertiary,
                    )
                }
            }

            Surface(
                shape = RoundedCornerShape(10.dp),
                color = SoftCyanBg,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.History,
                        contentDescription = null,
                        tint = MedicalCyan,
                        modifier = Modifier.size(13.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.doctor_telemetry_adherence_ok),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        color = MedicalCyan,
                    )
                }
            }
        }
    }
}

/**
 * Today's actual scheduled appointments (without synthetic patients or click targets).
 */
@Composable
private fun UberEatsLiveAgendaSection(
    appointments: List<Appointment>,
    joinableAppointmentIds: Set<String>,
    patientsMap: Map<String, PatientSummary>,
    onJoinCall: (appointmentId: String) -> Unit,
    onViewAll: () -> Unit,
    onNavigateToCreateAppointment: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val todayScheduled = scheduledAppointmentsForLocalDay(
        appointments,
        LocalDate.now(),
        ZoneId.systemDefault(),
    )
    val countText = if (todayScheduled.size == 1) {
        stringResource(R.string.doctor_schedule_count_single, todayScheduled.size)
    } else {
        stringResource(R.string.doctor_schedule_count_plural, todayScheduled.size)
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = stringResource(R.string.doctor_schedule_today_title),
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = (-0.4).sp,
                    ),
                    color = Slate900,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(text = countText, style = MaterialTheme.typography.bodyMedium, color = Slate500)
            }
            IconButton(
                onClick = onNavigateToCreateAppointment,
                modifier = Modifier.size(36.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = stringResource(R.string.doctor_schedule_create_appointment_cd),
                    tint = MedicalBlue,
                    modifier = Modifier.size(24.dp),
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        if (todayScheduled.isEmpty()) {
            Text(
                text = stringResource(R.string.doctor_schedule_empty_state),
                style = MaterialTheme.typography.bodyMedium,
                color = Slate500,
                modifier = Modifier.padding(vertical = 14.dp),
            )
        } else {
            Column(modifier = Modifier.fillMaxWidth()) {
                todayScheduled.forEachIndexed { index, appointment ->
                    val patient = appointment.patientId?.let { patientsMap[it] }
                    val patientName = patient?.let {
                        "${it.firstName} ${it.lastName}".trim().ifBlank { stringResource(R.string.doctor_patient_fallback_name) }
                    } ?: stringResource(R.string.doctor_patient_fallback_name)
                    val isJoinable = appointment.id in joinableAppointmentIds
                    UberEatsLiveRowItem(
                        patientName = patientName,
                        reason = cleanConsultationReason(appointment.notes, appointment.type),
                        time = formatTime(appointment.startTime),
                        avatarUrl = patient?.avatarUrl,
                        isJoinable = isJoinable,
                        onJoinCall = { if (isJoinable) onJoinCall(appointment.id) },
                    )
                    if (index < todayScheduled.lastIndex) {
                        HorizontalDivider(
                            modifier = Modifier.padding(start = 56.dp),
                            color = Slate200.copy(alpha = 0.5f),
                            thickness = 0.5.dp,
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.doctor_schedule_new),
                style = MaterialTheme.typography.labelMedium,
                color = MedicalBlue,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onNavigateToCreateAppointment)
                    .padding(vertical = 6.dp, horizontal = 4.dp),
            )
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onViewAll)
                    .padding(vertical = 6.dp, horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.doctor_schedule_view_all),
                    style = MaterialTheme.typography.labelMedium,
                    color = MedicalBlue,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.width(4.dp))
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowForward,
                    contentDescription = null,
                    tint = MedicalBlue,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun UberEatsLiveRowItem(
    patientName: String,
    reason: String,
    time: String,
    avatarUrl: String?,
    isJoinable: Boolean,
    onJoinCall: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (isJoinable) Modifier.clickable(onClick = onJoinCall) else Modifier)
            .padding(vertical = 12.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Avatar circular minimalista con indicador de estado en vivo
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(if (isJoinable) SoftBlueBg else Slate100),
            contentAlignment = Alignment.Center,
        ) {
            if (!avatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = avatarUrl,
                    contentDescription = patientName,
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Text(
                    text = initialsOf(patientName),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (isJoinable) MedicalBlue else Slate800,
                )
            }

            if (isJoinable) {
                Box(
                    modifier = Modifier
                        .size(11.dp)
                        .align(Alignment.BottomEnd)
                        .clip(CircleShape)
                        .background(MedicalCyan)
                        .border(1.5.dp, Color.White, CircleShape)
                )
            }
        }

        Spacer(modifier = Modifier.width(14.dp))

        // Columna central: Nombre en negrita + Motivo clínico específico
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = patientName,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                ),
                color = Slate900,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = reason,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                color = Slate500,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        // Extremo derecho: Horario limpio (09:00, 09:30...)
        Text(
            text = time,
            style = MaterialTheme.typography.labelMedium.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            ),
            color = if (isJoinable) MedicalBlue else Slate700,
        )
    }
}

/**
 * Tarjeta Hero para el próximo paciente de la cola de trabajo
 * Card radius: 28dp | Botón Principal: Altura 58dp, Radio 20dp
 */
@Composable
private fun HeroNextInQueueCard(
    appointment: Appointment,
    patientName: String,
    avatarUrl: String?,
    reason: String,
    isJoinable: Boolean,
    onJoinCall: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .auSoftShadow(CardRadius),
        shape = RoundedCornerShape(CardRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(SoftBlueBg, Color.White)
                    )
                )
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.MedicalServices,
                        contentDescription = null,
                        tint = MedicalCyan,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.doctor_next_waiting),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 0.8.sp,
                        ),
                        color = MedicalCyan,
                    )
                }

                Text(
                    text = stringResource(R.string.doctor_appointment_time_label, formatTime(appointment.startTime)), 
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                    ),
                    color = Slate800,
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // Avatar destacado con iniciales o AsyncImage
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(Color.White),
                    contentAlignment = Alignment.Center,
                ) {
                    if (!avatarUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = avatarUrl,
                            contentDescription = patientName,
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(CircleShape),
                            contentScale = ContentScale.Crop,
                        )
                    } else {
                        Text(
                            text = initialsOf(patientName),
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = MedicalBlue,
                        )
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = patientName,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                        ),
                        color = Slate900,
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = reason,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        ),
                        color = MedicalCyan,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            val hapticFeedback = LocalHapticFeedback.current

            // BOTÓN PRINCIPAL: ALTURA EXACTA 58 DP, RADIO 20 DP CON HÁPTICA INMEDIATA
            Button(
                onClick = {
                    hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                    onJoinCall()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(58.dp),
                shape = RoundedCornerShape(20.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MedicalBlue,
                    contentColor = Color.White,
                ),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Videocam,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                    Text(
                        text = if (isJoinable) stringResource(R.string.doctor_consult_start_now) else stringResource(R.string.doctor_consult_open),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelLarge.copy(fontSize = 15.sp),
                    )
                }
            }
        }
    }
}



/**
 * 6. RESUMEN SEMANAL ESTILO STRIPE (FinTech / Data Visualization)
 * Card radius: 28dp | Sombra suave azulada | Grid 2x2 espacioso
 * Métricas:
 * - Consultas: 22 (+12% vs sem ant.)
 * - Pacientes: 16 (4 nuevos)
 * - Satisfacción: 94% (2% pts)
 * - Tiempo medio: 18 min (2 min)
 */
@Composable
fun StripeWeeklySummaryCard(
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .auSoftShadow(CardRadius),
        shape = RoundedCornerShape(CardRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(
            modifier = Modifier.padding(22.dp)
        ) {
            // Header estilo Stripe
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f, fill = false)) {
                    Text(
                        text = stringResource(R.string.doctor_weekly_summary_title),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Slate800,
                        letterSpacing = (-0.5).sp,
                        maxLines = 1,
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = stringResource(R.string.doctor_last_seven_days),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = Slate500,
                        maxLines = 1,
                    )
                }

                Spacer(modifier = Modifier.width(10.dp))

                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = SoftBlueBg,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.TrendingUp,
                            contentDescription = null,
                            tint = MedicalBlue,
                            modifier = Modifier.size(13.dp),
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.doctor_seven_days_badge),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp,
                            ),
                            color = MedicalBlue,
                            maxLines = 1,
                            softWrap = false,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Grid 2x2 - Fila 1: Consultas y Pacientes
            Row(modifier = Modifier.fillMaxWidth()) {
                StripeKpiItem(
                    modifier = Modifier.weight(1f),
                    title = "Consultas",
                    value = "22",
                    trend = "+12% sem.",
                    trendUp = true,
                    isCyan = false,
                )
                Spacer(modifier = Modifier.width(16.dp))
                StripeKpiItem(
                    modifier = Modifier.weight(1f),
                    title = stringResource(R.string.doctor_dashboard_patients_label),
                    value = "16",
                    trend = stringResource(R.string.doctor_dashboard_new_patients_trend, 4),
                    trendUp = true,
                    isCyan = false,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Grid 2x2 - Fila 2: Satisfacción y Tiempo medio
            Row(modifier = Modifier.fillMaxWidth()) {
                StripeKpiItem(
                    modifier = Modifier.weight(1f),
                    title = stringResource(R.string.doctor_dashboard_satisfaction_label),
                    value = "94%",
                    trend = stringResource(R.string.doctor_dashboard_satisfaction_trend, 2),
                    trendUp = true,
                    isCyan = true, // Cian médico para calidad y satisfacción
                )
                Spacer(modifier = Modifier.width(16.dp))
                StripeKpiItem(
                    modifier = Modifier.weight(1f),
                    title = stringResource(R.string.doctor_dashboard_average_time_label),
                    value = "18 min",
                    trend = "-2 min",
                    trendUp = false, // Menor tiempo es mejor, flecha hacia abajo
                    isCyan = false,
                )
            }
        }
    }
}

@Composable
private fun StripeKpiItem(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    trend: String,
    trendUp: Boolean,
    isCyan: Boolean,
) {
    val trendColor = if (isCyan) MedicalCyan else MedicalBlue
    val trendBgColor = if (isCyan) SoftCyanBg else SoftBlueBg
    val icon = if (trendUp) Icons.Filled.ArrowUpward else Icons.Filled.ArrowDownward

    Column(modifier = modifier) {
        Text(
            text = title,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = Slate500,
            letterSpacing = 0.2.sp,
            maxLines = 1,
        )
        Spacer(modifier = Modifier.height(4.dp))

        // Valor con números tabulares
        Text(
            text = value,
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            color = Slate800,
            letterSpacing = (-1).sp,
            style = TextStyle(
                fontFeatureSettings = "tnum",
            ),
        )
        Spacer(modifier = Modifier.height(8.dp))

        Surface(
            shape = RoundedCornerShape(8.dp),
            color = trendBgColor,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = trendColor,
                    modifier = Modifier.size(11.dp),
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = trend,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = trendColor,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COLA DE PACIENTES EN TIEMPO REAL (DESPACHO UBER DRIVER PARA TELEMEDICINA)
// Triaje: Rojo urgencia, Cian prioritario, Azul control, Verde estable (Zero-Yellow Gate)
// ─────────────────────────────────────────────────────────────────────────────

val TriageLevel.label: String get() = when(this) {
    TriageLevel.URGENCY -> "URGENCIA"
    TriageLevel.PRIORITY -> "PRIORITARIO"
    TriageLevel.CONTROL -> "CONTROL"
    TriageLevel.STABLE -> "SEGUIMIENTO"
}

val TriageLevel.color: Color get() = when(this) {
    TriageLevel.URGENCY -> AutaRed
    TriageLevel.PRIORITY -> MedicalCyan
    TriageLevel.CONTROL -> AutaBlue
    TriageLevel.STABLE -> AutaGreen
}

val TriageLevel.bgColor: Color get() = when(this) {
    TriageLevel.URGENCY -> SoftRedBg
    TriageLevel.PRIORITY -> SoftCyanBg
    TriageLevel.CONTROL -> SoftBlueBg
    TriageLevel.STABLE -> SoftGreenBg
}

val TriageLevel.borderColor: Color get() = when(this) {
    TriageLevel.URGENCY -> AutaRed
    TriageLevel.PRIORITY -> MedicalCyan
    TriageLevel.CONTROL -> AutaBlue
    TriageLevel.STABLE -> AutaGreen
}

@Composable
private fun LivePatientQueueSection(
    isOnDuty: Boolean,
    liveWaitingQueue: List<QueuedPatient>,
    activelyDispatchedPatientId: String?,
    modifier: Modifier = Modifier,
) {
    var inspectingPatient by remember { mutableStateOf<QueuedPatient?>(null) }

    // Pulso suave de conectividad en vivo (1400ms)
    val livePulse = rememberInfiniteTransition(label = "queueLivePulse")
    val pulseAlpha by livePulse.animateFloat(
        initialValue = 0.40f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "queuePulseAlpha",
    )

    // Bottom Sheet de Pre-Consulta Clínica Rápida (Ficha en 20 segundos)
    inspectingPatient?.let { patient ->
        PreConsultationBottomSheet(
            patient = patient,
            onDismiss = { inspectingPatient = null },
        )
    }

    AnimatedVisibility(
        visible = isOnDuty,
        enter = fadeIn(animationSpec = tween(350)) + slideInVertically(animationSpec = tween(350)) { -it / 3 },
        exit = fadeOut(animationSpec = tween(250)) + slideOutVertically(animationSpec = tween(250)) { -it / 3 },
        modifier = modifier,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            if (liveWaitingQueue.isEmpty()) {
                // Estado limpio para producción: guardia activa en espera de pacientes reales
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .auSoftShadow(CardRadius),
                    shape = RoundedCornerShape(CardRadius),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, GlassBorder),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 20.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(SoftGreenBg),
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(12.dp)
                                    .clip(CircleShape)
                                    .background(AutaGreen.copy(alpha = pulseAlpha))
                            )
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = stringResource(R.string.doctor_duty_active_no_waiting),
                                style = MaterialTheme.typography.titleSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    letterSpacing = (-0.2).sp,
                                ),
                                color = Slate900,
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = stringResource(R.string.ui_doctor_duty_dispatch_notification_hint),
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontSize = 12.sp,
                                    lineHeight = 16.sp,
                                ),
                                color = Slate700,
                            )
                        }
                    }
                }
            } else {
                val pagerState = rememberPagerState(pageCount = { liveWaitingQueue.size })

                // Cabecera viva: Pacientes esperando + indicador de socket + contador y posición de carrusel
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.doctor_patients_waiting_now),
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontSize = 18.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = (-0.3).sp,
                            ),
                            color = Slate900,
                        )
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(AutaGreen.copy(alpha = pulseAlpha))
                        )
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = SoftBlueBg,
                        border = BorderStroke(0.5.dp, AutaBlue.copy(alpha = 0.25f)),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "${pagerState.currentPage + 1}/${liveWaitingQueue.size}",
                                color = AutaBlue,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // CAROUSEL DINÁMICO DE PACIENTES
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxWidth(),
                    pageSpacing = 12.dp,
                    key = { index -> liveWaitingQueue.getOrNull(index)?.id ?: index },
                ) { pageIndex ->
                    val patient = liveWaitingQueue[pageIndex]
                    TriagePatientCard(
                        patient = patient,
                        isActivelyOffered = patient.id == activelyDispatchedPatientId,
                        onViewChart = { inspectingPatient = patient },
                    )
                }

                // Indicador visual de puntos animados del carrusel si hay múltiples pacientes
                if (liveWaitingQueue.size > 1) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        repeat(liveWaitingQueue.size) { index ->
                            val isSelected = pagerState.currentPage == index
                            val dotWidth by animateDpAsState(
                                targetValue = if (isSelected) 20.dp else 6.dp,
                                animationSpec = tween(300, easing = FastOutSlowInEasing),
                                label = "carouselDotWidth"
                            )
                            val dotColor by animateColorAsState(
                                targetValue = if (isSelected) AutaBlue else Color(0xFFCBD5E1),
                                animationSpec = tween(300, easing = FastOutSlowInEasing),
                                label = "carouselDotColor"
                            )
                            Box(
                                modifier = Modifier
                                    .padding(horizontal = 3.dp)
                                    .height(6.dp)
                                    .width(dotWidth)
                                    .clip(CircleShape)
                                    .background(dotColor)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TriagePatientCard(
    patient: QueuedPatient,
    isActivelyOffered: Boolean,
    onViewChart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isUrgent = patient.triage == TriageLevel.URGENCY

    // Pulso fisiológico suave para casos urgentes (1200ms, sobrio y clínico)
    val urgentTransition = rememberInfiniteTransition(label = "urgentPulse")
    val urgentGlowAlpha by urgentTransition.animateFloat(
        initialValue = 0.45f,
        targetValue = 0.95f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "urgentGlowAlpha",
    )

    val cardBorder = when {
        isActivelyOffered -> BorderStroke(1.5.dp, AutaBlue)
        isUrgent -> BorderStroke(1.dp, AutaRed.copy(alpha = 0.25f + (urgentGlowAlpha * 0.35f)))
        else -> BorderStroke(0.5.dp, GlassBorder)
    }

    val shadowModifier = if (isUrgent) {
        modifier
            .fillMaxWidth()
            .shadow(
                elevation = 4.dp,
                shape = RoundedCornerShape(24.dp),
                ambientColor = AutaRed.copy(alpha = 0.05f),
                spotColor = AutaRed.copy(alpha = 0.16f * urgentGlowAlpha),
            )
    } else {
        modifier
            .fillMaxWidth()
            .auSoftShadow(24.dp)
    }

    Card(
        modifier = shadowModifier,
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = cardBorder,
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            // Borde lateral de triaje (5dp de ancho con color clínico, respiración viva si es urgente)
            Box(
                modifier = Modifier
                    .width(5.dp)
                    .height(170.dp)
                    .background(
                        if (isUrgent) AutaRed.copy(alpha = 0.75f + (urgentGlowAlpha * 0.25f))
                        else patient.triage.borderColor,
                        RoundedCornerShape(topStart = 24.dp, bottomStart = 24.dp),
                    )
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 16.dp, end = 18.dp, top = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // 1. Paciente y edad
                val cleanName = cleanPatientName(patient.name)
                val patientDisplayName = if (patient.age > 0) stringResource(R.string.doctor_patient_name_with_age, cleanName, patient.age) else cleanName
                Text(
                    text = patientDisplayName,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 17.sp,
                        letterSpacing = (-0.3).sp,
                    ),
                    color = Slate900,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                // 2. Nivel de urgencia
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = patient.triage.bgColor,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        ) {
                            if (isUrgent) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(AutaRed.copy(alpha = urgentGlowAlpha))
                                )
                                Spacer(modifier = Modifier.width(5.dp))
                            }
                            Text(
                                text = patient.triage.label,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 0.5.sp,
                                color = patient.triage.color,
                                maxLines = 1,
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = patient.triageScale,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isUrgent) AutaRed.copy(alpha = 0.85f) else Slate500,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }

                // 3. Motivo principal de consulta
                Text(
                    text = patient.reason,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                    color = Slate700,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                // 4. Signos vitales relevantes
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (isUrgent) SoftRedBg.copy(alpha = 0.5f) else Slate100,
                ) {
                    Text(
                        text = patient.vitals,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = if (isUrgent) Color(0xFF991B1B) else Slate800,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        maxLines = 1,
                    )
                }

                // 5. Antecedentes
                Text(
                    text = "📋 ${patient.antecedents}",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Slate500,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                // Fila 6: Tiempo de espera + Estado de asignación + Botón VER FICHA (CERO BOTÓN ACEPTAR)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Outlined.Timer,
                            contentDescription = null,
                            tint = if (isUrgent) AutaRed else Slate500,
                            modifier = Modifier.size(13.dp),
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.doctor_wait_time_minutes, patient.waitMinutes),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isUrgent) AutaRed else Slate500,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        // Estado en tiempo real del motor de despacho
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = if (isActivelyOffered) SoftBlueBg else Slate100,
                        ) {
                            Text(
                                text = if (isActivelyOffered) stringResource(R.string.doctor_offer_countdown) else stringResource(R.string.doctor_waiting_status),
                                fontSize = 10.sp,
                                fontWeight = if (isActivelyOffered) FontWeight.Bold else FontWeight.Medium,
                                color = if (isActivelyOffered) AutaBlue else Slate500,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            )
                        }
                    }

                    // ÚNICO BOTÓN: VER FICHA (Pre-consulta 20 segundos)
                    OutlinedButton(
                        onClick = onViewChart,
                        modifier = Modifier.height(34.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, AutaBlue.copy(alpha = 0.45f)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.doctor_view_patient_record),
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            color = AutaBlue,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Bottom Sheet de Ficha Clínica Previa en 20 Segundos (Anti-Modal Web Compliant)
 * "Ningún piloto despega un avión preguntándole a los pasajeros si cargaron combustible"
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PreConsultationBottomSheet(
    patient: QueuedPatient,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = { BottomSheetDefaults.DragHandle(color = Slate200) },
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        containerColor = Color.White,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 22.dp, vertical = 6.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Cabecera con badge de nivel
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = patient.triage.bgColor,
                ) {
                    Text(
                        text = "${patient.triage.label} • ${patient.triageScale}",
                        color = patient.triage.color,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                    )
                }

                IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Cerrar",
                        tint = Slate500,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            // Identificación
            val cleanPreConsultName = cleanPatientName(patient.name)
            val preConsultDisplayName = if (patient.age > 0) stringResource(R.string.doctor_patient_name_with_age, cleanPreConsultName, patient.age) else cleanPreConsultName
            Column {
                Text(
                    text = preConsultDisplayName,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Slate900,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = stringResource(R.string.doctor_preconsultation_summary),
                    fontSize = 12.sp,
                    color = Slate500,
                )
            }

            // Banner de certeza clínica
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = SoftBlueBg,
                border = BorderStroke(0.5.dp, GlassBorder),
            ) {
                Text(
                    text = stringResource(R.string.doctor_preconsultation_quote),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = AutaBlue,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }

            // Signos Vitales
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = stringResource(R.string.doctor_vitals_recorded),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Slate500,
                    letterSpacing = 0.5.sp,
                )
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Slate100,
                ) {
                    Text(
                        text = patient.vitals,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Slate900,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }

            // Anamnesis / Motivo
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = stringResource(R.string.doctor_intake_anamnesis),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Slate500,
                    letterSpacing = 0.5.sp,
                )
                Text(
                    text = patient.intakeSummary,
                    fontSize = 13.sp,
                    color = Slate800,
                    lineHeight = 18.sp,
                )
            }

            // Antecedentes
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = stringResource(R.string.doctor_history_medication),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Slate500,
                    letterSpacing = 0.5.sp,
                )
                Text(
                    text = patient.antecedents,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Slate800,
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Botón de cierre de ficha clínica
            Button(
                onClick = onDismiss,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = AutaBlue),
            ) {
                Text(
                    text = stringResource(R.string.doctor_close_record),
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE PRESENTACIÓN CLÍNICA SIN DATOS INVENTADOS
// ─────────────────────────────────────────────────────────────────────────────

private fun cleanConsultationReason(notes: String?, type: AppointmentType): String {
    val recordedReason = notes.orEmpty().trim().removePrefix("Motivo:").trim()
    if (recordedReason.isNotBlank() &&
        !recordedReason.startsWith("http://", ignoreCase = true) &&
        !recordedReason.startsWith("https://", ignoreCase = true)
    ) {
        return recordedReason
    }
    return when (type) {
        AppointmentType.FOLLOW_UP -> "Seguimiento"
        AppointmentType.EMERGENCY -> "Urgencia"
        AppointmentType.LAB_TEST -> "Estudio"
        AppointmentType.CHECKUP -> "Control"
        AppointmentType.TELEMEDICINE -> "Teleconsulta"
        AppointmentType.CONSULTATION -> "Consulta"
    }
}

private fun initialsOf(raw: String): String {
    val parts = raw.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    val first = parts.first().firstOrNull()?.uppercase() ?: ""
    val last = parts.getOrNull(1)?.firstOrNull()?.uppercase() ?: ""
    return (first + last).ifBlank { "?" }
}

private fun formatTime(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("HH:mm", Locale("es", "AR")))
    } catch (_: Exception) {
        ""
    }
}
