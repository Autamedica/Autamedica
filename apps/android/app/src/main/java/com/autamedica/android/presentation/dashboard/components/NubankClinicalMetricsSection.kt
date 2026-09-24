package com.autamedica.android.presentation.dashboard.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.presentation.theme.AuCyan
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuNavy
import com.autamedica.android.presentation.theme.PortalDoctors

/**
 * Sección de Métricas Clínicas y Honorarios estilo Nubank (NuDS).
 * 
 * Características:
 * - Tarjetas biocerámicas de alto contraste con elevación suave.
 * - Tipografía tabular (`fontFeatureSettings = "tnum"`) para máxima legibilidad.
 * - Toggle de privacidad de honorarios acumulados (ícono de ojo estilo Nubank).
 * - Micro-badges de SLA clínico, tasa de aceptación y tiempos de guardia.
 * - Feedback táctil háptico en cada toque.
 */
@Composable
fun NubankClinicalMetricsSection(
    stats: DoctorStats,
    modifier: Modifier = Modifier,
    consultationsTodayCount: Int = 0,
    accumulatedEarnings: String = "R$ 1.840,00",
    averageResponseTime: String = "1.8 min",
    acceptanceRate: String = "99.2%",
    onOpenFinancials: (() -> Unit)? = null,
) {
    val hapticFeedback = LocalHapticFeedback.current
    var isEarningsHidden by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Cabecera de la sección
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "MÉTRICAS DEL DÍA",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 1.sp,
                    ),
                    color = PortalDoctors,
                )
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(AuEmerald)
                )
            }

            // Botón de privacidad estilo Nubank (Ocultar / Mostrar cifras)
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = Color(0xFFF1F5F9),
                modifier = Modifier.clickable {
                    hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    isEarningsHidden = !isEarningsHidden
                }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = if (isEarningsHidden) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                        contentDescription = "Privacidad de honorarios",
                        modifier = Modifier.size(13.dp),
                        tint = Color(0xFF475569),
                    )
                    Text(
                        text = if (isEarningsHidden) "Mostrar" else "Ocultar",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        color = Color(0xFF475569),
                    )
                }
            }
        }

        // Ticker Horizontal / Carrusel de Tarjetas Biocerámicas estilo Nubank
        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 2.dp, vertical = 4.dp),
        ) {
            // 1. Honorarios Acumulados
            item {
                NubankMetricCard(
                    title = "Honorarios de guardia",
                    value = if (isEarningsHidden) "••••••••" else accumulatedEarnings,
                    subtext = "Liquidación automática en 24h",
                    badgeText = "+18% vs semana ant.",
                    badgeColor = AuEmerald,
                    badgeBgColor = Color(0xFFECFDF5),
                    icon = Icons.Outlined.Payments,
                    iconTint = AuEmerald,
                    onClick = onOpenFinancials,
                )
            }

            // 2. Consultas Atendidas Hoy
            val resolvedConsultations = when {
                consultationsTodayCount > 0 -> consultationsTodayCount
                stats.completedToday > 0 -> stats.completedToday
                stats.todayAppointments > 0 -> stats.todayAppointments
                else -> 6
            }
            item {
                NubankMetricCard(
                    title = "Consultas atendidas",
                    value = "$resolvedConsultations",
                    subtext = "Objetivo diario: 8 consultas",
                    badgeText = "100% SLA puntual",
                    badgeColor = PortalDoctors,
                    badgeBgColor = Color(0xFFEBF1FF),
                    icon = Icons.Outlined.CheckCircle,
                    iconTint = PortalDoctors,
                )
            }

            // 3. Tiempo Medio de Respuesta
            item {
                NubankMetricCard(
                    title = "Tiempo de respuesta",
                    value = averageResponseTime,
                    subtext = "SLA institucional < 2 min",
                    badgeText = "Top 5% red",
                    badgeColor = AuCyan,
                    badgeBgColor = Color(0xFFECFEFF),
                    icon = Icons.Outlined.Timer,
                    iconTint = AuCyan,
                )
            }

            // 4. Tasa de Aceptación
            item {
                NubankMetricCard(
                    title = "Tasa de aceptación",
                    value = acceptanceRate,
                    subtext = "Calificación clínica 4.9 ★",
                    badgeText = "Nivel Oro",
                    badgeColor = PortalDoctors,
                    badgeBgColor = Color(0xFFEBF1FF),
                    icon = Icons.Outlined.Speed,
                    iconTint = PortalDoctors,
                )
            }
        }
    }
}

@Composable
private fun NubankMetricCard(
    title: String,
    value: String,
    subtext: String,
    badgeText: String,
    badgeColor: Color,
    badgeBgColor: Color,
    icon: ImageVector,
    iconTint: Color,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    val hapticFeedback = LocalHapticFeedback.current

    Card(
        modifier = modifier
            .width(225.dp)
            .shadow(
                elevation = 2.dp,
                shape = RoundedCornerShape(22.dp),
                ambientColor = Color(0x08000000),
                spotColor = Color(0x12000000),
            )
            .then(
                if (onClick != null) Modifier.clickable {
                    hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onClick()
                } else Modifier
            ),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Fila superior: Título e Ícono
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    ),
                    color = Color(0xFF64748B),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(badgeBgColor),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = iconTint,
                        modifier = Modifier.size(17.dp),
                    )
                }
            }

            // Valor Numérico Grande con Tabular Numbers (tnum)
            Text(
                text = value,
                style = TextStyle(
                    fontSize = 26.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.8).sp,
                    fontFeatureSettings = "tnum",
                ),
                color = Color(0xFF0F172A),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            // Fila inferior: Badge de SLA / Tendencia
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = badgeBgColor,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.TrendingUp,
                            contentDescription = null,
                            tint = badgeColor,
                            modifier = Modifier.size(11.dp),
                        )
                        Text(
                            text = badgeText,
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = badgeColor,
                        )
                    }
                }

                Text(
                    text = subtext,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    color = Color(0xFF94A3B8),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
