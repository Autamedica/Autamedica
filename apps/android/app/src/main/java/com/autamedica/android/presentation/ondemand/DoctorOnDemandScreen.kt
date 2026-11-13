package com.autamedica.android.presentation.ondemand

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import com.autamedica.android.R
import androidx.compose.ui.res.stringResource
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.model.dispatchTierLabel
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuCrimson
import com.autamedica.android.presentation.theme.AuCyan
import com.autamedica.android.presentation.theme.AuCyanDeep
import com.autamedica.android.presentation.theme.AuCyanSoft
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuNavy
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalDoctorsAction
import com.autamedica.android.presentation.theme.PortalPharmacistsAction
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorOnDemandScreen(
    onBack: () -> Unit,
    onNavigateToCall: (roomId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorOnDemandViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val haptic = LocalHapticFeedback.current

    // Feedback táctil instantáneo cuando entra una solicitud on-demand
    LaunchedEffect(uiState.searchingRequests.size) {
        if (uiState.searchingRequests.isNotEmpty()) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }

    LaunchedEffect(viewModel.navigateToCall) {
        viewModel.navigateToCall.collect { claim ->
            if (claim != null && !claim.cloudflareRoomId.isNullOrBlank()) {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onNavigateToCall(claim.cloudflareRoomId)
                viewModel.consumeNavigateToCall()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.ui_ondemand_title),
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-0.5).sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = stringResource(R.string.ui_ondemand_subtitle),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.ui_ondemand_back),
                            tint = AuTextPrimary,
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(4.dp))

            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                    }
                }

                else -> {
                    DutyToggleCard(
                        isOnDuty = uiState.isOnDuty,
                        isLoading = uiState.isDutyLoading,
                        guardApproved = uiState.guardApproved,
                        onToggle = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            viewModel.toggleDuty()
                        },
                    )

                    uiState.error?.let { error ->
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFFEF2F2),
                            border = BorderStroke(1.dp, Color(0xFFFECACA)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = error,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFFB91C1C),
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }

                    if (!uiState.activeRoomId.isNullOrBlank() && !uiState.activeRequestId.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = viewModel::retryAcceptedCall,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(stringResource(R.string.ui_ondemand_retry_call))
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = stringResource(R.string.ui_ondemand_offers),
                            style = MaterialTheme.typography.titleSmall,
                            color = AuTextSecondary,
                            fontWeight = FontWeight.Bold,
                        )
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = if (uiState.searchingRequests.isNotEmpty()) AuEmerald else Color(0xFFF1F5F9),
                        ) {
                            Text(
                                text = uiState.searchingRequests.size.toString(),
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = if (uiState.searchingRequests.isNotEmpty()) Color.White else AuTextTertiary,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    if (uiState.searchingRequests.isEmpty() || !uiState.isOnDuty) {
                        if (uiState.isOnDuty) {
                            DoctorOnDutyRadar()
                        } else {
                            EmptyQueueCard(
                                isOnDuty = false,
                                onActivate = {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    viewModel.toggleDuty()
                                },
                            )
                        }
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                            contentPadding = PaddingValues(bottom = 24.dp),
                        ) {
                            items(
                                items = uiState.searchingRequests,
                                key = { it.id }
                            ) { request ->
                                IncomingDispatchOfferCard(
                                    request = request,
                                    isClaiming = uiState.claimingId == request.id,
                                    onAccept = {
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                        viewModel.accept(request)
                                    },
                                    onDecline = {
                                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        viewModel.dismiss(request)
                                    },
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
private fun DutyToggleCard(
    isOnDuty: Boolean,
    isLoading: Boolean,
    guardApproved: Boolean?,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = if (isOnDuty) AuSuccess.copy(alpha = 0.12f) else Color(0xFFF8FAFC),
        border = BorderStroke(
            1.dp,
            if (isOnDuty) AuSuccess.copy(alpha = 0.4f) else Color(0xFFE2E8F0),
        ),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(44.dp),
                shape = CircleShape,
                color = if (isOnDuty) AuSuccess.copy(alpha = 0.18f) else Color(0xFFF1F5F9),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            color = if (isOnDuty) AuSuccess else AuTextTertiary,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(if (isOnDuty) AuSuccess else Color(0xFFCBD5E1)),
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = when {
                        guardApproved != true -> "Guardia pendiente de aprobación"
                        isOnDuty -> "Guardia activa"
                        else -> "Guardia en pausa"
                    },
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = AuTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = when {
                        guardApproved != true -> "El administrador debe validar la matrícula antes de recibir consultas"
                        isOnDuty -> "Recibiendo consultas on-demand de farmacias"
                        else -> "Tocá activar para recibir consultas"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Button(
                onClick = onToggle,
                enabled = !isLoading && (guardApproved == true || isOnDuty),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isOnDuty) Color(0xFFE11D48) else PortalDoctors,
                    contentColor = Color.White,
                ),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text(
                    text = when {
                        isOnDuty -> "Pausar"
                        guardApproved != true -> "Pendiente"
                        else -> "Activar"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun IncomingDispatchOfferCard(
    request: PharmacyDispatchRequest,
    isClaiming: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // Countdown uses server-issued offer expiration rather than 30 fictional
    // seconds starting when Compose renders the card.
    val expiresAt = remember(request.offerId, request.offerExpiresAt) {
        runCatching {
            java.time.OffsetDateTime.parse(requireNotNull(request.offerExpiresAt)).toInstant()
        }.getOrNull()
    }
    var secondsLeft by remember(request.offerId, request.offerExpiresAt) { mutableIntStateOf(0) }

    LaunchedEffect(request.offerId, request.offerExpiresAt) {
        while (true) {
            secondsLeft = expiresAt?.let {
                java.time.Duration.between(java.time.Instant.now(), it).seconds
                    .coerceIn(0L, 30L).toInt()
            } ?: 0
            if (secondsLeft == 0) break
            delay(1000)
        }
    }
    val initialSeconds = 30

    val progress by animateFloatAsState(
        targetValue = secondsLeft.toFloat() / initialSeconds.toFloat(),
        animationSpec = tween(durationMillis = 1000, easing = LinearEasing),
        label = "dispatchCountdownProgress",
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = Color.White,
        border = BorderStroke(1.5.dp, AuCyan.copy(alpha = 0.35f)),
        shadowElevation = 6.dp,
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Header Row: Tier Badge + Countdown Timer Ring estilo Uber Driver
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = AuCyanSoft,
                    border = BorderStroke(1.dp, AuCyan.copy(alpha = 0.3f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(AuEmerald)
                        )
                        Text(
                            text = dispatchTierLabel(request.tierRequested).uppercase(),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp,
                            ),
                            color = AuCyanDeep,
                        )
                    }
                }

                // Verified server offer expiration / age in queue.
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(36.dp),
                    ) {
                        CircularProgressIndicator(
                            progress = { progress },
                            modifier = Modifier.fillMaxSize(),
                            color = if (secondsLeft <= 5) AuCrimson else AuCyan,
                            trackColor = AuBorder,
                            strokeWidth = 3.dp,
                            strokeCap = StrokeCap.Round,
                        )
                        Text(
                            text = "${secondsLeft}s",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                            color = if (secondsLeft <= 5) AuCrimson else AuTextPrimary,
                        )
                    }
                    Text(
                        text = relativeTime(request.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                }
            }

            // Datos del Paciente y Motivo de Consulta
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(46.dp),
                    shape = CircleShape,
                    color = AuCyanSoft,
                    border = BorderStroke(1.dp, AuCyan.copy(alpha = 0.25f)),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = (request.patientName ?: "P").take(1).uppercase(),
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = AuCyanDeep,
                        )
                    }
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = request.patientName?.takeIf { it.isNotBlank() } ?: stringResource(R.string.ui_ondemand_patient_fallback),
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    request.symptomSummary?.takeIf { it.isNotBlank() }?.let { summary ->
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = summary,
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextSecondary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            // SLA Tag
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = AuEmerald.copy(alpha = 0.08f),
                border = BorderStroke(0.5.dp, AuEmerald.copy(alpha = 0.25f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null,
                        tint = AuEmerald,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = stringResource(
                            R.string.ui_ondemand_offer_assigned,
                            when (request.careCountry) {
                                "BR" -> "Brasil"
                                "AR" -> "Argentina"
                                else -> stringResource(R.string.ui_country_unknown)
                            },
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF065F46),
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            // Botones Ergonómicos de Alto Contraste (Aceptar / Rechazar)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Rechazar / Pausar
                OutlinedButton(
                    onClick = onDecline,
                    enabled = !isClaiming && secondsLeft > 0,
                    modifier = Modifier
                        .weight(0.38f)
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, AuCrimson.copy(alpha = 0.4f)),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = AuCrimson,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = stringResource(R.string.ui_ondemand_decline),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }

                // Aceptar Consulta (Dominante Esmeralda)
                Button(
                    onClick = onAccept,
                    enabled = !isClaiming && secondsLeft > 0,
                    modifier = Modifier
                        .weight(0.62f)
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPharmacistsAction,
                        contentColor = Color.White,
                    ),
                ) {
                    if (isClaiming) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                    } else {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Videocam,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                text = stringResource(R.string.ui_ondemand_accept),
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleSmall,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DoctorOnDutyRadar(
    modifier: Modifier = Modifier,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "doctorOnDutyRadar")

    val wave1 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "dutyWave1",
    )

    val wave2 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2800, delayMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "dutyWave2",
    )

    val sweepAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(5000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "dutySweepAngle",
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuEmerald.copy(alpha = 0.25f)),
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Radar animado concéntrico estilo Uber Driver
            Box(
                modifier = Modifier.size(160.dp),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val center = Offset(size.width / 2f, size.height / 2f)
                    val maxRadius = size.minDimension / 2f
                    val innerRadius = 28.dp.toPx()

                    // Anillos concéntricos
                    listOf(innerRadius + 14.dp.toPx(), innerRadius + 32.dp.toPx(), maxRadius - 2.dp.toPx()).forEach { r ->
                        drawCircle(
                            color = AuEmerald.copy(alpha = 0.15f),
                            radius = r,
                            center = center,
                            style = Stroke(1.dp.toPx()),
                        )
                    }

                    // Ondas expansivas
                    listOf(wave1, wave2).forEach { w ->
                        val r = innerRadius + w * (maxRadius - innerRadius)
                        val a = (1f - w) * 0.35f
                        drawCircle(
                            color = AuEmerald.copy(alpha = a),
                            radius = r,
                            center = center,
                            style = Stroke(1.5.dp.toPx()),
                        )
                    }

                    // Barrido
                    rotate(degrees = sweepAngle, pivot = center) {
                        val sweep = Brush.sweepGradient(
                            0.0f to Color.Transparent,
                            0.75f to Color.Transparent,
                            1.0f to AuEmerald.copy(alpha = 0.25f),
                            center = center,
                        )
                        drawCircle(brush = sweep, radius = maxRadius - 2.dp.toPx(), center = center)
                    }
                }

                // Centro del radar
                Surface(
                    shape = CircleShape,
                    color = AuEmerald.copy(alpha = 0.15f),
                    border = BorderStroke(1.5.dp, AuEmerald),
                    modifier = Modifier.size(48.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Outlined.MedicalServices,
                            contentDescription = null,
                            tint = AuEmerald,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }
            }

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(AuEmerald)
                    )
                    Text(
                        text = stringResource(R.string.ui_ondemand_active_title),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuEmerald,
                        letterSpacing = 0.8.sp,
                    )
                }
                Text(
                    text = stringResource(R.string.ui_ondemand_active_subtitle),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.ui_ondemand_active_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun EmptyQueueCard(
    isOnDuty: Boolean,
    onActivate: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFFF8FAFC),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(if (isOnDuty) Color(0xFFECFDF5) else Color(0xFFF1F5F9)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Outlined.MedicalServices,
                    contentDescription = null,
                    tint = if (isOnDuty) AuSuccess else AuTextTertiary,
                    modifier = Modifier.size(24.dp),
                )
            }
            Text(
                text = if (isOnDuty) stringResource(R.string.ui_ondemand_empty_active) else stringResource(R.string.ui_ondemand_empty_paused),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = AuTextPrimary,
                textAlign = TextAlign.Center,
            )
            Text(
                text = if (isOnDuty) stringResource(R.string.ui_ondemand_empty_active_hint)
                else stringResource(R.string.ui_ondemand_empty_paused_hint),
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                textAlign = TextAlign.Center,
            )
            if (!isOnDuty && onActivate != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Button(
                    onClick = onActivate,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalDoctorsAction,
                        contentColor = Color.White,
                    ),
                    modifier = Modifier.height(44.dp),
                ) {
                    Text(
                        text = stringResource(R.string.ui_ondemand_activate),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
        }
    }
}

private fun relativeTime(iso: String): String {
    val instant = runCatching { java.time.OffsetDateTime.parse(iso) }.getOrNull() ?: return ""
    val seconds = java.time.Duration.between(instant, java.time.OffsetDateTime.now()).seconds
    return when {
        seconds < 60 -> "hace un momento"
        seconds < 3600 -> "hace ${(seconds / 60).toInt()} min"
        else -> "hace ${(seconds / 3600).toInt()} h"
    }
}