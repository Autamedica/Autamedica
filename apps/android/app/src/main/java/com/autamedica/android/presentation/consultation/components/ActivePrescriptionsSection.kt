package com.autamedica.android.presentation.consultation.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients

/**
 * Sección de farmacoterapia activa inspirada en la transparencia de datos de Nubank.
 * Despliega las recetas digitales emitidas bajo el Decreto 63 con código oficial CUIR,
 * posología y acceso inmediato al código QR para mostrador de farmacia.
 */
@Composable
fun ActivePrescriptionsSection(
    prescriptions: List<Prescription>,
    onSelectPrescriptionForQr: (Prescription) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (prescriptions.isEmpty()) return

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
                        .background(AuSuccess),
                )
                Text(
                    text = "FARMACOTERAPIA ACTIVA (RECETAS VIGENTES)",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = AuTextSecondary,
                    letterSpacing = 0.6.sp,
                )
            }

            Text(
                text = "${prescriptions.size} activa${if (prescriptions.size == 1) "" else "s"}",
                style = MaterialTheme.typography.labelSmall,
                color = AuTextTertiary,
            )
        }

        // Lista de prescripciones
        prescriptions.forEach { prescription ->
            PrescriptionCompactCard(
                prescription = prescription,
                onShowQr = { onSelectPrescriptionForQr(prescription) },
            )
        }
    }
}

@Composable
private fun PrescriptionCompactCard(
    prescription: Prescription,
    onShowQr: () -> Unit,
) {
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
                verticalAlignment = Alignment.Top,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFF0FDF4),
                        border = BorderStroke(1.dp, AuSuccess.copy(alpha = 0.3f)),
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.Medication,
                                contentDescription = null,
                                tint = AuSuccess,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }

                    Column {
                        Text(
                            text = prescription.medicationName,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "${prescription.dosage} · ${prescription.frequency}",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                }

                // Badge de validez legal
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = Color(0xFFECFDF5),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = AuSuccess,
                            modifier = Modifier.size(10.dp),
                        )
                        Text(
                            text = "Vigente",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF065F46),
                            fontSize = 10.sp,
                        )
                    }
                }
            }

            // Indicación médica clara
            if (prescription.instructions.isNotBlank()) {
                Text(
                    text = prescription.instructions,
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    lineHeight = 16.sp,
                )
            }

            // Pie de tarjeta con CUIR y botón de QR para farmacia
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Código CUIR legal
                prescription.cuir?.let { cuir ->
                    Text(
                        text = "CUIR: $cuir",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        color = AuTextTertiary,
                        fontSize = 11.sp,
                    )
                } ?: Spacer(modifier = Modifier.width(1.dp))

                // Botón de acceso a QR de farmacia
                OutlinedButton(
                    onClick = onShowQr,
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.5f)),
                    modifier = Modifier.height(34.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.QrCode,
                        contentDescription = null,
                        tint = PortalPatients,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Ver QR farmacia",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = PortalPatients,
                    )
                }
            }
        }
    }
}
