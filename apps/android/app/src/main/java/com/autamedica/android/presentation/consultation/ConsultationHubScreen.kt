package com.autamedica.android.presentation.consultation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
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
import com.autamedica.android.domain.model.DoctorBookingInfo
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
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.SuccessContainer
import com.autamedica.android.presentation.theme.WarningContainer
import java.text.NumberFormat
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsultationHubScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToBookAppointment: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ConsultationHubViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var showEmergencyConfirmDialog by remember { mutableStateOf(false) }

    // Filter doctors based on selected reason
    val filteredDoctors = remember(uiState.availableDoctors, uiState.selectedReason) {
        val selected = uiState.selectedReason
        if (selected == null) {
            uiState.availableDoctors
        } else {
            val matches = uiState.availableDoctors.filter { doc ->
                doc.specialty.contains(selected.specialtyMatch, ignoreCase = true) ||
                    doc.specialty.contains(selected.title, ignoreCase = true)
            }
            if (matches.isNotEmpty()) matches else uiState.availableDoctors
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Consultar",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(AuSuccess),
                            )
                            Text(
                                text = "Telemedicina y Consulta Online",
                                style = MaterialTheme.typography.labelSmall,
                                color = PortalPatients,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                },
                actions = {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = PortalPatients.copy(alpha = 0.12f),
                        border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.35f)),
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
                                tint = PortalPatients,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(
                                text = "Agendar Turno",
                                style = MaterialTheme.typography.labelMedium,
                                color = PortalPatients,
                                fontWeight = FontWeight.Bold,
                            )
                        }
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
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = PortalPatients, strokeWidth = 2.dp)
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        // ── 1. Hero Superior: Telemedicina y Consulta Online ──
                        item {
                            TelemedicineHeroCard(
                                onDutyDoctorsCount = uiState.onDutyDoctorsCount,
                                emergencyWaitMinutes = uiState.emergencyWaitMinutes,
                            )
                        }

                        // ── Mensaje de confirmación/pago si existe ──
                        uiState.paymentMessage?.let { msg ->
                            item {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = SuccessContainer,
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
                                            modifier = Modifier.size(20.dp),
                                        )
                                        Text(
                                            text = msg,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AuTextPrimary,
                                            modifier = Modifier.weight(1f),
                                        )
                                        TextButton(onClick = viewModel::clearPaymentMessage) {
                                            Text("OK", color = AuSuccess, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }

                        // ── 2. Acceso Inmediato a Videoconsulta Activa (Si hay turno joinable o live) ──
                        uiState.activeTelemedicineAppointment?.let { activeApt ->
                            item {
                                ActiveTelemedicineCard(
                                    appointment = activeApt,
                                    onEnterVideoCall = { onNavigateToVideoCall(activeApt.id) },
                                )
                            }
                        }

                        // ── 3. Banner Prioritario de Pago Pendiente (Si hay turno pendiente) ──
                        uiState.pendingPaymentAppointment?.let { pendingApt ->
                            item {
                                PendingPaymentBanner(
                                    appointment = pendingApt,
                                    isPaying = uiState.payingAppointmentId == pendingApt.id,
                                    onPayNow = { viewModel.payAppointment(pendingApt) },
                                )
                            }
                        }

                        // ── 4. Guardia / Médico Online 24/7: Atención Inmediata Sin Turno Previo ──
                        item {
                            EmergencyOnCallCard(
                                waitMinutes = uiState.emergencyWaitMinutes,
                                onDutyCount = uiState.onDutyDoctorsCount,
                                isLoading = uiState.isEmergencyQueueLoading,
                                onStartConsultation = { showEmergencyConfirmDialog = true },
                            )
                        }

                        // ── 5. Filtro Rápido por Motivo de Consulta ──
                        item {
                            ConsultationReasonSelector(
                                selectedReason = uiState.selectedReason,
                                onSelectReason = viewModel::selectReason,
                            )
                        }

                        // Si seleccionó Receta Express: banner informativo
                        if (uiState.selectedReason == ConsultationReason.EXPRESS_PRESCRIPTION) {
                            item {
                                ExpressPrescriptionNotice(
                                    onConsultNow = { showEmergencyConfirmDialog = true },
                                )
                            }
                        }

                        // ── 6. Carrusel / Grilla de Profesionales con Disponibilidad Hoy ──
                        item {
                            AvailableTodaySection(
                                doctors = filteredDoctors,
                                onSelectDoctor = { onNavigateToBookAppointment() },
                            )
                        }

                        // ── 7. Mis Videoconsultas Agendadas (Próximos turnos online) ──
                        item {
                            UpcomingConsultationsHeader(
                                count = uiState.upcomingTelemedicineAppointments.size,
                                onScheduleNew = onNavigateToBookAppointment,
                            )
                        }

                        if (uiState.upcomingTelemedicineAppointments.isEmpty() && uiState.activeTelemedicineAppointment == null) {
                            item {
                                EmptyConsultationsCard(
                                    onScheduleNew = onNavigateToBookAppointment,
                                )
                            }
                        } else {
                            items(
                                items = uiState.upcomingTelemedicineAppointments,
                                key = { it.id },
                            ) { apt ->
                                AppointmentCard(
                                    appointment = apt,
                                    onJoinCall = if (apt.id in uiState.joinableAppointmentIds) {
                                        { onNavigateToVideoCall(apt.id) }
                                    } else null,
                                )
                            }
                        }

                        // Bottom space
                        item {
                            Spacer(modifier = Modifier.height(24.dp))
                        }
                    }
                }
            }
        }
    }

    // ── Dialog de confirmación de Guardia 24/7 ──
    if (showEmergencyConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showEmergencyConfirmDialog = false },
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(AuSuccess),
                    )
                    Text(
                        text = "Guardia Médica 24/7",
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "Te asignaremos de inmediato con el próximo profesional médico de guardia disponible.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextSecondary,
                    )
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = AuSurfaceHover,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "• Tiempo estimado de espera: ~${uiState.emergencyWaitMinutes} minutos",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "• Videoconsulta directa y segura cifrada punto a punto",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextSecondary,
                            )
                            Text(
                                text = "• Emisión de receta digital oficial si corresponde",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextSecondary,
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showEmergencyConfirmDialog = false
                        viewModel.requestEmergencyConsultation { appointmentId ->
                            onNavigateToVideoCall(appointmentId)
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Ingresar a la sala ahora", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showEmergencyConfirmDialog = false }) {
                    Text("Cancelar", color = AuTextTertiary)
                }
            },
            containerColor = AuSurface,
            shape = RoundedCornerShape(20.dp),
        )
    }
}

// ── COMPONENTES DEL CENTRO DE CONSULTA Y TELEMEDICINA ──

@Composable
private fun TelemedicineHeroCard(
    onDutyDoctorsCount: Int,
    emergencyWaitMinutes: Int,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFF0F172A), // Dark slate / navy premium hero
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF0284C7).copy(alpha = 0.35f),
                            Color(0xFF0F172A),
                        ),
                    ),
                )
                .padding(20.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                // Top tag row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = Color.White.copy(alpha = 0.12f),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Videocam,
                                contentDescription = null,
                                tint = Color(0xFF38BDF8),
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = "Centro de Telemedicina",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }

                    // Online pill
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = Color(0xFF065F46).copy(alpha = 0.4f),
                        border = BorderStroke(1.dp, Color(0xFF10B981).copy(alpha = 0.6f)),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF34D399)),
                            )
                            Text(
                                text = "Guardia activa 24/7",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFFA7F3D0),
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                            )
                        }
                    }
                }

                // Main headline
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Telemedicina",
                        style = MaterialTheme.typography.titleLarge,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp,
                    )
                    Text(
                        text = "Videoconsultas y recetas digitales con validez nacional.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFF94A3B8),
                        lineHeight = 20.sp,
                    )
                }

                // Stats strip
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.07f))
                        .padding(vertical = 10.dp, horizontal = 12.dp),
                    horizontalArrangement = Arrangement.SpaceAround,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "$onDutyDoctorsCount+",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color(0xFF38BDF8),
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Médicos online",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF94A3B8),
                            fontSize = 10.sp,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .height(26.dp)
                            .width(1.dp)
                            .background(Color.White.copy(alpha = 0.15f)),
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "~$emergencyWaitMinutes min",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color(0xFF34D399),
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Espera guardia",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF94A3B8),
                            fontSize = 10.sp,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .height(26.dp)
                            .width(1.dp)
                            .background(Color.White.copy(alpha = 0.15f)),
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "100%",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color(0xFFFBBF24),
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Receta digital",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF94A3B8),
                            fontSize = 10.sp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ActiveTelemedicineCard(
    appointment: Appointment,
    onEnterVideoCall: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFFF0F9FF), // Sky-50
        border = BorderStroke(1.5.dp, Color(0xFF0284C7)),
        shadowElevation = 3.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0xFF0284C7).copy(alpha = 0.14f),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF0284C7)),
                        )
                        Text(
                            text = "VIDEOCONSULTA LISTA",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF0369A1),
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp,
                        )
                    }
                }

                Text(
                    text = "Acceso directo",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = appointment.doctorName ?: "Profesional médico asignado",
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "${appointment.doctorSpecialty ?: "Medicina General"} · Turno confirmado",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }

            // CTA Button to enter video room
            Button(
                onClick = onEnterVideoCall,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Videocam,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Entrar a la sala de videollamada",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }
    }
}

@Composable
private fun PendingPaymentBanner(
    appointment: Appointment,
    isPaying: Boolean,
    onPayNow: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFFFFFBEB), // Amber-50
        border = BorderStroke(1.dp, Color(0xFFF59E0B).copy(alpha = 0.5f)),
        shadowElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFFEF3C7),
                    border = BorderStroke(1.dp, Color(0xFFF59E0B).copy(alpha = 0.3f)),
                    modifier = Modifier.size(40.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Outlined.CreditCard,
                            contentDescription = null,
                            tint = Color(0xFFD97706),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Pago pendiente",
                        style = MaterialTheme.typography.titleSmall,
                        color = Color(0xFF92400E),
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "Confirmá para habilitar la videoconsulta.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFB45309),
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Total:",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                    Text(
                        text = formatArs(appointment.doctorFee ?: 15000.0),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                }

                Button(
                    onClick = onPayNow,
                    enabled = !isPaying,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFD97706),
                        contentColor = Color.White,
                    ),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    if (isPaying) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Confirmando...")
                    } else {
                        Text("Pagar consulta", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun EmergencyOnCallCard(
    waitMinutes: Int,
    onDutyCount: Int,
    isLoading: Boolean,
    onStartConsultation: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFFF0FDF4), // Emerald-50
        border = BorderStroke(1.dp, Color(0xFF10B981).copy(alpha = 0.4f)),
        modifier = Modifier.fillMaxWidth(),
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
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFDCFCE7),
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.HealthAndSafety,
                                contentDescription = null,
                                tint = Color(0xFF059669),
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                    Column {
                        Text(
                            text = "Guardia Médica 24/7",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "Atención inmediata sin turno",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF059669),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0xFFDCFCE7),
                    border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF10B981)),
                        )
                        Text(
                            text = "~$waitMinutes min",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF065F46),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            Text(
                text = "Videoconsulta al instante con médico clínico de guardia.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
                lineHeight = 18.sp,
            )

            Button(
                onClick = onStartConsultation,
                enabled = !isLoading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF059669),
                    contentColor = Color.White,
                ),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Conectando con guardia...")
                } else {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Ingresar a guardia",
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun ConsultationReasonSelector(
    selectedReason: ConsultationReason?,
    onSelectReason: (ConsultationReason?) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Motivo de consulta",
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            if (selectedReason != null) {
                Text(
                    text = "Limpiar filtro",
                    style = MaterialTheme.typography.labelSmall,
                    color = PortalPatients,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onSelectReason(null) },
                )
            }
        }

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(ConsultationReason.values()) { reason ->
                val isSelected = selectedReason == reason
                val icon: ImageVector = when (reason) {
                    ConsultationReason.GENERAL -> Icons.Outlined.MedicalServices
                    ConsultationReason.PEDIATRICS -> Icons.Outlined.FavoriteBorder
                    ConsultationReason.MENTAL_HEALTH -> Icons.Outlined.Psychology
                    ConsultationReason.EXPRESS_PRESCRIPTION -> Icons.Outlined.Description
                }

                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = if (isSelected) PortalPatients else AuSurface,
                    border = BorderStroke(
                        1.dp,
                        if (isSelected) PortalPatients else AuBorder,
                    ),
                    modifier = Modifier.clickable { onSelectReason(reason) },
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = if (isSelected) Color.White else PortalPatients,
                            modifier = Modifier.size(18.dp),
                        )
                        Column {
                            Text(
                                text = reason.title,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) Color.White else AuTextPrimary,
                            )
                            Text(
                                text = reason.subtitle,
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.sp,
                                color = if (isSelected) Color.White.copy(alpha = 0.8f) else AuTextTertiary,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ExpressPrescriptionNotice(
    onConsultNow: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFFF8FAFC),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                imageVector = Icons.Outlined.Description,
                contentDescription = null,
                tint = PortalPatients,
                modifier = Modifier.size(24.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Renovación de Receta Express",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )
                Text(
                    text = "Recibí tu receta oficial firmada digitalmente con homologación Farmalink en tu celular.",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    fontSize = 11.sp,
                )
            }
            Button(
                onClick = onConsultNow,
                colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text("Pedir", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun AvailableTodaySection(
    doctors: List<DoctorBookingInfo>,
    onSelectDoctor: (DoctorBookingInfo) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Médicos disponibles",
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Atención en el día",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
            }

            Surface(
                shape = RoundedCornerShape(999.dp),
                color = Color(0xFFECFDF5),
                border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "${doctors.size} disponibles",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF065F46),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(doctors) { doctor ->
                DoctorConsultationCard(
                    doctor = doctor,
                    onConsultClick = { onSelectDoctor(doctor) },
                )
            }
        }
    }
}

@Composable
private fun DoctorConsultationCard(
    doctor: DoctorBookingInfo,
    onConsultClick: () -> Unit,
) {
    val avatarRes = remember(doctor.name, doctor.id) {
        getDoctorAvatarRes(doctor.name, doctor.id)
    }

    Surface(
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 1.dp,
        modifier = Modifier
            .width(220.dp)
            .clickable { onConsultClick() },
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Header with Avatar
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(
                    painter = painterResource(id = avatarRes),
                    contentDescription = doctor.name,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop,
                )

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFECFDF5),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF059669),
                            modifier = Modifier.size(11.dp),
                        )
                        Text(
                            text = "Hoy",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF065F46),
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                        )
                    }
                }
            }

            // Doctor Info
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = doctor.name,
                    style = MaterialTheme.typography.titleSmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = doctor.specialty,
                    style = MaterialTheme.typography.bodySmall,
                    color = PortalPatients,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = doctor.licenseNumber,
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    fontSize = 10.sp,
                )
            }

            // Next slot pill
            val nextSlot = doctor.availableSlots.firstOrNull() ?: "En 20 min"
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = AuSurfaceHover,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Schedule,
                        contentDescription = null,
                        tint = AuTextSecondary,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = "Turno hoy: $nextSlot",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextSecondary,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            // Price & Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = formatArs(doctor.consultationFee ?: 15000.0),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )

                Button(
                    onClick = onConsultClick,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                    modifier = Modifier.height(32.dp),
                ) {
                    Text(
                        text = "Consultar",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun UpcomingConsultationsHeader(
    count: Int,
    onScheduleNew: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(
                text = "Mis Videoconsultas Agendadas",
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "$count consulta${if (count == 1) "" else "s"} online en curso",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
            )
        }

        Text(
            text = "Nueva",
            style = MaterialTheme.typography.labelMedium,
            color = PortalPatients,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.clickable { onScheduleNew() },
        )
    }
}

@Composable
private fun EmptyConsultationsCard(
    onScheduleNew: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Surface(
                modifier = Modifier.size(56.dp),
                shape = CircleShape,
                color = Color(0xFFF0F9FF),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        tint = PortalPatients,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }
            Text(
                text = "Sin videoconsultas programadas",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
            Text(
                text = "Agendá tu primera consulta online o conectate de inmediato con la guardia 24/7.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Button(
                onClick = onScheduleNew,
                colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
                shape = RoundedCornerShape(12.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = Color.White,
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Agendar videoconsulta",
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }
    }
}

// ── UTILIDADES ──

private fun getDoctorAvatarRes(name: String, doctorId: String): Int {
    val isFemale = name.contains("Dra.", ignoreCase = true) ||
        name.contains("Mariana", ignoreCase = true) ||
        name.contains("Camila", ignoreCase = true) ||
        name.contains("Valentina", ignoreCase = true) ||
        name.contains("Valeria", ignoreCase = true)
    val isMale = name.contains("Dr.", ignoreCase = true) && !isFemale
    val hash = abs(doctorId.hashCode() xor name.hashCode())
    return when {
        isFemale && !isMale -> {
            when (hash % 3) {
                0 -> R.drawable.avatar_doctor_f1
                1 -> R.drawable.avatar_doctor_f2
                else -> R.drawable.avatar_doctor_f3
            }
        }
        else -> {
            when (hash % 3) {
                0 -> R.drawable.avatar_doctor_m1
                1 -> R.drawable.avatar_doctor_m2
                else -> R.drawable.avatar_doctor_m3
            }
        }
    }
}

private fun formatArs(amount: Double): String {
    val format = NumberFormat.getCurrencyInstance(Locale("es", "AR"))
    format.maximumFractionDigits = 0
    return format.format(amount)
}
