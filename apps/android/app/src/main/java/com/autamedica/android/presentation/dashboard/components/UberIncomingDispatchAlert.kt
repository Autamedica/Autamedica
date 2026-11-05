package com.autamedica.android.presentation.dashboard.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.LocalPharmacy
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.PortalPharmacistsAction
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.model.dispatchTierLabel
import com.autamedica.android.presentation.dashboard.cleanPatientName
import com.autamedica.android.service.DispatchAudioNotifier
import kotlinx.coroutines.delay

// Colores de diseño clínico y benchmark Uber Driver nocturno
private val UberDarkNavy = Color(0xFF090E1A)
private val UberCardBg = Color(0xFF0F172A)
private val UberCardInner = Color(0xFF1E293B)
private val CyanSurgical = Color(0xFF06B6D4)
private val EmeraldAccept = Color(0xFF10B981)
private val CrimsonReject = Color(0xFFEF4444)

/**
 * Uber Driver-style incoming alert for On-Demand pharmacy dispatch.
 * Displays an animated 30-second radial countdown timer, patient intake info,
 * medical radar ping audio, haptic feedback, and one-tap atomic claim action.
 */
@Composable
fun UberIncomingDispatchAlert(
    request: PharmacyDispatchRequest?,
    isClaiming: Boolean,
    errorMessage: String?,
    onAccept: (requestId: String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    totalSeconds: Int = 30,
) {
    val context = LocalContext.current
    val hapticFeedback = LocalHapticFeedback.current

    AnimatedVisibility(
        visible = request != null,
        enter = fadeIn() + slideInVertically { it },
        exit = fadeOut() + slideOutVertically { it },
        modifier = modifier,
    ) {
        if (request == null) return@AnimatedVisibility

        // Expiry belongs to the backend offer; entering/recomposing the page
        // must never restart a fabricated 30-second countdown.
        val expiryMillis = remember(request.offerId, request.offerExpiresAt) {
            runCatching {
                java.time.OffsetDateTime.parse(requireNotNull(request.offerExpiresAt))
                    .toInstant().toEpochMilli()
            }.getOrNull()
        }
        val secondsInitially = ((expiryMillis ?: 0L) - System.currentTimeMillis())
            .coerceAtLeast(0L).div(1000L).toInt().coerceAtMost(totalSeconds)
        var remainingSeconds by remember(request.offerId, request.offerExpiresAt) {
            mutableIntStateOf(secondsInitially)
        }
        var progress by remember(request.offerId, request.offerExpiresAt) {
            mutableFloatStateOf(secondsInitially.toFloat() / totalSeconds.toFloat().coerceAtLeast(1f))
        }
        var isMinimized by remember(request.offerId, request.offerExpiresAt) { mutableStateOf(false) }

        // Start radar audio chime while alert is visible; stop on disposal
        DisposableEffect(request.offerId, request.offerExpiresAt) {
            if (secondsInitially > 0) {
                DispatchAudioNotifier.startPing(context, timeoutMs = secondsInitially * 1000L)
            }
            // Retroalimentación háptica inmediata al entrar la oferta
            hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
            onDispose {
                DispatchAudioNotifier.stopPing()
            }
        }

        // Countdown timer: ticks every 100ms for ultra-smooth radial arc
        LaunchedEffect(request.offerId, request.offerExpiresAt) {
            var lastHapticSecond = -1
            while (true) {
                val msLeft = ((expiryMillis ?: 0L) - System.currentTimeMillis()).coerceAtLeast(0L)
                val fraction = (msLeft.toFloat() / (totalSeconds * 1000f))
                    .coerceIn(0f, 1f)
                progress = fraction
                val secsLeft = (msLeft / 1000L).toInt()
                remainingSeconds = secsLeft
                if ((secsLeft == 10 || secsLeft == 5) && secsLeft != lastHapticSecond) {
                    hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    lastHapticSecond = secsLeft
                }
                // Expiration is a backend event, NOT a doctor rejection.
                if (msLeft <= 0L) break
                delay(100L)
            }
        }

        if (isMinimized) {
            // Tira flotante minimizada de alto contraste (Uber Driver Style)
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = UberDarkNavy,
                border = BorderStroke(1.dp, CyanSurgical.copy(alpha = 0.5f)),
                shadowElevation = 18.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clickable { isMinimized = false },
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    val cleanName = cleanPatientName(request.patientName).ifBlank { "Paciente en espera" }
                    val initials = getPatientInitials(request.patientName)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f),
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = CyanSurgical.copy(alpha = 0.2f),
                            border = BorderStroke(1.dp, CyanSurgical.copy(alpha = 0.5f)),
                            modifier = Modifier.size(36.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = initials,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = CyanSurgical,
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(EmeraldAccept)
                                )
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(
                                    text = stringResource(R.string.ui_uber_compact_title, remainingSeconds),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = CyanSurgical,
                                    letterSpacing = 0.5.sp,
                                )
                            }
                            Text(
                                text = stringResource(R.string.ui_uber_compact_expand, cleanName),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color.White,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Button(
                            onClick = {
                                hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                onAccept(request.id)
                            },
                            modifier = Modifier.height(36.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PortalPharmacistsAction),
                            contentPadding = PaddingValues(horizontal = 14.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.ui_uber_answer),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color.White,
                            )
                        }

                        Spacer(modifier = Modifier.width(6.dp))

                        IconButton(
                            onClick = {
                                hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                onDismiss()
                            },
                            modifier = Modifier.size(34.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = stringResource(R.string.ui_uber_close),
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }
        } else {
            // Tarjeta Completa Uber Driver Nocturna / Alta Fidelidad Clínica
            Surface(
                shape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp),
                color = UberDarkNavy,
                border = BorderStroke(1.dp, CyanSurgical.copy(alpha = 0.45f)),
                shadowElevation = 28.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(
                        elevation = 20.dp,
                        shape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp),
                        spotColor = CyanSurgical.copy(alpha = 0.25f),
                    ),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 18.dp, vertical = 14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Barra superior táctil para minimizar (Drag handle ergonómico)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { isMinimized = true }
                            .padding(vertical = 4.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(width = 44.dp, height = 4.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(Color(0xFF475569))
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Fila cabecera: Badge de telemetría de despacho + Botón de Minimizar
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = CyanSurgical.copy(alpha = 0.15f),
                            border = BorderStroke(1.dp, CyanSurgical.copy(alpha = 0.4f)),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.MedicalServices,
                                    contentDescription = null,
                                    tint = CyanSurgical,
                                    modifier = Modifier.size(14.dp),
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = stringResource(
                                        R.string.ui_uber_guard_title,
                                        when (request.careCountry) {
                                            "BR" -> "BR"
                                            "AR" -> "AR"
                                            else -> "?"
                                        },
                                    ),
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Black,
                                        letterSpacing = 0.6.sp,
                                    ),
                                    color = CyanSurgical,
                                )
                            }
                        }

                        IconButton(
                            onClick = { isMinimized = true },
                            modifier = Modifier.size(34.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.ExpandMore,
                                contentDescription = stringResource(R.string.ui_uber_minimize),
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(24.dp),
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Radial Countdown Ring (Uber Driver Style) con gradiente Cyan -> Esmeralda
                    Box(
                        modifier = Modifier.size(96.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Canvas(modifier = Modifier.size(96.dp)) {
                            // Track background
                            drawCircle(
                                color = Color(0xFF1E293B),
                                style = Stroke(width = 7.dp.toPx()),
                            )
                            // Dynamic progress arc
                            drawArc(
                                brush = Brush.sweepGradient(
                                    listOf(CyanSurgical, EmeraldAccept, Color(0xFF38BDF8), CyanSurgical)
                                ),
                                startAngle = -90f,
                                sweepAngle = 360f * progress,
                                useCenter = false,
                                style = Stroke(width = 7.dp.toPx(), cap = StrokeCap.Round),
                            )
                        }

                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "$remainingSeconds",
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontSize = 28.sp,
                                    fontWeight = FontWeight.Black,
                                    fontFeatureSettings = "tnum",
                                ),
                                color = Color.White,
                            )
                            Text(
                                text = stringResource(R.string.ui_uber_seconds_left),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 0.5.sp,
                                ),
                                color = CyanSurgical,
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Patient Info Card estilo Dark Glass Slate
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = UberCardBg,
                        border = BorderStroke(1.dp, Color(0xFF1E293B)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                val cleanName = cleanPatientName(request.patientName)
                                val initials = getPatientInitials(request.patientName)

                                // Avatar con iniciales en Cyan
                                Surface(
                                    shape = CircleShape,
                                    color = CyanSurgical.copy(alpha = 0.2f),
                                    border = BorderStroke(1.dp, CyanSurgical.copy(alpha = 0.5f)),
                                    modifier = Modifier.size(46.dp),
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = initials,
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.Black,
                                            color = CyanSurgical,
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.width(12.dp))

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = cleanName.ifBlank { null }
                                            ?: stringResource(R.string.uber_dispatch_patient_kiosk),
                                        style = MaterialTheme.typography.titleMedium.copy(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 16.sp,
                                        ),
                                        color = Color.White,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )

                                    Text(
                                        text = "${when (request.careCountry) { "BR" -> "CPF"; "AR" -> "DNI"; else -> stringResource(R.string.ui_document_generic) }} ${request.patientDni}",
                                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                                        color = Color(0xFF94A3B8),
                                    )
                                }

                                // Tier Badge - Cyan Quirúrgico
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = CyanSurgical.copy(alpha = 0.15f),
                                    border = BorderStroke(1.dp, CyanSurgical.copy(alpha = 0.35f)),
                                ) {
                                    Text(
                                        text = dispatchTierLabel(request.tierRequested),
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 11.sp,
                                        ),
                                        color = CyanSurgical,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            }

                            // Symptom / Motivo Summary - Alto contraste
                            // No synthetic symptoms: a doctor must only see
                            // the reason actually entered by this patient.
                            val displayReason = request.symptomSummary?.takeIf { it.isNotBlank() }
                                ?: stringResource(R.string.ui_uber_reason_unspecified)
                            Spacer(modifier = Modifier.height(10.dp))
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = UberCardInner,
                                border = BorderStroke(1.dp, Color(0xFF334155)),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text(
                                        text = stringResource(R.string.ui_uber_reported_reason),
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            letterSpacing = 0.5.sp,
                                        ),
                                        color = CyanSurgical,
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = displayReason,
                                        style = MaterialTheme.typography.bodySmall.copy(
                                            fontSize = 13.sp,
                                            lineHeight = 18.sp,
                                            fontWeight = FontWeight.Medium,
                                        ),
                                        color = Color.White,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            // Origin badge
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Outlined.LocalPharmacy,
                                    contentDescription = null,
                                    tint = EmeraldAccept,
                                    modifier = Modifier.size(14.dp),
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = stringResource(R.string.ui_uber_origin_immediate, stringResource(R.string.uber_dispatch_origin_label)),
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    ),
                                    color = EmeraldAccept,
                                )
                            }
                        }
                    }

                    // Inline Conflict or Error Message
                    if (!errorMessage.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = CrimsonReject.copy(alpha = 0.15f),
                            border = BorderStroke(1.dp, CrimsonReject.copy(alpha = 0.4f)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = errorMessage,
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                                color = CrimsonReject,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(8.dp),
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    // Action Buttons Ergonómicos para el Pulgar
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        OutlinedButton(
                            onClick = {
                                hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                onDismiss()
                            },
                            enabled = !isClaiming && remainingSeconds > 0,
                            shape = RoundedCornerShape(16.dp),
                            border = BorderStroke(1.dp, CrimsonReject.copy(alpha = 0.6f)),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = CrimsonReject,
                            ),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(52.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.uber_dispatch_reject_btn),
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                maxLines = 1,
                            )
                        }

                        Button(
                            onClick = {
                                hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                onAccept(request.id)
                            },
                            enabled = !isClaiming && remainingSeconds > 0,
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PortalPharmacistsAction,
                                contentColor = Color.White,
                            ),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                            modifier = Modifier
                                .weight(2.2f)
                                .height(52.dp)
                                .shadow(
                                    elevation = 8.dp,
                                    shape = RoundedCornerShape(16.dp),
                                    spotColor = EmeraldAccept.copy(alpha = 0.4f),
                                ),
                        ) {
                            if (isClaiming) {
                                CircularProgressIndicator(
                                    color = Color.White,
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(20.dp),
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Videocam,
                                    contentDescription = null,
                                    modifier = Modifier.size(20.dp),
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = stringResource(R.string.uber_dispatch_accept_cta),
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 13.sp,
                                    maxLines = 1,
                                    letterSpacing = 0.3.sp,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun getPatientInitials(name: String?): String {
    val clean = cleanPatientName(name)
    val parts = clean.trim().split("\\s+".toRegex()).filter { it.isNotBlank() }
    return when {
        parts.isEmpty() -> "PA"
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> "${parts[0].first().uppercase()}${parts[1].first().uppercase()}"
    }
}
