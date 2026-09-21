package com.autamedica.android.presentation.dashboard.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.LocalPharmacy
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
    totalSeconds: Int = 25,
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

        Surface(
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
            color = Color(0xFF090D16), // Dark obsidian broadcast surface
            border = BorderStroke(1.dp, AuAccent.copy(alpha = 0.35f)),
            shadowElevation = 24.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // Top drag/indicator pill
                Box(
                    modifier = Modifier
                        .size(width = 44.dp, height = 4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color.White.copy(alpha = 0.2f))
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Header Row: Emergency badge + Dismiss button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = AuAccent.copy(alpha = 0.15f),
                            border = BorderStroke(1.dp, AuAccent.copy(alpha = 0.4f)),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = Icons.Default.FlashOn,
                                    contentDescription = null,
                                    tint = AuAccent,
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
                                    color = AuAccent,
                                )
                            }
                        }
                    }

                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = stringResource(R.string.uber_dispatch_reject_btn),
                            tint = Color.White.copy(alpha = 0.6f),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Radial Countdown Ring (Uber Style)
                Box(
                    modifier = Modifier.size(92.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(modifier = Modifier.size(92.dp)) {
                        // Track background
                        drawCircle(
                            color = Color.White.copy(alpha = 0.08f),
                            style = Stroke(width = 6.dp.toPx()),
                        )
                        // Dynamic progress arc
                        drawArc(
                            brush = Brush.sweepGradient(
                                listOf(AuAccent, PortalDoctors, AuSuccess, AuAccent)
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
                            color = Color.White,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                // Patient Info Card
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFF131B2E),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f)),
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
                            // Avatar
                            Surface(
                                shape = CircleShape,
                                color = PortalDoctorsSoft,
                                border = BorderStroke(1.dp, AuAccent.copy(alpha = 0.5f)),
                                modifier = Modifier.size(44.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Default.Person,
                                        contentDescription = null,
                                        tint = AuAccent,
                                        modifier = Modifier.size(24.dp),
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = request.patientName?.ifBlank { null }
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
                                    text = stringResource(R.string.uber_dispatch_dni_prefix, request.patientDni),
                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                                    color = Color.White.copy(alpha = 0.65f),
                                )
                            }

                            // Tier Badge
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = AuSuccess.copy(alpha = 0.15f),
                                border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.4f)),
                            ) {
                                Text(
                                    text = dispatchTierLabel(request.tierRequested),
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 11.sp,
                                    ),
                                    color = AuSuccess,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                )
                            }
                        }

                        // Symptom / Motivo Summary
                        if (!request.symptomSummary.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color.White.copy(alpha = 0.04f),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    text = request.symptomSummary,
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        fontSize = 13.sp,
                                        lineHeight = 18.sp,
                                    ),
                                    color = Color.White.copy(alpha = 0.85f),
                                    modifier = Modifier.padding(10.dp),
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
                                tint = AuAccent,
                                modifier = Modifier.size(13.dp),
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = stringResource(R.string.uber_dispatch_origin_label),
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = AuAccent,
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

                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        enabled = !isClaiming,
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.2f)),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Color.White.copy(alpha = 0.7f),
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(52.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.uber_dispatch_reject_btn),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                        )
                    }

                    Button(
                        onClick = { onAccept(request.id) },
                        enabled = !isClaiming,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AuSuccess,
                            contentColor = Color.White,
                        ),
                        modifier = Modifier
                            .weight(2f)
                            .height(52.dp),
                    ) {
                        if (isClaiming) {
                            CircularProgressIndicator(
                                color = Color.White,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp),
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.FlashOn,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = stringResource(R.string.uber_dispatch_accept_cta),
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                letterSpacing = 0.5.sp,
                            )
                        }
                    }
                }
            }
        }
    }
}
