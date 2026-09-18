package com.autamedica.android.presentation.consultation.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.MedicalOrder
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.util.CountryContext
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors

/**
 * Sección de órdenes médicas y estudios complementarios pendientes (Laboratorio, Imágenes, Cardiología).
 * Presenta las solicitudes clínicas prescritas por el médico para seguimiento del paciente.
 */
@Composable
fun PendingOrdersSection(
    orders: List<MedicalOrder>,
    modifier: Modifier = Modifier,
) {
    if (orders.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Título de la sección
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(PortalDoctors),
                )
                Text(
                    text = "ÓRDENES DE ESTUDIOS PENDIENTES",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = AuTextSecondary,
                    letterSpacing = 0.6.sp,
                )
            }

            val isPt = CountryContext.isBrazil()
            val ordersText = if (isPt) {
                "${orders.size} ${if (orders.size == 1) "pedido" else "pedidos"}"
            } else {
                "${orders.size} orden${if (orders.size == 1) "" else "es"}"
            }
            Text(
                text = ordersText,
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
            )
        }

        // Lista de órdenes
        orders.forEach { order ->
            MedicalOrderCompactCard(order = order)
        }
    }
}

@Composable
private fun MedicalOrderCompactCard(order: MedicalOrder) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFEFF6FF), // Blue-50
                        modifier = Modifier.size(32.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Outlined.Assignment,
                                contentDescription = null,
                                tint = PortalDoctors,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }

                    Column {
                        Text(
                            text = order.studyType.displayName,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        order.doctorName?.let { doc ->
                            Text(
                                text = "Prescrito por $doc",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                }

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = Color(0xFFEFF6FF),
                    border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.3f)),
                ) {
                    Text(
                        text = "Pendiente",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = PortalDoctors,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        fontSize = 10.sp,
                    )
                }
            }

            // Prácticas solicitadas
            if (order.practices.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "Prácticas indicadas:",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                        fontSize = 11.sp,
                    )
                    Text(
                        text = order.practices.joinToString(", ") { it.name },
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            // Diagnóstico presuntivo
            order.diagnosis?.let { diag ->
                Text(
                    text = "Diagnóstico: $diag",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextSecondary,
                )
            }

            // CUIR oficial
            order.cuir?.let { cuir ->
                Text(
                    text = "CUIR: $cuir",
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    color = AuTextTertiary,
                    fontSize = 10.sp,
                )
            }
        }
    }
}
