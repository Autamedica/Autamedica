package com.autamedica.android.presentation.dashboard.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.LocalPharmacy
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuCrimson
import com.autamedica.android.presentation.theme.AuCyan
import com.autamedica.android.presentation.theme.AuCyanDeep
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuNavy
import com.autamedica.android.presentation.theme.AuNavySurface
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.LogoObsidianBg
import com.autamedica.android.presentation.theme.LogoRingBorder

/**
 * Master On-Duty Control Card for Doctors (Uber Driver Cockpit).
 * Features:
 * - Cyan/Emerald live pulse micro-animation when online
 * - Immediate tactile haptic feedback on switch toggle
 * - Presence telemetry pill: "Conectado a guardia médica • Heartbeat activo cada 30s"
 * - High-contrast Obsidian Slate theme with Zero-Yellow Gate compliance
 */
@Composable
fun DoctorPharmacyOnDutyCard(
    state: DoctorOnDutyPharmacyState,
    onToggleDuty: (Boolean) -> Unit,
    onClaimRequest: (String) -> Unit,
    modifier: Modifier = Modifier,
    claimingRequestId: String? = null,
) {
    val hapticFeedback = LocalHapticFeedback.current

    // Micro-animación de pulso brillante (glow cyan) cuando la guardia está activa
    val infiniteTransition = rememberInfiniteTransition(label = "dutyHeroPulse")
    val pulseGlowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1100, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dutyGlowAlpha",
    )

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = if (state.isOnDuty) 6.dp else 1.dp,
                shape = RoundedCornerShape(24.dp),
                spotColor = if (state.isOnDuty) AuCyan.copy(alpha = 0.25f) else Color.Transparent,
            ),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = BorderStroke(
            width = if (state.isOnDuty) 1.5.dp else 1.dp,
            color = if (state.isOnDuty) AuCyan.copy(alpha = 0.5f + (pulseGlowAlpha * 0.3f)) else AuBorder
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            // Header: Bioceramic Jewel + Títulos + Switch con Háptica
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    // Bioceramic Logo Container (AutaMedica Official Jewel)
                    Surface(
                        modifier = Modifier.size(48.dp),
                        shape = RoundedCornerShape(14.dp),
                        color = LogoObsidianBg,
                        border = BorderStroke(
                            width = 1.dp,
                            color = if (state.isOnDuty) AuCyan.copy(alpha = 0.8f) else LogoRingBorder
                        ),
                        shadowElevation = if (state.isOnDuty) 6.dp else 1.dp
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Image(
                                painter = painterResource(id = R.drawable.logo_autamedica),
                                contentDescription = "AutaMedica",
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(8.dp)),
                                contentScale = ContentScale.Fit
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "AutaMedica",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Black,
                                    color = AuCyanDeep,
                                    letterSpacing = 0.6.sp
                                )
                            )
                            Text(
                                text = " • " + stringResource(R.string.pharmacy_on_demand_network_badge),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    color = AuTextTertiary,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = stringResource(R.string.pharmacy_on_demand_title),
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 17.sp,
                                    letterSpacing = (-0.3).sp,
                                    color = AuTextPrimary
                                )
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            // Status Dot con pulso vivo
                            Box(
                                modifier = Modifier
                                    .size(9.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (state.isOnDuty) AuEmerald.copy(alpha = pulseGlowAlpha)
                                        else Color(0xFF94A3B8)
                                    )
                            )
                        }

                        Text(
                            text = if (state.isOnDuty) {
                                stringResource(R.string.pharmacy_on_demand_status_active)
                            } else {
                                stringResource(R.string.pharmacy_on_demand_status_inactive)
                            },
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = if (state.isOnDuty) AuEmerald else AuTextSecondary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        )
                    }
                }

                // Switch maestro con háptica inmediata
                Switch(
                    checked = state.isOnDuty,
                    onCheckedChange = { isChecked ->
                        hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                        onToggleDuty(isChecked)
                    },
                    enabled = !state.isLoading,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = AuEmerald,
                        uncheckedThumbColor = Color.White,
                        uncheckedTrackColor = Color(0xFFCBD5E1),
                        checkedBorderColor = Color.Transparent,
                        uncheckedBorderColor = Color.Transparent,
                    )
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Pill de Telemetría de Presencia (Heartbeat cada 30s)
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (state.isOnDuty) AuCyan.copy(alpha = 0.08f) else Color(0xFFF8FAFC),
                border = BorderStroke(
                    1.dp,
                    if (state.isOnDuty) AuCyan.copy(alpha = 0.35f) else Color(0xFFE2E8F0)
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Sensors,
                        contentDescription = null,
                        tint = if (state.isOnDuty) AuCyanDeep else AuTextTertiary,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (state.isOnDuty) {
                            "Conectado a guardia médica • Heartbeat activo cada 30s"
                        } else {
                            "Guardia en pausa • Conéctate para recibir consultas de farmacia"
                        },
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = if (state.isOnDuty) FontWeight.Bold else FontWeight.Medium,
                            color = if (state.isOnDuty) AuCyanDeep else AuTextSecondary,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            // On-Duty Active Panel (Cola y Solicitudes)
            AnimatedVisibility(
                visible = state.isOnDuty,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    // Queue count banner
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (state.waitingQueueCount > 0) AuCyan.copy(alpha = 0.10f)
                                else Color(0xFFF1F5F9)
                            )
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.FlashOn,
                                contentDescription = null,
                                tint = if (state.waitingQueueCount > 0) AuCyanDeep else AuTextSecondary,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (state.waitingQueueCount > 0) {
                                    stringResource(R.string.pharmacy_on_demand_pending_badge, state.waitingQueueCount)
                                } else {
                                    stringResource(R.string.pharmacy_on_demand_no_pending)
                                },
                                style = MaterialTheme.typography.labelMedium.copy(
                                    fontWeight = if (state.waitingQueueCount > 0) FontWeight.ExtraBold else FontWeight.Normal,
                                    color = if (state.waitingQueueCount > 0) AuCyanDeep else AuTextSecondary
                                )
                            )
                        }
                    }

                    // Pending requests list
                    if (state.pendingRequests.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            state.pendingRequests.forEach { request ->
                                PharmacyRequestItem(
                                    request = request,
                                    isClaiming = claimingRequestId == request.id,
                                    onClaim = {
                                        hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                        onClaimRequest(request.id)
                                    }
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Regulatory & Clinical Trust Seal
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFFF8FAFC))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Outlined.VerifiedUser,
                    contentDescription = null,
                    tint = AuTextTertiary,
                    modifier = Modifier.size(13.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = stringResource(R.string.pharmacy_on_demand_compliance_footer),
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = AuTextTertiary,
                        fontSize = 10.5.sp
                    )
                )
            }
        }
    }
}

@Composable
private fun PharmacyRequestItem(
    request: PharmacyConsultationRequest,
    isClaiming: Boolean,
    onClaim: () -> Unit,
) {
    val hapticFeedback = LocalHapticFeedback.current

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFFF8FAFC),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = request.patientName,
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "${stringResource(R.string.pharmacy_on_demand_dni_label)} ${request.patientDni} • ${request.pharmacyName}",
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = AuTextSecondary,
                            fontSize = 11.sp
                        )
                    )
                }

                if (request.minutesWaiting > 0) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = if (request.minutesWaiting > 5) AuCrimson.copy(alpha = 0.12f) else Color(0xFFE2E8F0),
                    ) {
                        Text(
                            text = "${request.minutesWaiting} min",
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = if (request.minutesWaiting > 5) AuCrimson else AuTextSecondary,
                                fontWeight = FontWeight.Bold
                            ),
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "${stringResource(R.string.pharmacy_on_demand_reason_label)} ${request.reason}",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = AuTextSecondary,
                    fontSize = 12.sp
                ),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(10.dp))

            Button(
                onClick = {
                    hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                    onClaim()
                },
                enabled = !isClaiming,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AuEmerald,
                    contentColor = Color.White
                )
            ) {
                if (isClaiming) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.pharmacy_on_demand_claiming),
                        style = MaterialTheme.typography.labelMedium
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.pharmacy_on_demand_claim_btn),
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.ExtraBold)
                    )
                }
            }
        }
    }
}
