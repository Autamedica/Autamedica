package com.autamedica.android.presentation.consultation

import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.HealthAndSafety
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.SuccessContainer
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsultationHubScreen(
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToBookAppointment: () -> Unit = {},
    onNavigateToPharmacyIntake: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ConsultationHubViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = androidx.compose.ui.platform.LocalContext.current

    LaunchedEffect(uiState.checkoutUrlToLaunch) {
        val url = uiState.checkoutUrlToLaunch ?: return@LaunchedEffect
        runCatching {
            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)).apply {
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
        viewModel.clearCheckoutUrl()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.consultation_title),
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
                                text = stringResource(R.string.consultation_subtitle),
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
                                text = stringResource(R.string.consultation_schedule_button),
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
                                availableDoctorsCount = uiState.availableDoctors.size,
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
                                            Text(stringResource(R.string.consultation_ok), color = AuSuccess, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }

                        // ── 2. Acceso Inmediato a Videoconsulta Activa (único punto de ingreso del paciente) ──
                        uiState.activeTelemedicineAppointment?.let { activeApt ->
                            item {
                                ActiveTelemedicineCard(
                                    appointment = activeApt,
                                    onEnterVideoCall = { onNavigateToVideoCall(activeApt.id) },
                                )
                            }
                        }

                        // ── 3. Banner Prioritario de Pago Pendiente ──
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
                                availableDoctorsCount = uiState.availableDoctors.size,
                                isLoading = uiState.isEmergencyQueueLoading,
                                onStartConsultation = onNavigateToPharmacyIntake,
                            )
                        }

                        // ── 5. Estado honesto: sin consultas activas ──
                        if (uiState.activeTelemedicineAppointment == null && uiState.pendingPaymentAppointment == null) {
                            item {
                                EmptyConsultationsCard(
                                    onScheduleNew = onNavigateToBookAppointment,
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


}

// ── COMPONENTES DEL CENTRO DE CONSULTA Y TELEMEDICINA ──

@Composable
private fun TelemedicineHeroCard(
    availableDoctorsCount: Int,
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
                                text = stringResource(R.string.consultation_hero_badge),
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
                                text = stringResource(R.string.consultation_hero_emergency_active),
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
                        text = stringResource(R.string.consultation_hero_title),
                        style = MaterialTheme.typography.titleLarge,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp,
                    )
                    Text(
                        text = stringResource(R.string.consultation_hero_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFF94A3B8),
                        lineHeight = 20.sp,
                    )
                }

                // Stats strip: datos reales de disponibilidad
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
                            text = "$availableDoctorsCount",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color(0xFF38BDF8),
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = stringResource(R.string.consultation_hero_available_doctors),
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
                            text = "24/7",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color(0xFF34D399),
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = stringResource(R.string.consultation_hero_emergency_label),
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
                            text = "HD",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color(0xFFFBBF24),
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = stringResource(R.string.consultation_hero_hd_label),
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
                            text = stringResource(R.string.consultation_active_card_ready),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF0369A1),
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp,
                        )
                    }
                }

                Text(
                    text = stringResource(R.string.consultation_active_card_direct_access),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = appointment.doctorName ?: stringResource(R.string.consultation_default_doctor_name),
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.consultation_specialty_confirmed, appointment.doctorSpecialty ?: stringResource(R.string.appointments_default_specialty)),
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
                    text = stringResource(R.string.consultation_enter_room_button),
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
                        text = stringResource(R.string.consultation_payment_pending_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = Color(0xFF92400E),
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = stringResource(R.string.consultation_payment_pending_subtitle),
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
                        text = stringResource(R.string.consultation_payment_total),
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
                        Text(stringResource(R.string.consultation_payment_confirming))
                    } else {
                        Text(stringResource(R.string.consultation_payment_button), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun EmergencyOnCallCard(
    availableDoctorsCount: Int,
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
                            text = stringResource(R.string.consultation_emergency_dialog_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.consultation_emergency_card_subtitle),
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
                            text = if (availableDoctorsCount > 0) {
                                if (availableDoctorsCount == 1) {
                                    stringResource(R.string.consultation_emergency_available_single, availableDoctorsCount)
                                } else {
                                    stringResource(R.string.consultation_emergency_available_plural, availableDoctorsCount)
                                }
                            } else {
                                stringResource(R.string.consultation_emergency_waiting)
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF065F46),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            Text(
                text = stringResource(R.string.consultation_emergency_card_description),
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
                    Text(stringResource(R.string.consultation_emergency_connecting))
                } else {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.consultation_emergency_enter_button),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
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
                text = stringResource(R.string.consultation_empty_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
            Text(
                text = stringResource(R.string.consultation_empty_subtitle),
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
                    text = stringResource(R.string.consultation_empty_button),
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }
    }
}

private fun formatArs(amount: Double): String {
    val format = NumberFormat.getCurrencyInstance(Locale("es", "AR"))
    format.maximumFractionDigits = 0
    return format.format(amount)
}