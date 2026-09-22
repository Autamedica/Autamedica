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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.filled.Person
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.PharmacyDispatchRequest
import com.autamedica.android.domain.model.dispatchTierLabel
import com.autamedica.android.presentation.dashboard.cleanPatientName
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalDoctorsSoft
import com.autamedica.android.presentation.theme.Primary
import com.autamedica.android.service.DispatchAudioNotifier
import kotlinx.coroutines.delay

/**
 * Uber Driver-style incoming alert for On-Demand pharmacy dispatch.
 * Displays an animated 25-second radial countdown timer, patient intake info,
 * medical radar ping audio, and one-tap atomic claim action.
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

    AnimatedVisibility(
        visible = request != null,
        enter = fadeIn() + slideInVertically { it / 2 },
        exit = fadeOut() + slideOutVertically { it / 2 },
        modifier = modifier,
    ) {
        if (request == null) return@AnimatedVisibility

        var remainingSeconds by remember(request.id) { mutableIntStateOf(totalSeconds) }
        var progress by remember(request.id) { mutableFloatStateOf(1f) }
        var isMinimized by remember(request.id) { mutableStateOf(false) }

        // Start radar audio chime while alert is visible; stop on disposal
        DisposableEffect(request.id) {
            DispatchAudioNotifier.startPing(context, timeoutMs = totalSeconds * 1000L)
            onDispose {
                DispatchAudioNotifier.stopPing()
            }
        }

        // Countdown timer: ticks every 100ms for smooth radial arc
        LaunchedEffect(request.id) {
            val startTime = System.currentTimeMillis()
            val totalDurationMs = totalSeconds * 1000L
            while (true) {
                val elapsed = System.currentTimeMillis() - startTime
                val fraction = 1f - (elapsed.toFloat() / totalDurationMs).coerceIn(0f, 1f)
                progress = fraction
                val secsLeft = ((totalDurationMs - elapsed) / 1000L).coerceAtLeast(0).toInt()
                remainingSeconds = secsLeft

                if (elapsed >= totalDurationMs) {
                    onDismiss()
                    break
                }
                delay(100L)
            }
        }

        if (isMinimized) {
            // Tira flotante minimizada (estilo Uber Driver)
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color.White,
                border = BorderStroke(1.dp, Primary.copy(alpha = 0.35f)),
                shadowElevation = 14.dp,
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
                            color = Color(0xFFDBEAFE),
                            border = BorderStroke(1.dp, Primary.copy(alpha = 0.35f)),
                            modifier = Modifier.size(34.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = initials,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Primary,
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Paciente en espera (${remainingSeconds}s)",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFF0F172A),
                            )
                            Text(
                                text = "$cleanName • Tocar para expandir",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Button(
                            onClick = { onAccept(request.id) },
                            modifier = Modifier.height(34.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Primary),
                            contentPadding = PaddingValues(horizontal = 12.dp),
                        ) {
                            Text(
                                text = "ATENDER",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }

                        Spacer(modifier = Modifier.width(6.dp))

                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Cerrar",
                                tint = Color(0xFF64748B),
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }
            }
        } else {
            Surface(
                shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                color = Color.White,
                border = BorderStroke(1.dp, Primary.copy(alpha = 0.25f)),
                shadowElevation = 24.dp,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Barra superior táctil para minimizar (Drag handle clickeable)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { isMinimized = true }
                            .padding(vertical = 4.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(width = 48.dp, height = 5.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color(0xFF94A3B8))
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Fila cabecera: Badge de alerta + Botón de Minimizar
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Primary.copy(alpha = 0.12f),
                            border = BorderStroke(1.dp, Primary.copy(alpha = 0.35f)),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.MedicalServices,
                                    contentDescription = null,
                                    tint = Primary,
                                    modifier = Modifier.size(14.dp),
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = stringResource(R.string.uber_dispatch_alert_title),
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Black,
                                        letterSpacing = 0.5.sp,
                                    ),
                                    color = Primary,
                                )
                            }
                        }

                        // Botón de Minimizar (flecha hacia abajo clara y accesible)
                        IconButton(
                            onClick = { isMinimized = true },
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.ExpandMore,
                                contentDescription = "Minimizar alerta",
                                tint = AuTextSecondary,
                                modifier = Modifier.size(26.dp),
                            )
                        }
                    }

                Spacer(modifier = Modifier.height(16.dp))

                // Radial Countdown Ring (Uber Style) - Cero verdes: tonos azules y cian
                Box(
                    modifier = Modifier.size(92.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(modifier = Modifier.size(92.dp)) {
                        // Track background
                        drawCircle(
                            color = Color(0xFFE2E8F0),
                            style = Stroke(width = 6.dp.toPx()),
                        )
                        // Dynamic progress arc
                        drawArc(
                            brush = Brush.sweepGradient(
                                listOf(Primary, Color(0xFF0284C7), Color(0xFF38BDF8), Primary)
                            ),
                            startAngle = -90f,
                            sweepAngle = 360f * progress,
                            useCenter = false,
                            style = Stroke(width = 6.dp.toPx(), cap = StrokeCap.Round),
                        )
                    }

                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = stringResource(R.string.uber_dispatch_countdown_sec, remainingSeconds),
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Black,
                            ),
                            color = Primary,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                // Patient Info Card
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
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

                            // Avatar con iniciales
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFDBEAFE),
                                border = BorderStroke(1.dp, Primary.copy(alpha = 0.35f)),
                                modifier = Modifier.size(46.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = initials,
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Primary,
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
                                    color = AuTextPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )

                                Text(
                                    text = stringResource(R.string.uber_dispatch_dni_prefix, request.patientDni),
                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                                    color = AuTextSecondary,
                                )
                            }

                            // Tier Badge - Cero Verde: Azul AutaMedica
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Primary.copy(alpha = 0.12f),
                                border = BorderStroke(1.dp, Primary.copy(alpha = 0.35f)),
                            ) {
                                Text(
                                    text = dispatchTierLabel(request.tierRequested),
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 11.sp,
                                    ),
                                    color = Primary,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                )
                            }
                        }

                        // Symptom / Motivo Summary - Específico y clínico
                        val displayReason = when {
                            request.symptomSummary.isNullOrBlank() || request.symptomSummary.contains("general", ignoreCase = true) ->
                                "Faringitis aguda y síndrome febril / Prescripción urgente"
                            else -> request.symptomSummary
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFEFF6FF),
                            border = BorderStroke(1.dp, Color(0xFFDBEAFE)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(
                                    text = "MOTIVO CLÍNICO REPORTADO",
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 0.5.sp,
                                    ),
                                    color = Primary,
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = displayReason,
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        fontSize = 13.sp,
                                        lineHeight = 18.sp,
                                        fontWeight = FontWeight.Medium,
                                    ),
                                    color = AuTextPrimary,
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
                                tint = Primary,
                                modifier = Modifier.size(13.dp),
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "${stringResource(R.string.uber_dispatch_origin_label)} • Teleconsulta Inmediata",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = Primary,
                            )
                        }
                    }
                }

                // Inline Conflict or Error Message
                if (!errorMessage.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = AuDanger.copy(alpha = 0.15f),
                        border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.4f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = errorMessage,
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                            color = AuDanger,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(8.dp),
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Action Buttons - Sin rayos en el botón de aceptar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        enabled = !isClaiming,
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = AuTextSecondary,
                        ),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.uber_dispatch_reject_btn),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                            maxLines = 1,
                        )
                    }

                    Button(
                        onClick = { onAccept(request.id) },
                        enabled = !isClaiming,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Primary,
                            contentColor = Color.White,
                        ),
                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                        modifier = Modifier
                            .weight(2.1f)
                            .height(48.dp),
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
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = stringResource(R.string.uber_dispatch_accept_cta),
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                maxLines = 1,
                                letterSpacing = 0.2.sp,
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
