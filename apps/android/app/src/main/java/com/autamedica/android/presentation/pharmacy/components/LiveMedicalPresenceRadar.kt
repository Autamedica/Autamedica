package com.autamedica.android.presentation.pharmacy.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Sensors
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuHover
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.Primary
import com.autamedica.android.presentation.theme.SuccessContainer
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin

/**
 * Representa a un profesional médico activo en la red de guardia distribuida.
 */
data class OnDutyDoctorInfo(
    val id: String,
    val name: String,
    val shortName: String,
    val specialty: String,
    val initials: String,
    val statusText: String,
    val isAvailable: Boolean = true,
    val registration: String = "",
    val radarAngleDeg: Float = 0f,
    val radarDistanceFraction: Float = 0.7f,
)

/**
 * Médicos predeterminados en la red de guardia médica en vivo para farmacias de turno.
 */
val defaultOnDutyDoctors = listOf(
    OnDutyDoctorInfo(
        id = "doc-1",
        name = "Dra. Valeria Méndez",
        shortName = "Dra. Méndez",
        specialty = "Médica Clínica",
        initials = "VM",
        statusText = "En línea",
        isAvailable = true,
        registration = "MN 148.920",
        radarAngleDeg = -40f,
        radarDistanceFraction = 0.68f,
    ),
    OnDutyDoctorInfo(
        id = "doc-2",
        name = "Dr. Fernando Silva",
        shortName = "Dr. Silva",
        specialty = "Medicina General",
        initials = "FS",
        statusText = "En consulta",
        isAvailable = false,
        registration = "MN 132.405",
        radarAngleDeg = 150f,
        radarDistanceFraction = 0.72f,
    ),
    OnDutyDoctorInfo(
        id = "doc-3",
        name = "Dra. Camila Duarte",
        shortName = "Dra. Duarte",
        specialty = "Emergentóloga",
        initials = "CD",
        statusText = "En línea",
        isAvailable = true,
        registration = "MN 156.118",
        radarAngleDeg = 215f,
        radarDistanceFraction = 0.64f,
    ),
    OnDutyDoctorInfo(
        id = "doc-4",
        name = "Dr. Martín Álvarez",
        shortName = "Dr. Álvarez",
        specialty = "Cardiología Clínica",
        initials = "MA",
        statusText = "En guardia",
        isAvailable = true,
        registration = "MN 129.870",
        radarAngleDeg = 35f,
        radarDistanceFraction = 0.82f,
    ),
)

/**
 * Visualizador central de radar de presencia médica en vivo ('Efecto Uber').
 * Dibuja ondas concéntricas de telemetría en Azul AutaMedica, un barrido suave,
 * el logo central de AutaMedica con pulso de transmisión y los nodos orbitantes
 * de médicos en guardia con puntos verdes de presencia viva.
 */
@Composable
fun LiveMedicalPresenceRadar(
    doctors: List<OnDutyDoctorInfo> = defaultOnDutyDoctors,
    modifier: Modifier = Modifier,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "RadarTelemetryTransition")

    // Barrido rotativo de telemetría
    val sweepAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "radarSweepAngle",
    )

    // Onda concéntrica expansiva 1
    val wave1 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "radarWave1",
    )

    // Onda concéntrica expansiva 2 (desfasada)
    val wave2 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2600, delayMillis = 1300, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "radarWave2",
    )

    // Pulso del logo central
    val logoPulseScale by infiniteTransition.animateFloat(
        initialValue = 0.96f,
        targetValue = 1.04f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "logoPulseScale",
    )

    // Pulso del halo verde de médicos en línea
    val greenDotPulse by infiniteTransition.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.35f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "greenDotPulse",
    )

    Box(
        modifier = modifier.size(270.dp),
        contentAlignment = Alignment.Center,
    ) {
        // Lienzo del radar: círculos concéntricos, ejes de telemetría, barrido y ondas
        Canvas(modifier = Modifier.matchParentSize()) {
            val center = Offset(size.width / 2f, size.height / 2f)
            val maxRadius = size.minDimension / 2f
            val innerCoreRadius = 36.dp.toPx()

            // Círculos concéntricos fijos de telemetría médica
            val ringRadii = listOf(
                innerCoreRadius + 16.dp.toPx(),
                innerCoreRadius + 44.dp.toPx(),
                innerCoreRadius + 72.dp.toPx(),
                maxRadius - 4.dp.toPx(),
            )

            ringRadii.forEachIndexed { index, r ->
                drawCircle(
                    color = Primary.copy(alpha = if (index == ringRadii.lastIndex) 0.18f else 0.10f),
                    radius = r,
                    center = center,
                    style = Stroke(
                        width = 1.dp.toPx(),
                        pathEffect = if (index % 2 == 1) PathEffect.dashPathEffect(floatArrayOf(6f, 6f), 0f) else null,
                    ),
                )
            }

            // Ejes de telemetría (mira central)
            val axisColor = Primary.copy(alpha = 0.08f)
            drawLine(
                color = axisColor,
                start = Offset(center.x, 8.dp.toPx()),
                end = Offset(center.x, size.height - 8.dp.toPx()),
                strokeWidth = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f), 0f),
            )
            drawLine(
                color = axisColor,
                start = Offset(8.dp.toPx(), center.y),
                end = Offset(size.width - 8.dp.toPx(), center.y),
                strokeWidth = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f), 0f),
            )

            // Ondas concéntricas de despacho en Azul AutaMedica
            val waveRadius1 = innerCoreRadius + wave1 * (maxRadius - innerCoreRadius)
            val waveAlpha1 = (1f - wave1) * 0.35f
            drawCircle(
                color = Primary.copy(alpha = waveAlpha1),
                radius = waveRadius1,
                center = center,
                style = Stroke(width = 2.dp.toPx()),
            )

            val waveRadius2 = innerCoreRadius + wave2 * (maxRadius - innerCoreRadius)
            val waveAlpha2 = (1f - wave2) * 0.35f
            drawCircle(
                color = Primary.copy(alpha = waveAlpha2),
                radius = waveRadius2,
                center = center,
                style = Stroke(width = 2.dp.toPx()),
            )

            // Barrido de radar dinámico
            rotate(degrees = sweepAngle, pivot = center) {
                val sweepBrush = Brush.sweepGradient(
                    0.0f to Color.Transparent,
                    0.75f to Color.Transparent,
                    0.92f to Primary.copy(alpha = 0.04f),
                    1.0f to Primary.copy(alpha = 0.16f),
                    center = center,
                )
                drawCircle(
                    brush = sweepBrush,
                    radius = maxRadius - 4.dp.toPx(),
                    center = center,
                )
                // Línea frontal de barrido
                drawLine(
                    color = Primary.copy(alpha = 0.35f),
                    start = center,
                    end = Offset(center.x + maxRadius - 4.dp.toPx(), center.y),
                    strokeWidth = 1.5.dp.toPx(),
                )
            }
        }

        // Núcleo central con Logo AutaMedica y pulso de transmisión
        Surface(
            shape = CircleShape,
            color = AuBackground,
            border = BorderStroke(1.5.dp, Primary.copy(alpha = 0.35f)),
            shadowElevation = 6.dp,
            modifier = Modifier
                .size(70.dp)
                .scale(logoPulseScale),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                Primary.copy(alpha = 0.12f),
                                Primary.copy(alpha = 0.02f),
                            )
                        )
                    )
            ) {
                Image(
                    painter = painterResource(id = R.drawable.logo_autamedica),
                    contentDescription = "AutaMedica Guardia",
                    modifier = Modifier.size(40.dp),
                    contentScale = ContentScale.Fit,
                )
            }
        }

        // Nodos orbitantes de Médicos en Guardia Conectados
        val radarRadiusPx = 135f * 2.6f // Escala visual proporcional al radar de 270dp
        doctors.take(3).forEach { doctor ->
            val rad = Math.toRadians(doctor.radarAngleDeg.toDouble())
            val effectiveRadiusDp = 98.dp * doctor.radarDistanceFraction
            val xOffset = (effectiveRadiusDp.value * cos(rad)).dp
            val yOffset = (effectiveRadiusDp.value * sin(rad)).dp

            DoctorRadarNode(
                doctor = doctor,
                greenPulseScale = greenDotPulse,
                modifier = Modifier.offset {
                    IntOffset(
                        x = (xOffset.toPx()).toInt(),
                        y = (yOffset.toPx()).toInt(),
                    )
                },
            )
        }
    }
}

/**
 * Avatar médico flotante dentro del radar con punto de presencia viva en verde.
 */
@Composable
private fun DoctorRadarNode(
    doctor: OnDutyDoctorInfo,
    greenPulseScale: Float,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.TopEnd) {
            // Avatar circular del médico
            Surface(
                shape = CircleShape,
                color = AuSurface,
                border = BorderStroke(1.dp, Primary.copy(alpha = 0.35f)),
                shadowElevation = 4.dp,
                modifier = Modifier.size(34.dp),
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.background(Primary.copy(alpha = 0.08f)),
                ) {
                    Text(
                        text = doctor.initials,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Primary,
                        fontSize = 11.sp,
                    )
                }
            }

            // Punto verde de presencia viva (halo pulsante + dot sólido)
            Box(
                modifier = Modifier
                    .offset(x = 2.dp, y = (-2).dp)
                    .size(10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .scale(if (doctor.isAvailable) greenPulseScale else 1f)
                        .clip(CircleShape)
                        .background(
                            if (doctor.isAvailable) AuSuccess.copy(alpha = 0.35f)
                            else Primary.copy(alpha = 0.25f)
                        )
                )
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(
                            if (doctor.isAvailable) AuSuccess
                            else Primary
                        )
                )
            }
        }

        Spacer(modifier = Modifier.height(2.dp))

        // Mini chip identificador del médico
        Surface(
            shape = RoundedCornerShape(6.dp),
            color = AuBackground.copy(alpha = 0.95f),
            border = BorderStroke(0.5.dp, Primary.copy(alpha = 0.2f)),
            shadowElevation = 2.dp,
            modifier = Modifier.padding(horizontal = 2.dp),
        ) {
            Text(
                text = doctor.shortName,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = AuTextPrimary,
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
            )
        }
    }
}

/**
 * Panel de Red Médica Conectada: lista horizontal de médicos en guardia activa.
 * Transmite certeza humana de que los médicos están conectados operando en ese instante.
 */
@Composable
fun ActiveMedicalNetworkPanel(
    doctors: List<OnDutyDoctorInfo> = defaultOnDutyDoctors,
    modifier: Modifier = Modifier,
) {
    val scrollState = rememberScrollState()

    Column(modifier = modifier.fillMaxWidth()) {
        // Cabecera de la red
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Punto verde vivo indicador de red activa
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(AuSuccess)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "MÉDICOS EN GUARDIA ACTIVOS",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.8.sp,
                    color = AuTextPrimary,
                )
            }

            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Primary.copy(alpha = 0.08f),
                border = BorderStroke(0.5.dp, Primary.copy(alpha = 0.2f)),
            ) {
                Text(
                    text = "${doctors.count { it.isAvailable }} en línea",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = Primary,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Carrusel horizontal de tarjetas médicas
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            doctors.forEach { doctor ->
                DoctorDutyCard(doctor = doctor)
            }
        }
    }
}

/**
 * Tarjeta individual de médico en red de guardia con badge de presencia y especialidad.
 */
@Composable
private fun DoctorDutyCard(
    doctor: OnDutyDoctorInfo,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.15f)),
        shadowElevation = 1.dp,
        modifier = modifier.width(220.dp),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Avatar con iniciales
                Surface(
                    shape = CircleShape,
                    color = Primary.copy(alpha = 0.08f),
                    border = BorderStroke(1.dp, Primary.copy(alpha = 0.2f)),
                    modifier = Modifier.size(36.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = doctor.initials,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = Primary,
                        )
                    }
                }

                Spacer(modifier = Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = doctor.name,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = doctor.specialty,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Badge de estado de presencia
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (doctor.isAvailable) SuccessContainer else AuHover,
                    border = BorderStroke(
                        width = 0.5.dp,
                        color = if (doctor.isAvailable) AuSuccess.copy(alpha = 0.3f) else AuBorder,
                    ),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(if (doctor.isAvailable) AuSuccess else Primary)
                        )
                        Spacer(modifier = Modifier.width(5.dp))
                        Text(
                            text = doctor.statusText,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                            color = if (doctor.isAvailable) Color(0xFF065F46) else AuTextSecondary,
                            fontSize = 10.sp,
                        )
                    }
                }

                Text(
                    text = doctor.registration.substringBefore(" •"),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    fontSize = 10.sp,
                )
            }
        }
    }
}

/**
 * Ticker animado de telemetría dinámica. Rota sutilmente cada 3.5 segundos
 * transmitiendo el avance de despacho hacia la guardia médica.
 */
@Composable
fun DispatchTelemetryTicker(
    modifier: Modifier = Modifier,
) {
    val telemetryMessages = remember {
        listOf(
            TelemetryItem(
                iconRes = R.drawable.ic_telemetry_broadcast,
                message = "Conectando con guardia médica...",
            ),
            TelemetryItem(
                iconRes = R.drawable.ic_response_time,
                message = "Espera promedio: ~2 min",
            ),
            TelemetryItem(
                iconRes = R.drawable.ic_shield_priority,
                message = "Prioridad: Farmacia de Turno",
            ),
            TelemetryItem(
                iconRes = R.drawable.ic_doctor_presence,
                message = "3 médicos en guardia activa",
            ),
        )
    }

    var currentIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(3500)
            currentIndex = (currentIndex + 1) % telemetryMessages.size
        }
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Primary.copy(alpha = 0.05f),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.15f)),
        modifier = modifier.fillMaxWidth(),
    ) {
        Box(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedContent(
                targetState = telemetryMessages[currentIndex],
                transitionSpec = {
                    (slideInVertically { height -> height } + fadeIn())
                        .togetherWith(slideOutVertically { height -> -height } + fadeOut())
                },
                label = "TelemetryTickerAnimation",
            ) { item ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        painter = painterResource(id = item.iconRes),
                        contentDescription = null,
                        tint = Color.Unspecified,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = item.message,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        color = AuTextPrimary,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

private data class TelemetryItem(
    val iconRes: Int,
    val message: String,
)
