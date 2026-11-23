package com.autamedica.android.presentation.consultation

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.PortalPatientsAction
import com.autamedica.android.presentation.theme.PrimaryContainer
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
    val context = LocalContext.current

    LaunchedEffect(uiState.checkoutUrlToLaunch) {
        val url = uiState.checkoutUrlToLaunch ?: return@LaunchedEffect
        runCatching {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
        viewModel.clearCheckoutUrl()
    }

    PullToRefreshBox(
        isRefreshing = uiState.isRefreshing,
        onRefresh = viewModel::refresh,
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC)),
    ) {
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = PortalPatientsAction, strokeWidth = 2.5.dp)
                }
            }

            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // 1. Payment confirmation banner (green strictly for confirmed payment)
                    uiState.paymentMessage?.let { msg ->
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = SuccessContainer,
                                border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.35f)),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
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
                                        Text(
                                            text = stringResource(R.string.consultation_ok),
                                            color = Color(0xFF15803D),
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // 2. Active telemedicine room (top priority when confirmed & ready)
                    uiState.activeTelemedicineAppointment?.let { activeApt ->
                        item {
                            ActiveTelemedicineCard(
                                appointment = activeApt,
                                onEnterVideoCall = { onNavigateToVideoCall(activeApt.id) },
                            )
                        }
                    }

                    // 3. Pending payment banner (fail-closed payment gate)
                    uiState.pendingPaymentAppointment?.let { pendingApt ->
                        item {
                            PendingPaymentBanner(
                                appointment = pendingApt,
                                isPaying = uiState.payingAppointmentId == pendingApt.id,
                                onPayNow = { viewModel.payAppointment(pendingApt) },
                            )
                        }
                    }

                    // 4. Primary Hero: Live Doctor Availability Radar + Immediate Care CTA (AutaMedica Blue)
                    item {
                        DoctorRadarActionCard(
                            availableDoctorsCount = uiState.availableDoctors.size,
                            isLoading = uiState.isEmergencyQueueLoading,
                            onStartConsultation = onNavigateToPharmacyIntake,
                        )
                    }

                    // 5. Balanced Secondary Card: Schedule Consultation (switches to Mis turnos)
                    item {
                        ScheduleConsultationCard(
                            onScheduleClick = onNavigateToBookAppointment,
                        )
                    }

                    item {
                        Spacer(modifier = Modifier.height(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun DoctorRadarActionCard(
    availableDoctorsCount: Int,
    isLoading: Boolean,
    onStartConsultation: () -> Unit,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "doctor_radar")
    val outerScale by infiniteTransition.animateFloat(
        initialValue = 0.86f,
        targetValue = 1.24f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1900, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "outer_scale",
    )
    val outerAlpha by infiniteTransition.animateFloat(
        initialValue = 0.34f,
        targetValue = 0.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1900, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "outer_alpha",
    )
    val innerScale by infiniteTransition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1900, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "inner_scale",
    )

    val hasDoctorsOnline = availableDoctorsCount > 0

    Surface(
        shape = RoundedCornerShape(26.dp),
        color = Color.White,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Animated AutaMedica Sky Radar Emblem
            Box(
                modifier = Modifier.size(124.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(116.dp)
                        .scale(outerScale)
                        .clip(CircleShape)
                        .background(AuAccent.copy(alpha = outerAlpha)),
                )
                Box(
                    modifier = Modifier
                        .size(88.dp)
                        .scale(innerScale)
                        .clip(CircleShape)
                        .background(PrimaryContainer),
                )
                Box(
                    modifier = Modifier
                        .size(62.dp)
                        .clip(CircleShape)
                        .background(PortalPatientsAction),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            // Availability status pill — GREEN ONLY when confirming live doctors online
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = if (hasDoctorsOnline) SuccessContainer else Color(0xFFF0F9FF),
                border = BorderStroke(
                    1.dp,
                    if (hasDoctorsOnline) AuSuccess.copy(alpha = 0.35f) else AuBorder,
                ),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (hasDoctorsOnline) AuSuccess else AuAccent),
                    )
                    Text(
                        text = when {
                            availableDoctorsCount == 1 -> stringResource(R.string.consult_radar_doctors_one)
                            availableDoctorsCount > 1 -> stringResource(R.string.consult_radar_doctors_many, availableDoctorsCount)
                            else -> stringResource(R.string.consult_radar_checking)
                        },
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (hasDoctorsOnline) Color(0xFF15803D) else PortalPatientsAction,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }

            // Clear street-readable copy
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = stringResource(R.string.consult_radar_title),
                    style = MaterialTheme.typography.headlineSmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.consult_radar_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                    textAlign = TextAlign.Center,
                    lineHeight = 20.sp,
                )
            }

            // Primary AutaMedica Blue CTA (56dp thumb target)
            Button(
                onClick = onStartConsultation,
                enabled = !isLoading,
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PortalPatientsAction,
                    contentColor = Color.White,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp),
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.consultation_emergency_connecting),
                        fontWeight = FontWeight.Bold,
                    )
                } else {
                    Text(
                        text = stringResource(R.string.consult_radar_cta),
                        style = MaterialTheme.typography.labelLarge,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        softWrap = false,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ScheduleConsultationCard(
    onScheduleClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(22.dp),
        color = Color.White,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(CircleShape)
                        .background(PrimaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        tint = PortalPatientsAction,
                        modifier = Modifier.size(22.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.consult_schedule_card_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(R.string.consult_schedule_card_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            OutlinedButton(
                onClick = onScheduleClick,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = Color(0xFFF0F9FF),
                    contentColor = PortalPatientsAction,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.CalendarMonth,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.consult_schedule_card_cta),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    softWrap = false,
                )
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
        shape = RoundedCornerShape(22.dp),
        color = Color(0xFFF0F9FF),
        border = BorderStroke(1.5.dp, PortalPatientsAction),
        shadowElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = SuccessContainer,
                border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.35f)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(AuSuccess),
                    )
                    Text(
                        text = stringResource(R.string.consult_active_room_badge),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF15803D),
                    )
                }
            }

            Text(
                text = appointment.doctorName?.takeIf { it.isNotBlank() }
                    ?: stringResource(R.string.consult_active_room_default_doctor),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )

            Button(
                onClick = onEnterVideoCall,
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PortalPatientsAction,
                    contentColor = Color.White,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 50.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Videocam,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.consult_active_room_cta),
                    fontWeight = FontWeight.Bold,
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
        color = Color.White,
        border = BorderStroke(1.5.dp, AuAccent),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(PrimaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CreditCard,
                        contentDescription = null,
                        tint = PortalPatientsAction,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.consult_pending_payment_title),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Text(
                        text = appointment.doctorName?.takeIf { it.isNotBlank() }
                            ?: stringResource(R.string.consult_pending_payment_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }

            Button(
                onClick = onPayNow,
                enabled = !isPaying,
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PortalPatientsAction,
                    contentColor = Color.White,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
            ) {
                if (isPaying) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                } else {
                    Text(
                        text = stringResource(R.string.consult_pending_payment_cta),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}
