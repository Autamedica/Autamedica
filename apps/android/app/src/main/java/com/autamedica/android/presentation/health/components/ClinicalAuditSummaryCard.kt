package com.autamedica.android.presentation.health.components

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary

private val EmeraldSuccess = Color(0xFF16A34A)
private val EmeraldSoft = Color(0xFFDCFCE7)
private val CrimsonAlert = Color(0xFFDC2626)
private val CrimsonSoft = Color(0xFFFEF2F2)
private val CrimsonBorder = Color(0xFFFCA5A5)
private val ObsidianDark = Color(0xFF09090B)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClinicalAuditSummaryCard(
    sections: List<AnamnesisSection>,
    currentFieldValues: Map<String, String>,
    onEditSection: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Helper to get field from section data or current values
    fun getFieldValue(sectionName: String, fieldKey: String): String {
        val fromCurrent = currentFieldValues[fieldKey]
        if (!fromCurrent.isNullOrBlank()) return fromCurrent
        val section = sections.firstOrNull { it.section == sectionName }
        return section?.data?.get(fieldKey).orEmpty()
    }

    fun findSectionIndex(sectionName: String): Int =
        sections.indexOfFirst { it.section == sectionName }.coerceAtLeast(0)

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = ObsidianDark,
                    modifier = Modifier.size(28.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Outlined.Assignment,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier
                            .padding(6.dp)
                            .size(16.dp),
                    )
                }
                Column {
                    Text(
                        text = "HISTORIA CLÍNICA CONSOLIDADA",
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp,
                    )
                    Text(
                        text = "Auditoría integral previa a la rúbrica (Decreto 63 / SISA)",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 1. FILIACIÓN Y CONTACTO
            val emergencyName = getFieldValue("edad", "emergency_contact_name")
            val emergencyPhone = getFieldValue("edad", "emergency_contact_phone")
            val bloodType = getFieldValue("edad", "blood_type")
            val occupation = getFieldValue("ocupacion", "ocupacion_actual")

            ClinicalDomainBlock(
                title = "1. Filiación y Emergencia",
                onEdit = { onEditSection(findSectionIndex("edad")) },
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Contacto: ${if (emergencyName.isNotBlank()) emergencyName else "No informado"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = "Teléfono: ${if (emergencyPhone.isNotBlank()) emergencyPhone else "No informado"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                    if (bloodType.isNotBlank()) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = ObsidianDark,
                        ) {
                            Text(
                                text = "Grupo $bloodType",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
                    }
                }
                if (occupation.isNotBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Ocupación: $occupation",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 2. MOTIVO DE CONSULTA
            val symptom = getFieldValue("motivo_consulta", "sintoma_principal")
            val duration = getFieldValue("motivo_consulta", "cuando_empezo")
            val intensity = getFieldValue("motivo_consulta", "intensidad_sintoma")

            ClinicalDomainBlock(
                title = "2. Motivo de Consulta",
                onEdit = { onEditSection(findSectionIndex("motivo_consulta")) },
            ) {
                Text(
                    text = if (symptom.isNotBlank()) symptom else "Sin motivo detallado",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (duration.isNotBlank()) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = AuSurfaceHover,
                            border = BorderStroke(1.dp, AuBorder),
                        ) {
                            Text(
                                text = "Inicio: $duration",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextSecondary,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }
                    }
                    if (intensity.isNotBlank()) {
                        val intVal = intensity.toIntOrNull() ?: 0
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = if (intVal >= 7) CrimsonSoft else AuSurfaceHover,
                            border = BorderStroke(1.dp, if (intVal >= 7) CrimsonBorder else AuBorder),
                        ) {
                            Text(
                                text = "Intensidad: $intensity/10",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (intVal >= 7) CrimsonAlert else AuTextSecondary,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 3. ALERGIAS (ALERTA CLÍNICA)
            val hasAllergies = getFieldValue("alergias", "tiene_alergias") == "true"
            val allergiesList = getFieldValue("alergias", "lista_alergias")

            ClinicalDomainBlock(
                title = "3. Alergias Médicas",
                onEdit = { onEditSection(findSectionIndex("alergias")) },
            ) {
                if (hasAllergies) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = CrimsonSoft,
                        border = BorderStroke(1.dp, CrimsonBorder),
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
                                tint = CrimsonAlert,
                                modifier = Modifier.size(16.dp),
                            )
                            Column {
                                Text(
                                    text = "ALERGIAS ACTIVAS DECLARADAS",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = CrimsonAlert,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = if (allergiesList.isNotBlank()) allergiesList else "Alergia declarada sin detalle",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = CrimsonAlert,
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                        }
                    }
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = null,
                            tint = EmeraldSuccess,
                            modifier = Modifier.size(14.dp),
                        )
                        Text(
                            text = "Niega alergias conocidas a medicamentos o alimentos",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF14532D),
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 4. MEDICACIÓN HABITUAL
            val takesMeds = getFieldValue("medicamentos", "toma_medicamentos") == "true"
            val medsList = getFieldValue("medicamentos", "lista_medicamentos")

            ClinicalDomainBlock(
                title = "4. Farmacoterapia Habitual",
                onEdit = { onEditSection(findSectionIndex("medicamentos")) },
            ) {
                if (takesMeds && medsList.isNotBlank()) {
                    Text(
                        text = medsList,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Medium,
                    )
                } else {
                    Text(
                        text = "Niega consumo de medicamentos habituales",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 5. ENFERMEDADES PREVIAS
            val chronic = getFieldValue("enfermedades_previas", "enfermedades_cronicas")
            val chronicDetails = getFieldValue("enfermedades_previas", "enfermedades_detalle")

            ClinicalDomainBlock(
                title = "5. Antecedentes Patológicos",
                onEdit = { onEditSection(findSectionIndex("enfermedades_previas")) },
            ) {
                if (chronic.isNotBlank() && chronic != "ninguna") {
                    Text(
                        text = "Condiciones: $chronic",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Medium,
                    )
                    if (chronicDetails.isNotBlank()) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = chronicDetails,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                } else {
                    Text(
                        text = "Sin antecedentes clínicos crónicos declarados",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 6. REVISIÓN POR SISTEMAS
            val chestPain = getFieldValue("cardiovascular", "dolor_pecho") == "true"
            val dyspnea = getFieldValue("cardiovascular", "falta_aire") == "true"
            val cough = getFieldValue("respiratorio", "tos") == "true"
            val acid = getFieldValue("digestivo", "acidez") == "true"
            val dysuria = getFieldValue("genitourinario", "dolor_orinar") == "true"

            ClinicalDomainBlock(
                title = "6. Revisión por Aparatos y Sistemas",
                onEdit = { onEditSection(findSectionIndex("cardiovascular")) },
            ) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    SystemBadge(
                        label = "Cardiovascular",
                        hasSymptom = chestPain || dyspnea,
                        symptomText = if (chestPain) "Dolor torácico" else "Disnea",
                    )
                    SystemBadge(
                        label = "Respiratorio",
                        hasSymptom = cough,
                        symptomText = "Tos >3 sem",
                    )
                    SystemBadge(
                        label = "Digestivo",
                        hasSymptom = acid,
                        symptomText = "Reflujo/Acidez",
                    )
                    SystemBadge(
                        label = "Urinario",
                        hasSymptom = dysuria,
                        symptomText = "Disuria",
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Legal Footer
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = AuSurfaceHover,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Security,
                        contentDescription = null,
                        tint = ObsidianDark,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "Documento médico digital inmutable con valor legal bajo Decreto 63. Confidencialidad bajo secreto profesional médico.",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextSecondary,
                    )
                }
            }
        }
    }
}

@Composable
private fun ClinicalDomainBlock(
    title: String,
    onEdit: () -> Unit,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                color = ObsidianDark,
                fontWeight = FontWeight.Bold,
            )
            OutlinedButton(
                onClick = onEdit,
                modifier = Modifier.height(28.dp),
                contentPadding = ButtonDefaults.TextButtonContentPadding,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = "Editar",
                        tint = AuTextTertiary,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = "Editar",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextSecondary,
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        content()
    }
}

@Composable
private fun SystemBadge(
    label: String,
    hasSymptom: Boolean,
    symptomText: String,
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (hasSymptom) CrimsonSoft else EmeraldSoft,
        border = BorderStroke(
            1.dp,
            if (hasSymptom) CrimsonBorder else EmeraldSuccess.copy(alpha = 0.3f)
        ),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                imageVector = if (hasSymptom) Icons.Default.Warning else Icons.Default.Check,
                contentDescription = null,
                tint = if (hasSymptom) CrimsonAlert else EmeraldSuccess,
                modifier = Modifier.size(12.dp),
            )
            Text(
                text = if (hasSymptom) "$label: $symptomText" else "$label: Normal",
                style = MaterialTheme.typography.labelSmall,
                color = if (hasSymptom) CrimsonAlert else Color(0xFF14532D),
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
