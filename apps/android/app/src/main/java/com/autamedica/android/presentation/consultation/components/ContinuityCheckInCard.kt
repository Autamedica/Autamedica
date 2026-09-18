package com.autamedica.android.presentation.consultation.components

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.AppointmentFollowup
import com.autamedica.android.domain.model.FollowupCheckInEvolution
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients

/**
 * Protocolo de continuidad asistencial post-consulta (48 horas).
 * Pregunta de forma directa y humana por la evolución del síntoma tratado.
 */
@Composable
fun ContinuityCheckInCard(
    followup: AppointmentFollowup,
    isSubmitting: Boolean,
    onSubmitEvolution: (followupId: String, evolution: FollowupCheckInEvolution) -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedEvolution by remember { mutableStateOf<FollowupCheckInEvolution?>(null) }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.35f)),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFF0F9FF),
                    modifier = Modifier.size(32.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Outlined.History,
                            contentDescription = null,
                            tint = PortalPatients,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
                Column {
                    Text(
                        text = "CONTINUIDAD ASISTENCIAL (48 HS)",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = PortalPatients,
                        letterSpacing = 0.5.sp,
                    )
                    Text(
                        text = "¿Cómo evolucionaron tus síntomas?",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                }
            }

            Text(
                text = "Seguimiento médico de tu última consulta. Tu respuesta se registra en tu ficha clínica para el profesional.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
                lineHeight = 16.sp,
            )

            // Selector de 3 estados de evolución
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // 1. MEJOR
                EvolutionSelectButton(
                    label = "Mejor",
                    icon = Icons.Outlined.Check,
                    selected = selectedEvolution == FollowupCheckInEvolution.BETTER,
                    selectedColor = AuSuccess,
                    containerColor = Color(0xFFECFDF5),
                    onClick = { selectedEvolution = FollowupCheckInEvolution.BETTER },
                    modifier = Modifier.weight(1f),
                )

                // 2. ESTABLE
                EvolutionSelectButton(
                    label = "Estable",
                    icon = Icons.Outlined.Remove,
                    selected = selectedEvolution == FollowupCheckInEvolution.STABLE,
                    selectedColor = PortalPatients,
                    containerColor = Color(0xFFF0F9FF),
                    onClick = { selectedEvolution = FollowupCheckInEvolution.STABLE },
                    modifier = Modifier.weight(1f),
                )

                // 3. PEOR
                EvolutionSelectButton(
                    label = "Peor",
                    icon = Icons.Outlined.Close,
                    selected = selectedEvolution == FollowupCheckInEvolution.WORSE,
                    selectedColor = AuDanger,
                    containerColor = Color(0xFFFEF2F2),
                    onClick = { selectedEvolution = FollowupCheckInEvolution.WORSE },
                    modifier = Modifier.weight(1f),
                )
            }

            // Botón de confirmación si hay selección
            selectedEvolution?.let { evolution ->
                Button(
                    onClick = { onSubmitEvolution(followup.id, evolution) },
                    enabled = !isSubmitting,
                    colors = ButtonDefaults.buttonColors(containerColor = PortalPatients),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(42.dp),
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Guardando evolución...")
                    } else {
                        Text("Registrar evolución clínica", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun EvolutionSelectButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: Boolean,
    selectedColor: Color,
    containerColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (selected) containerColor else Color(0xFFF8FAFC),
        border = BorderStroke(
            width = if (selected) 1.5.dp else 1.dp,
            color = if (selected) selectedColor else AuBorder,
        ),
        modifier = modifier.height(44.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) selectedColor else AuTextTertiary,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                color = if (selected) selectedColor else AuTextSecondary,
            )
        }
    }
}
