package com.autamedica.android.presentation.dashboard.components

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
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.autamedica.android.domain.model.formatDoctorCredentialLabel
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.PortalDoctorsAction
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuCyan
import com.autamedica.android.presentation.theme.AuCyanSoft
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuNavy
import com.autamedica.android.presentation.theme.AuNavySurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors

/**
 * Cockpit Header para el Médico (Benchmarks: Uber Driver + Nubank + Epic Haiku).
 * 
 * Incluye:
 * - Avatar médico con anillo de guardia dinámico (Status Ring con glow esmeralda/cyan cuando está activo).
 * - Matrícula médica verificada con badge biocerámico.
 * - Switch maestro ergonómico de gran escala tipo "CONECTARSE A GUARDIA" / "DESCONECTARSE"
 *   diseñado para interacción con el pulgar (thumb-friendly) y micro-vibración háptica.
 * - Pill de telemetría de presencia continua (heartbeat cada 30s).
 */
@Composable
fun DoctorCockpitHeader(
    doctorName: String,
    specialty: String?,
    licenseNumber: String?,
    licenseType: String?,
    countryCode: String?,
    ufBrazil: String?,
    avatarUrl: String?,
    isOnDuty: Boolean,
    isLoading: Boolean,
    guardApproved: Boolean? = null,
    onToggleOnDuty: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    onOpenProfile: (() -> Unit)? = null,
) {
    val hapticFeedback = LocalHapticFeedback.current
    val credentialLabel = formatDoctorCredentialLabel(
        licenseNumber = licenseNumber,
        licenseType = licenseType,
        countryCode = countryCode,
        ufBrazil = ufBrazil,
    )

    // Micro-animación de respiración / glow cuando la guardia está activa
    val infiniteTransition = rememberInfiniteTransition(label = "doctorStatusRingPulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.40f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "statusRingPulseAlpha",
    )

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Fila 1: Avatar con Anillo Dinámico + Info Profesional
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f),
            ) {
                // Status Ring Container
                Box(
                    modifier = Modifier
                        .size(62.dp)
                        .then(
                            if (onOpenProfile != null) Modifier.clickable(onClick = onOpenProfile)
                            else Modifier
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    // Glow exterior cuando está en guardia
                    if (isOnDuty) {
                        Box(
                            modifier = Modifier
                                .size(62.dp)
                                .clip(CircleShape)
                                .background(
                                    Brush.sweepGradient(
                                        listOf(
                                            AuEmerald.copy(alpha = pulseAlpha * 0.7f),
                                            AuCyan.copy(alpha = pulseAlpha * 0.9f),
                                            AuEmerald.copy(alpha = pulseAlpha * 0.7f),
                                        )
                                    )
                                )
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(60.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFE2E8F0))
                        )
                    }

                    // Contenedor interno del avatar con borde protector
                    Box(
                        modifier = Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(Color.White)
                            .padding(2.dp)
                            .clip(CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (!avatarUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = avatarUrl,
                                contentDescription = doctorName,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clip(CircleShape),
                                contentScale = ContentScale.Crop,
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(
                                        Brush.linearGradient(
                                            listOf(Color(0xFFEBF1FF), Color(0xFFF0FDF4))
                                        )
                                    ),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = extractDoctorInitials(doctorName),
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = if (isOnDuty) AuEmerald else PortalDoctors,
                                )
                            }
                        }
                    }

                    // Dot indicador de estado vivo (esquina inferior derecha)
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .align(Alignment.BottomEnd)
                            .clip(CircleShape)
                            .background(if (isOnDuty) AuEmerald else Color(0xFF94A3B8))
                            .border(2.dp, Color.White, CircleShape)
                    )
                }

                Spacer(modifier = Modifier.width(14.dp))

                // Nombre del profesional y especialidad
                Column(modifier = Modifier.weight(1f)) {
                    val displayName = if (doctorName.isNotBlank()) {
                        if (doctorName.startsWith("Dr.", ignoreCase = true) || doctorName.startsWith("Dra.", ignoreCase = true)) {
                            doctorName
                        } else {
                            "Dr. $doctorName"
                        }
                    } else {
                        "Médico Especialista"
                    }

                    Text(
                        text = displayName,
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontSize = 19.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = (-0.4).sp,
                        ),
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )

                    Spacer(modifier = Modifier.height(2.dp))

                    val specText = specialty?.takeIf { it.isNotBlank() } ?: "Medicina General & Telemedicina"
                    Text(
                        text = specText,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                        color = AuTextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Pill Biocerámico de Matrícula Verificada
            if (credentialLabel != null && guardApproved == true) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFEBF1FF),
                    border = BorderStroke(0.5.dp, PortalDoctors.copy(alpha = 0.25f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                            tint = PortalDoctors,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = credentialLabel,
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = PortalDoctorsAction,
                        )
                    }
                }
            }
        }

        // Fila 2: SWITCH MAESTRO ERGONÓMICO (Cockpit Uber Driver - Thumb Friendly)
        val cardBgColor by animateColorAsState(
            targetValue = if (isOnDuty) Color(0xFF0F172A) else Color.White,
            animationSpec = tween(350),
            label = "dutyCardBg"
        )
        val cardBorderColor by animateColorAsState(
            targetValue = if (isOnDuty) AuCyan.copy(alpha = 0.6f + (pulseAlpha * 0.4f)) else AuBorder,
            animationSpec = tween(350),
            label = "dutyCardBorder"
        )

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(
                    elevation = if (isOnDuty) 6.dp else 2.dp,
                    shape = RoundedCornerShape(24.dp),
                    ambientColor = if (isOnDuty) AuCyan.copy(alpha = 0.10f) else Color(0x0A000000),
                    spotColor = if (isOnDuty) AuEmerald.copy(alpha = 0.25f) else Color(0x15000000),
                )
                .clickable(
                    enabled = !isLoading && (guardApproved == true || isOnDuty),
                    onClick = {
                        hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                        onToggleOnDuty(!isOnDuty)
                    }
                ),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = cardBgColor),
            border = BorderStroke(1.dp, cardBorderColor),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
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
                        // Icono prominente con efecto pulsante
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(
                                    if (isOnDuty) AuEmerald.copy(alpha = 0.15f)
                                    else Color(0xFFF1F5F9)
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.PowerSettingsNew,
                                contentDescription = null,
                                tint = if (isOnDuty) AuEmerald else Color(0xFF64748B),
                                modifier = Modifier.size(24.dp),
                            )
                        }

                        Spacer(modifier = Modifier.width(14.dp))

                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = when {
                                        guardApproved != true -> "GUARDIA PENDIENTE DE VALIDACIÓN"
                                        isOnDuty -> "CONECTADO A GUARDIA"
                                        else -> "GUARDIA DESCONECTADA"
                                    },
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        letterSpacing = 0.5.sp,
                                    ),
                                    color = if (isOnDuty) Color.White else Color(0xFF0F172A),
                                )
                                if (isOnDuty) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(AuEmerald.copy(alpha = pulseAlpha))
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(2.dp))

                            Text(
                                text = when {
                                    guardApproved != true -> "Esperando aprobación del administrador"
                                    isOnDuty -> "Recibiendo derivaciones de farmacia en tiempo real"
                                    else -> "Toca para activar disponibilidad y recibir consultas"
                                },
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                                color = if (isOnDuty) AuCyan else Color(0xFF64748B),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(28.dp),
                            strokeWidth = 2.5.dp,
                            color = if (isOnDuty) AuCyan else PortalDoctors,
                        )
                    } else {
                        // Switch táctil de escala Uber Driver (1.25f para comodidad de pulgar)
                        Switch(
                            checked = isOnDuty,
                            enabled = guardApproved == true || isOnDuty,
                            onCheckedChange = { isChecked ->
                                hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                onToggleOnDuty(isChecked)
                            },
                            modifier = Modifier.scale(1.25f),
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = AuEmerald,
                                uncheckedThumbColor = Color.White,
                                uncheckedTrackColor = Color(0xFFCBD5E1),
                                checkedBorderColor = Color.Transparent,
                                uncheckedBorderColor = Color.Transparent,
                            ),
                        )
                    }
                }

                // Fila 3: Pill de Telemetría de Presencia en tiempo real
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (isOnDuty) Color(0xFF1E293B) else Color(0xFFF8FAFC),
                    border = BorderStroke(
                        0.5.dp,
                        if (isOnDuty) AuCyan.copy(alpha = 0.35f) else Color(0xFFE2E8F0)
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Sensors,
                            contentDescription = null,
                            tint = if (isOnDuty) AuCyan else Color(0xFF64748B),
                            modifier = Modifier.size(14.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isOnDuty) stringResource(R.string.ui_doctor_duty_connected)
                            else stringResource(R.string.ui_doctor_duty_disconnected),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = if (isOnDuty) FontWeight.SemiBold else FontWeight.Normal,
                            ),
                            color = if (isOnDuty) Color(0xFFE2E8F0) else Color(0xFF64748B),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

private fun extractDoctorInitials(name: String): String {
    val clean = name.replace("Dr.", "", ignoreCase = true)
        .replace("Dra.", "", ignoreCase = true)
        .trim()
    val parts = clean.split(Regex("\\s+")).filter { it.isNotBlank() }
    if (parts.isEmpty()) return "MD"
    val f = parts.first().firstOrNull()?.uppercase() ?: ""
    val l = parts.getOrNull(1)?.firstOrNull()?.uppercase() ?: ""
    return (f + l).ifBlank { "MD" }
}
