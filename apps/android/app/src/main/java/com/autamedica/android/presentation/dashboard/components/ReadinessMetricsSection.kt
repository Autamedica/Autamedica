package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients

@Composable
fun ReadinessMetricsSection(
    anamnesisProgress: Int,
    profileProgress: Int,
    freeConsultations: Int,
    isCompleted: Boolean,
    onPrimaryAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // Status & Heading Card
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color.White,
            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
            shadowElevation = 1.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // Status Pill
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (isCompleted) Color(0xFFECFDF5) else Color(0xFFF0F9FF),
                    border = BorderStroke(
                        1.dp,
                        if (isCompleted) Color(0xFFA7F3D0) else Color(0xFFBAE6FD)
                    ),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    ) {
                        Icon(
                            imageVector = if (isCompleted) Icons.Outlined.CheckCircle else Icons.Outlined.Info,
                            contentDescription = if (isCompleted) "Estado al día" else "Acción requerida",
                            modifier = Modifier.size(14.dp),
                            tint = if (isCompleted) Color(0xFF047857) else Color(0xFF0284C7),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (isCompleted) "Al día" else "Acción requerida",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isCompleted) Color(0xFF047857) else Color(0xFF0284C7),
                        )
                    }
                }

                // Title (responsive on 360dp screens)
                Text(
                    text = if (!isCompleted) "Ficha médica" else "Todo listo",
                    fontSize = 22.sp,
                    lineHeight = 28.sp,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.5).sp,
                )

                // Subtitle
                Text(
                    text = if (!isCompleted) {
                        "Requerido para iniciar tu atención."
                    } else {
                        "Atención médica habilitada."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextSecondary,
                    lineHeight = 20.sp,
                )

                // CTA Button (48dp min touch target)
                Button(
                    onClick = onPrimaryAction,
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF0F172A),
                        contentColor = Color.White,
                    ),
                    modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        horizontal = 22.dp,
                        vertical = 13.dp,
                    ),
                ) {
                    Text(
                        text = if (!isCompleted) "Completar ahora" else "Solicitar turno",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }

        // Metrics Bars Card
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color.White,
            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
            shadowElevation = 1.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Metric 1: Ficha médica
                MetricProgressRow(
                    label = "Ficha médica",
                    valueText = "$anamnesisProgress%",
                    progressFraction = (anamnesisProgress / 100f).coerceIn(0f, 1f),
                    color = PortalPatients,
                )

                Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF1F5F9)))

                // Metric 2: Perfil
                MetricProgressRow(
                    label = "Perfil",
                    valueText = "$profileProgress%",
                    progressFraction = (profileProgress / 100f).coerceIn(0f, 1f),
                    color = Color(0xFF64748B),
                )

                Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF1F5F9)))

                // Metric 3: Consultas libres
                MetricProgressRow(
                    label = "Consultas libres",
                    valueText = freeConsultations.toString(),
                    progressFraction = (freeConsultations / 5f).coerceIn(0f, 1f),
                    color = Color(0xFF0284C7),
                )
            }
        }
    }
}

@Composable
private fun MetricProgressRow(
    label: String,
    valueText: String,
    progressFraction: Float,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                text = label,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = AuTextSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = valueText,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xFFF1F5F9)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction = progressFraction.coerceAtLeast(0.02f))
                    .height(6.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(color),
            )
        }
    }
}
