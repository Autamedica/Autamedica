package com.autamedica.android.presentation.videocall.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuBorderHover
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalDoctor

data class SoapEvolutionData(
    val subjective: String = "",
    val objective: String = "",
    val assessment: String = "",
    val plan: String = "",
    val cie10Code: String = "",
    val cie10Description: String = "",
)

data class Cie10Diagnosis(
    val code: String,
    val description: String,
)

val COMMON_CIE10_DIAGNOSES = listOf(
    Cie10Diagnosis("I10", "Hipertensión esencial"),
    Cie10Diagnosis("J00", "Rinofaringitis aguda"),
    Cie10Diagnosis("E11", "Diabetes mellitus tipo 2"),
    Cie10Diagnosis("G43", "Migraña"),
    Cie10Diagnosis("F41.1", "Trastorno de ansiedad generalizada"),
    Cie10Diagnosis("K21", "ERGE"),
    Cie10Diagnosis("J02.9", "Faringitis aguda, no especificada"),
    Cie10Diagnosis("J06.9", "Infección aguda de las vías respiratorias superiores"),
    Cie10Diagnosis("M54.5", "Lumbago no especificado"),
    Cie10Diagnosis("R51", "Cefalea"),
    Cie10Diagnosis("K29.7", "Gastritis, no especificada"),
    Cie10Diagnosis("B34.9", "Infección viral, no especificada"),
    Cie10Diagnosis("N39.0", "Infección de vías urinarias"),
    Cie10Diagnosis("E78.5", "Hiperlipidemia no especificada"),
    Cie10Diagnosis("J45", "Asma no especificada"),
    Cie10Diagnosis("R05", "Tos"),
    Cie10Diagnosis("R50.9", "Fiebre no especificada"),
    Cie10Diagnosis("A09", "Gastroenteritis y colitis infecciosa"),
    Cie10Diagnosis("L30.9", "Dermatitis no especificada"),
    Cie10Diagnosis("T78.4", "Alergia no especificada"),
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SoapEvolutionSheet(
    soapData: SoapEvolutionData,
    isSaving: Boolean,
    isSaved: Boolean,
    errorMessage: String? = null,
    onSoapDataChange: (SoapEvolutionData) -> Unit,
    onSaveAndFinish: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var cie10SearchQuery by remember { mutableStateOf("") }

    val filteredDiagnoses = remember(cie10SearchQuery) {
        if (cie10SearchQuery.isBlank()) {
            COMMON_CIE10_DIAGNOSES.take(8)
        } else {
            COMMON_CIE10_DIAGNOSES.filter {
                it.code.contains(cie10SearchQuery, ignoreCase = true) ||
                    it.description.contains(cie10SearchQuery, ignoreCase = true)
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = {
            if (!isSaving) onDismiss()
        },
        sheetState = sheetState,
        containerColor = AuSurface,
        dragHandle = { BottomSheetDefaults.DragHandle(color = AuBorder) },
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = PortalDoctor.copy(alpha = 0.15f),
                        modifier = Modifier.size(42.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.Assignment,
                                contentDescription = null,
                                tint = PortalDoctor,
                                modifier = Modifier.size(24.dp),
                            )
                        }
                    }
                    Column {
                        Text(
                            text = "Evolución Clínica (SOAP)",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "Cierre de consulta y registro en historia clínica",
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                    }
                }

                IconButton(
                    onClick = onDismiss,
                    enabled = !isSaving,
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Cerrar",
                        tint = AuTextTertiary,
                    )
                }
            }

            // Error banner if any
            if (!errorMessage.isNullOrBlank()) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = ErrorContainer,
                    border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.ErrorOutline,
                            contentDescription = null,
                            tint = AuDanger,
                            modifier = Modifier.size(20.dp),
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

            // SECTION S: Subjetivo
            SoapSectionCard(
                letter = "S",
                title = "Subjetivo (S)",
                subtitle = "Síntomas, motivo de consulta referido por el paciente, anamnesis.",
                value = soapData.subjective,
                onValueChange = { onSoapDataChange(soapData.copy(subjective = it)) },
                placeholder = "Ej: Paciente refiere cefalea holocraneana de 48 hs de evolución, intensidad moderada...",
            )

            // SECTION O: Objetivo
            SoapSectionCard(
                letter = "O",
                title = "Objetivo (O)",
                subtitle = "Exploración visual, hallazgos, telemetría o signos vitales.",
                value = soapData.objective,
                onValueChange = { onSoapDataChange(soapData.copy(objective = it)) },
                placeholder = "Ej: Fácies compuesta, lúcido. PA telemetría: 125/80 mmHg, FC: 74 lpm...",
            )

            // SECTION A: Apreciación / Diagnóstico con CIE-10
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = AuBackground,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth(),
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
                            color = PortalDoctor,
                            modifier = Modifier.size(24.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = "A",
                                    color = Color.White,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                        Column {
                            Text(
                                text = "Apreciación / Diagnóstico (A)",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = AuTextPrimary,
                            )
                            Text(
                                text = "Juicio clínico y diagnóstico principal con selector CIE-10.",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextTertiary,
                            )
                        }
                    }

                    // Clinical Assessment Text
                    OutlinedTextField(
                        value = soapData.assessment,
                        onValueChange = { onSoapDataChange(soapData.copy(assessment = it)) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(90.dp),
                        placeholder = {
                            Text(
                                text = "Juicio clínico médico, diagnóstico diferencial o evolución...",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextTertiary,
                            )
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = AuTextPrimary,
                            unfocusedTextColor = AuTextPrimary,
                            focusedContainerColor = AuSurface,
                            unfocusedContainerColor = AuSurface,
                            focusedBorderColor = PortalDoctor,
                            unfocusedBorderColor = AuBorder,
                        ),
                        shape = RoundedCornerShape(12.dp),
                    )

                    // CIE-10 Selector Section
                    Text(
                        text = "Codificación CIE-10",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = AuTextSecondary,
                    )

                    // Search field for CIE-10
                    OutlinedTextField(
                        value = cie10SearchQuery,
                        onValueChange = { cie10SearchQuery = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = {
                            Text(
                                text = "Buscar código o diagnóstico CIE-10...",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextTertiary,
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Search,
                                contentDescription = null,
                                tint = AuTextTertiary,
                            )
                        },
                        trailingIcon = {
                            if (cie10SearchQuery.isNotEmpty()) {
                                IconButton(onClick = { cie10SearchQuery = "" }) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Limpiar búsqueda",
                                        tint = AuTextTertiary,
                                        modifier = Modifier.size(18.dp),
                                    )
                                }
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = AuTextPrimary,
                            unfocusedTextColor = AuTextPrimary,
                            focusedContainerColor = AuSurface,
                            unfocusedContainerColor = AuSurface,
                            focusedBorderColor = PortalDoctor,
                            unfocusedBorderColor = AuBorder,
                        ),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true,
                    )

                    // Quick select common chips / suggestions
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        filteredDiagnoses.forEach { diag ->
                            val isSelected = soapData.cie10Code.equals(diag.code, ignoreCase = true)
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (isSelected) PortalDoctor.copy(alpha = 0.2f) else AuSurface,
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) PortalDoctor else AuBorder,
                                ),
                                modifier = Modifier.clickable {
                                    onSoapDataChange(
                                        soapData.copy(
                                            cie10Code = diag.code,
                                            cie10Description = diag.description,
                                        ),
                                    )
                                    cie10SearchQuery = ""
                                },
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(
                                        text = diag.code,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isSelected) PortalDoctor else AuTextPrimary,
                                    )
                                    Text(
                                        text = diag.description,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = if (isSelected) AuTextPrimary else AuTextSecondary,
                                        maxLines = 1,
                                    )
                                }
                            }
                        }
                    }

                    // Editable Fields for Custom CIE-10 Code & Description
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = soapData.cie10Code,
                            onValueChange = { onSoapDataChange(soapData.copy(cie10Code = it.uppercase())) },
                            modifier = Modifier.weight(0.35f),
                            label = { Text("CIE-10") },
                            placeholder = { Text("I10") },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = AuTextPrimary,
                                unfocusedTextColor = AuTextPrimary,
                                focusedContainerColor = AuSurface,
                                unfocusedContainerColor = AuSurface,
                                focusedBorderColor = PortalDoctor,
                                unfocusedBorderColor = AuBorder,
                            ),
                            shape = RoundedCornerShape(10.dp),
                            singleLine = true,
                        )

                        OutlinedTextField(
                            value = soapData.cie10Description,
                            onValueChange = { onSoapDataChange(soapData.copy(cie10Description = it)) },
                            modifier = Modifier.weight(0.65f),
                            label = { Text("Descripción") },
                            placeholder = { Text("Descripción clínica") },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = AuTextPrimary,
                                unfocusedTextColor = AuTextPrimary,
                                focusedContainerColor = AuSurface,
                                unfocusedContainerColor = AuSurface,
                                focusedBorderColor = PortalDoctor,
                                unfocusedBorderColor = AuBorder,
                            ),
                            shape = RoundedCornerShape(10.dp),
                            singleLine = true,
                        )
                    }
                }
            }

            // SECTION P: Plan
            SoapSectionCard(
                letter = "P",
                title = "Plan Terapéutico (P)",
                subtitle = "Indicaciones farmacológicas, estudios solicitados, pautas de alarma y control.",
                value = soapData.plan,
                onValueChange = { onSoapDataChange(soapData.copy(plan = it)) },
                placeholder = "Ej: Pautas higiénico-dietéticas, analgesia SOS. Control ambulatorio...",
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Action Buttons
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    enabled = !isSaving,
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, AuBorderHover),
                    modifier = Modifier.weight(0.35f),
                ) {
                    Text(
                        text = "Salir",
                        color = AuTextSecondary,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }

                Button(
                    onClick = onSaveAndFinish,
                    enabled = !isSaving,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalDoctor,
                        contentColor = Color.White,
                    ),
                    modifier = Modifier.weight(0.65f),
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Guardando...",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    } else if (isSaved) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Guardado",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Finalizar y Guardar Evolución",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SoapSectionCard(
    letter: String,
    title: String,
    subtitle: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuBackground,
        border = BorderStroke(1.dp, AuBorder),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = PortalDoctor,
                    modifier = Modifier.size(24.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = letter,
                            color = Color.White,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Column {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = AuTextPrimary,
                    )
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }

            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(90.dp),
                placeholder = {
                    Text(
                        text = placeholder,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = AuTextPrimary,
                    unfocusedTextColor = AuTextPrimary,
                    focusedContainerColor = AuSurface,
                    unfocusedContainerColor = AuSurface,
                    focusedBorderColor = PortalDoctor,
                    unfocusedBorderColor = AuBorder,
                ),
                shape = RoundedCornerShape(12.dp),
            )
        }
    }
}
