package com.autamedica.android.presentation.dashboard.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.dashboard.QueuedPatient
import com.autamedica.android.presentation.dashboard.TriageLevel
import com.autamedica.android.presentation.dashboard.cleanPatientName
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuCrimson
import com.autamedica.android.presentation.theme.AuCyan
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuNavy
import com.autamedica.android.presentation.theme.PortalDoctors

/**
 * Live Patient Radar & Waiting Drawer para el Cockpit Médico (Uber Driver + Epic Haiku).
 * 
 * Características:
 * - Animación de Radar Clínico con barrido de frecuencia continua y ondas concéntricas.
 * - Triaje Estricto Zero-Yellow Gate:
 *     * Carmesí (Urgencia)
 *     * Cyan Quirúrgico (Prioritario)
 *     * Esmeralda (En Atención)
 *     * Deep Blue (Control Programado)
 * - Drawer colapsable/expandible con física elástica `spring(dampingRatio = Spring.DampingRatioMediumBouncy)`.
 * - Tarjetas estructuradas con acceso de 1 toque a la Ficha Clínica de Pre-Consulta (20s).
 */
@Composable
fun LivePatientRadarDrawer(
    isOnDuty: Boolean,
    liveWaitingQueue: List<QueuedPatient>,
    activelyDispatchedPatientId: String?,
    onViewPatientChart: (QueuedPatient) -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToRadarDetail: (() -> Unit)? = null,
) {
    val hapticFeedback = LocalHapticFeedback.current
    var isExpanded by remember { mutableStateOf(true) }

    // Pulso constante del radar
    val infiniteTransition = rememberInfiniteTransition(label = "radarLivePulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1300, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "radarPulseAlpha",
    )
    val radarSweepAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "radarSweepAngle",
    )

    AnimatedVisibility(
        visible = isOnDuty,
        enter = fadeIn(tween(350)) + slideInVertically(tween(350)) { -it / 3 },
        exit = fadeOut(tween(250)) + slideOutVertically(tween(250)) { -it / 3 },
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Cabecera interactiva del Radar Drawer
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        isExpanded = !isExpanded
                    },
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    // Mini icono de Radar Animado
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF0F172A)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Canvas(modifier = Modifier.size(16.dp)) {
                            val center = Offset(size.width / 2f, size.height / 2f)
                            drawCircle(
                                color = AuCyan.copy(alpha = 0.35f),
                                radius = size.width / 2f,
                                style = Stroke(width = 1.dp.toPx())
                            )
                            rotate(radarSweepAngle, pivot = center) {
                                drawLine(
                                    brush = Brush.radialGradient(
                                        listOf(AuCyan, Color.Transparent),
                                        center = center,
                                        radius = size.width / 2f
                                    ),
                                    start = center,
                                    end = Offset(size.width, center.y),
                                    strokeWidth = 2.dp.toPx(),
                                    cap = StrokeCap.Round
                                )
                            }
                        }
                    }

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = stringResource(R.string.ui_medical_radar_title),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    letterSpacing = 1.sp,
                                ),
                                color = PortalDoctors,
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(AuEmerald.copy(alpha = pulseAlpha))
                            )
                        }
                        Text(
                            text = if (liveWaitingQueue.isEmpty()) stringResource(R.string.ui_medical_radar_scanning)
                            else stringResource(R.string.ui_medical_radar_patient_waiting, liveWaitingQueue.size),
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                            color = Color(0xFF64748B),
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (liveWaitingQueue.isNotEmpty()) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFECFDF5),
                            border = BorderStroke(0.5.dp, AuEmerald.copy(alpha = 0.3f)),
                        ) {
                            Text(
                                text = stringResource(R.string.ui_medical_radar_queue_count, liveWaitingQueue.size),
                                color = AuEmerald,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }
                    }

                    Icon(
                        imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = stringResource(R.string.ui_medical_radar_toggle),
                        tint = Color(0xFF64748B),
                        modifier = Modifier.size(22.dp),
                    )
                }
            }

            // Contenido expandible del Drawer
            AnimatedVisibility(
                visible = isExpanded,
                enter = fadeIn(spring(dampingRatio = Spring.DampingRatioMediumBouncy)) + slideInVertically(),
                exit = fadeOut(tween(200)),
            ) {
                if (liveWaitingQueue.isEmpty()) {
                    // Estado vacío: Escuchando radar
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .shadow(
                                elevation = 2.dp,
                                shape = RoundedCornerShape(22.dp),
                                ambientColor = Color(0x06000000),
                                spotColor = Color(0x10000000),
                            ),
                        shape = RoundedCornerShape(22.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(18.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(46.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFFECFEFF)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Sensors,
                                    contentDescription = null,
                                    tint = AuCyan,
                                    modifier = Modifier.size(24.dp),
                                )
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = stringResource(R.string.ui_medical_radar_empty_title),
                                    style = MaterialTheme.typography.titleSmall.copy(
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold,
                                    ),
                                    color = Color(0xFF0F172A),
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = stringResource(R.string.ui_medical_radar_empty_body),
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        fontSize = 12.sp,
                                        lineHeight = 16.sp,
                                    ),
                                    color = Color(0xFF64748B),
                                )
                            }
                        }
                    }
                } else {
                    // Carrusel de pacientes en espera
                    val pagerState = rememberPagerState(pageCount = { liveWaitingQueue.size })

                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        HorizontalPager(
                            state = pagerState,
                            modifier = Modifier.fillMaxWidth(),
                            pageSpacing = 12.dp,
                            key = { index -> liveWaitingQueue.getOrNull(index)?.id ?: index },
                        ) { pageIndex ->
                            val patient = liveWaitingQueue[pageIndex]
                            RadarPatientCard(
                                patient = patient,
                                isActivelyOffered = patient.id == activelyDispatchedPatientId,
                                onViewChart = { onViewPatientChart(patient) },
                            )
                        }

                        // Indicador de páginas con animación elástica
                        if (liveWaitingQueue.size > 1) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 4.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                repeat(liveWaitingQueue.size) { index ->
                                    val isSelected = pagerState.currentPage == index
                                    val dotWidth by animateDpAsState(
                                        targetValue = if (isSelected) 22.dp else 6.dp,
                                        animationSpec = spring(
                                            dampingRatio = Spring.DampingRatioMediumBouncy,
                                            stiffness = Spring.StiffnessLow
                                        ),
                                        label = "dotWidth"
                                    )
                                    val dotColor by animateColorAsState(
                                        targetValue = if (isSelected) PortalDoctors else Color(0xFFCBD5E1),
                                        animationSpec = tween(250),
                                        label = "dotColor"
                                    )
                                    Box(
                                        modifier = Modifier
                                            .padding(horizontal = 3.dp)
                                            .height(5.dp)
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
    }
}

@Composable
private fun RadarPatientCard(
    patient: QueuedPatient,
    isActivelyOffered: Boolean,
    onViewChart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hapticFeedback = LocalHapticFeedback.current
    val isUrgent = patient.triage == TriageLevel.URGENCY

    // Color clínico del triaje Zero-Yellow
    val (triageBadgeColor, triageBadgeBg, triageBorderColor) = when (patient.triage) {
        TriageLevel.URGENCY -> Triple(AuCrimson, Color(0xFFFEF2F2), AuCrimson)
        TriageLevel.PRIORITY -> Triple(AuCyan, Color(0xFFECFEFF), AuCyan)
        TriageLevel.CONTROL -> Triple(PortalDoctors, Color(0xFFEBF1FF), PortalDoctors)
        TriageLevel.STABLE -> Triple(AuEmerald, Color(0xFFECFDF5), AuEmerald)
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = if (isActivelyOffered || isUrgent) 4.dp else 2.dp,
                shape = RoundedCornerShape(22.dp),
                ambientColor = if (isUrgent) AuCrimson.copy(alpha = 0.08f) else Color(0x0A000000),
                spotColor = if (isUrgent) AuCrimson.copy(alpha = 0.18f) else Color(0x15000000),
            ),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(
            1.dp,
            if (isActivelyOffered) PortalDoctors else if (isUrgent) AuCrimson.copy(alpha = 0.5f) else Color(0xFFE2E8F0)
        ),
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            // Tira lateral con el color del triaje
            Box(
                modifier = Modifier
                    .width(6.dp)
                    .height(175.dp)
                    .background(triageBorderColor)
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // Fila 1: Nombre del paciente + Badge de Triaje
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val cleanName = cleanPatientName(patient.name)
                    val patientDisplayName = if (patient.age > 0) "$cleanName, ${patient.age}a" else cleanName
                    Text(
                        text = patientDisplayName,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            letterSpacing = (-0.3).sp,
                        ),
                        color = Color(0xFF0F172A),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = triageBadgeBg,
                        border = BorderStroke(0.5.dp, triageBorderColor.copy(alpha = 0.35f)),
                    ) {
                        Text(
                            text = patient.triageScale,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 0.5.sp,
                            color = triageBadgeColor,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        )
                    }
                }

                // Motivo clínico
                Text(
                    text = patient.reason,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    color = Color(0xFF334155),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                // Signos vitales resumidos
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFF8FAFC),
                ) {
                    Text(
                        text = patient.vitals,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        maxLines = 1,
                    )
                }

                // Fila inferior: Tiempo de espera + Botón VER FICHA CLÍNICA (20s)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Timer,
                            contentDescription = null,
                            tint = Color(0xFF64748B),
                            modifier = Modifier.size(13.dp),
                        )
                        Text(
                            text = stringResource(R.string.ui_medical_radar_wait_minutes, patient.waitMinutes),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B),
                        )
                    }

                    OutlinedButton(
                        onClick = {
                            hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            onViewChart()
                        },
                        modifier = Modifier.height(34.dp),
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.5f)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Description,
                            contentDescription = null,
                            tint = PortalDoctors,
                            modifier = Modifier.size(13.dp),
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.ui_medical_radar_open_chart),
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 10.sp,
                            color = PortalDoctors,
                        )
                    }
                }
            }
        }
    }
}
