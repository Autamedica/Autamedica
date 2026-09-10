package com.autamedica.android.presentation.doctors.agenda.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.DoctorAvailabilitySlot
import com.autamedica.android.presentation.doctors.agenda.SaveStatus
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors

private val DAY_LABELS = listOf("Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb")
private val DAY_FULL_LABELS = listOf("Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado")

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun AvailabilityEditor(
    slots: List<DoctorAvailabilitySlot>,
    isOpen: Boolean,
    saveStatus: SaveStatus,
    errorMessage: String?,
    onToggleOpen: () -> Unit,
    onAddSlot: (dayOfWeek: Int) -> Unit,
    onRemoveSlot: (slotIndex: Int) -> Unit,
    onUpdateSlot: (slotIndex: Int, startTime: String, endTime: String) -> Unit,
    onApplyTemplate: (templateName: String) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hasSlots = slots.isNotEmpty()
    var editingSlotIndex by remember { mutableStateOf<Int?>(null) }
    var editingIsStartTime by remember { mutableStateOf(true) }
    var tempTimeText by remember { mutableStateOf("") }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 1.dp,
    ) {
        Column {
            // Header: Accordion toggle
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleOpen)
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        modifier = Modifier.size(36.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = if (hasSlots) Color(0xFFD1FAE5) else Color(0xFFFEF3C7),
                    ) {
                        Icon(
                            imageVector = if (hasSlots) Icons.Outlined.CheckCircle else Icons.Default.Warning,
                            contentDescription = null,
                            tint = if (hasSlots) Color(0xFF047857) else Color(0xFFB45309),
                            modifier = Modifier.padding(8.dp),
                        )
                    }

                    Column {
                        Text(
                            text = "DISPONIBILIDAD",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                            letterSpacing = 1.5.sp,
                        )
                        Text(
                            text = if (hasSlots) {
                                "${slots.size} bloque${if (slots.size > 1) "s" else ""} configurado${if (slots.size > 1) "s" else ""}"
                            } else {
                                "Sin horarios configurados"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (hasSlots) AuTextPrimary else Color(0xFFB45309),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (isOpen) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = null,
                        tint = AuTextTertiary,
                    )
                }
            }

            AnimatedVisibility(visible = isOpen) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 18.dp, vertical = 12.dp)
                ) {
                    HorizontalDivider(color = Color(0xFFF1F5F9))
                    Spacer(modifier = Modifier.height(14.dp))

                    // Alert if no availability
                    if (!hasSlots) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFFFFBEB), // amber-50
                            border = BorderStroke(1.dp, Color(0xFFFDE68A)), // amber-200
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = Color(0xFFD97706),
                                    modifier = Modifier.size(20.dp),
                                )
                                Column {
                                    Text(
                                        text = "Configurá tu disponibilidad",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF92400E),
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "Sin horarios configurados, los pacientes no pueden agendar turnos. Elegí una plantilla rápida o agregá bloques manualmente.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color(0xFFB45309),
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Quick templates
                        Text(
                            text = "PLANTILLAS RÁPIDAS",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                            letterSpacing = 1.sp,
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { onApplyTemplate("weekdays") },
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.4f)),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = PortalDoctors),
                            ) {
                                Text(
                                    text = "📅 Lun-Vie 9:00-18:00",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            OutlinedButton(
                                onClick = { onApplyTemplate("weekdays_half") },
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.4f)),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = PortalDoctors),
                            ) {
                                Text(
                                    text = "🌅 Lun-Vie 8:00-13:00",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // Days Rows (0..6)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        (0..6).forEach { day ->
                            val daySlots = slots.mapIndexed { index, slot -> index to slot }
                                .filter { it.second.dayOfWeek == day }

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                // Day Label
                                Text(
                                    text = DAY_LABELS[day].uppercase(),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (daySlots.isNotEmpty()) AuTextPrimary else AuTextTertiary,
                                    fontSize = 11.sp,
                                    modifier = Modifier.width(38.dp),
                                )

                                // Slot chips or "Sin horario"
                                Row(
                                    modifier = Modifier.weight(1f),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (daySlots.isEmpty()) {
                                        Text(
                                            text = "Sin horario",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AuTextTertiary.copy(alpha = 0.6f),
                                            fontStyle = FontStyle.Italic,
                                            fontSize = 12.sp,
                                        )
                                    } else {
                                        FlowRow(
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                        ) {
                                            daySlots.forEach { (index, slot) ->
                                                Surface(
                                                    shape = RoundedCornerShape(8.dp),
                                                    color = Color(0xFFF8FAFC),
                                                    border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Outlined.Schedule,
                                                            contentDescription = null,
                                                            tint = AuTextTertiary,
                                                            modifier = Modifier.size(12.dp),
                                                        )
                                                        Text(
                                                            text = slot.startTime,
                                                            style = MaterialTheme.typography.labelMedium,
                                                            fontWeight = FontWeight.Bold,
                                                            color = AuTextPrimary,
                                                            modifier = Modifier.clickable {
                                                                editingSlotIndex = index
                                                                editingIsStartTime = true
                                                                tempTimeText = slot.startTime
                                                            },
                                                        )
                                                        Text(
                                                            text = "—",
                                                            style = MaterialTheme.typography.labelSmall,
                                                            color = AuTextTertiary,
                                                        )
                                                        Text(
                                                            text = slot.endTime,
                                                            style = MaterialTheme.typography.labelMedium,
                                                            fontWeight = FontWeight.Bold,
                                                            color = AuTextPrimary,
                                                            modifier = Modifier.clickable {
                                                                editingSlotIndex = index
                                                                editingIsStartTime = false
                                                                tempTimeText = slot.endTime
                                                            },
                                                        )
                                                        Spacer(modifier = Modifier.width(2.dp))
                                                        Icon(
                                                            imageVector = Icons.Default.Delete,
                                                            contentDescription = "Eliminar bloque",
                                                            tint = Color(0xFFEF4444),
                                                            modifier = Modifier
                                                                .size(14.dp)
                                                                .clickable { onRemoveSlot(index) },
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // Add button for this day
                                IconButton(
                                    onClick = { onAddSlot(day) },
                                    modifier = Modifier.size(28.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Add,
                                        contentDescription = "Agregar horario para ${DAY_FULL_LABELS[day]}",
                                        tint = PortalDoctors,
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                        }
                    }

                    // Error message banner
                    if (!errorMessage.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFFEF2F2),
                            border = BorderStroke(1.dp, Color(0xFFFECACA)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = AuDanger,
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    text = errorMessage,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuDanger,
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Footer bar: Duración de turno & Botón Guardar
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "Duración de turno: 30 min",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )

                        Button(
                            onClick = onSave,
                            enabled = saveStatus != SaveStatus.SAVING,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = when (saveStatus) {
                                    SaveStatus.SAVED -> Color(0xFF059669) // emerald-600
                                    SaveStatus.ERROR -> AuDanger
                                    else -> PortalDoctors
                                },
                                contentColor = Color.White,
                            ),
                        ) {
                            when (saveStatus) {
                                SaveStatus.SAVING -> {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                        color = Color.White,
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("GUARDANDO...", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                                SaveStatus.SAVED -> {
                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("GUARDADO", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                                else -> {
                                    Icon(
                                        imageVector = Icons.Outlined.Save,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("GUARDAR DISPONIBILIDAD", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Time Edit Dialog
    editingSlotIndex?.let { index ->
        val slot = slots.getOrNull(index)
        if (slot != null) {
            AlertDialog(
                onDismissRequest = { editingSlotIndex = null },
                title = {
                    Text(
                        text = if (editingIsStartTime) "Hora de inicio" else "Hora de fin",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "Formato HH:mm (ejemplo: 09:00, 17:30)",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                        OutlinedTextField(
                            value = tempTimeText,
                            onValueChange = { tempTimeText = it.take(5) },
                            singleLine = true,
                            label = { Text("Hora (HH:mm)") },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            if (tempTimeText.matches(Regex("^\\d{2}:\\d{2}$"))) {
                                if (editingIsStartTime) {
                                    onUpdateSlot(index, tempTimeText, slot.endTime)
                                } else {
                                    onUpdateSlot(index, slot.startTime, tempTimeText)
                                }
                            }
                            editingSlotIndex = null
                        }
                    ) {
                        Text("Aceptar", fontWeight = FontWeight.Bold, color = PortalDoctors)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { editingSlotIndex = null }) {
                        Text("Cancelar", color = AuTextTertiary)
                    }
                },
            )
        }
    }
}
