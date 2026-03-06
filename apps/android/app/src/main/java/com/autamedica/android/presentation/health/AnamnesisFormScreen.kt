package com.autamedica.android.presentation.health

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.AnamnesisSection
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnamnesisFormScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AnamnesisFormViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(uiState.submitted) {
        if (uiState.submitted) onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Anamnesis",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
                            tint = AuTextPrimary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBackground),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = AuAccent)
                }
            }
            uiState.error != null && uiState.sections.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = uiState.error ?: "Error desconocido",
                            color = Color(0xFFB91C1C),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = onBack) { Text("Volver") }
                    }
                }
            }
            else -> {
                AnamnesisFormContent(
                    uiState = uiState,
                    onFieldChange = viewModel::updateField,
                    onSaveAndNext = viewModel::saveAndNext,
                    onPrevious = viewModel::goToPrevious,
                    onGoToSection = viewModel::goToSection,
                    onSubmit = viewModel::submitAnamnesis,
                    modifier = Modifier.padding(innerPadding),
                )
            }
        }
    }
}

@Composable
private fun AnamnesisFormContent(
    uiState: AnamnesisFormUiState,
    onFieldChange: (String, String) -> Unit,
    onSaveAndNext: () -> Unit,
    onPrevious: () -> Unit,
    onGoToSection: (Int) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val completed = uiState.sections.count { it.completed }
    val total = uiState.sections.size.coerceAtLeast(1)
    val progress = completed.toFloat() / total

    Column(modifier = modifier.fillMaxSize()) {
        // Progress bar
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp),
            color = AuAccent,
            trackColor = AuSurfaceHover,
        )

        // Section tabs
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(uiState.sections) { index, section ->
                SectionChip(
                    label = AnamnesisSection.displayName(section.section),
                    isSelected = index == uiState.currentSectionIndex,
                    isCompleted = section.completed,
                    onClick = { onGoToSection(index) },
                )
            }
        }

        // Section content
        val currentSection = uiState.currentSection
        if (currentSection != null) {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Text(
                        text = AnamnesisSection.displayName(currentSection.section),
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Seccion ${uiState.currentSectionIndex + 1} de ${uiState.sections.size}",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }

                val fields = getSectionFields(currentSection.section)
                items(fields.size) { index ->
                    val (key, label, hint) = fields[index]
                    SectionField(
                        label = label,
                        value = uiState.fieldValues[key] ?: "",
                        hint = hint,
                        onValueChange = { onFieldChange(key, it) },
                    )
                }

                if (uiState.error != null) {
                    item {
                        Text(
                            text = uiState.error,
                            color = Color(0xFFB91C1C),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            // Bottom navigation buttons
            Surface(
                color = AuSurface,
                tonalElevation = 4.dp,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (!uiState.isFirstSection) {
                        OutlinedButton(
                            onClick = onPrevious,
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = AuTextSecondary),
                            border = BorderStroke(1.dp, AuBorder),
                        ) {
                            Text("Anterior")
                        }
                    } else {
                        Spacer(modifier = Modifier.width(1.dp))
                    }

                    if (uiState.isLastSection && uiState.allSectionsCompleted) {
                        Button(
                            onClick = onSubmit,
                            enabled = !uiState.isSubmitting,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                        ) {
                            if (uiState.isSubmitting) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Text("Enviar Anamnesis", color = Color.White)
                        }
                    } else {
                        Button(
                            onClick = onSaveAndNext,
                            enabled = !uiState.isSaving,
                            colors = ButtonDefaults.buttonColors(containerColor = AuAccent),
                        ) {
                            if (uiState.isSaving) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Text(
                                text = if (uiState.isLastSection) "Guardar" else "Siguiente",
                                color = Color.White,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionChip(
    label: String,
    isSelected: Boolean,
    isCompleted: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        color = when {
            isSelected -> AuAccent.copy(alpha = 0.15f)
            isCompleted -> Color(0xFF052E16)
            else -> AuSurfaceHover
        },
        border = BorderStroke(
            width = 1.dp,
            color = when {
                isSelected -> AuAccent
                isCompleted -> Color(0xFF16A34A)
                else -> AuBorder
            },
        ),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (isCompleted) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = Color(0xFF16A34A),
                )
                Spacer(modifier = Modifier.width(4.dp))
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = when {
                    isSelected -> AuAccent
                    isCompleted -> Color(0xFF4ADE80)
                    else -> AuTextSecondary
                },
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
            )
        }
    }
}

@Composable
private fun SectionField(
    label: String,
    value: String,
    hint: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = { Text(hint, color = AuTextTertiary) },
        modifier = modifier.fillMaxWidth(),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = AuTextPrimary,
            unfocusedTextColor = AuTextPrimary,
            cursorColor = AuAccent,
            focusedBorderColor = AuAccent,
            unfocusedBorderColor = AuBorder,
            focusedLabelColor = AuAccent,
            unfocusedLabelColor = AuTextSecondary,
            focusedContainerColor = AuSurface,
            unfocusedContainerColor = AuSurface,
        ),
        shape = RoundedCornerShape(8.dp),
    )
}

private data class FieldDef(val key: String, val label: String, val hint: String)

private fun getSectionFields(section: String): List<FieldDef> = when (section) {
    "personal_info" -> listOf(
        FieldDef("blood_type", "Grupo Sanguineo", "Ej: A+, O-, AB+"),
        FieldDef("emergency_contact_name", "Contacto de Emergencia", "Nombre completo"),
        FieldDef("emergency_contact_phone", "Telefono de Emergencia", "+54 11 1234-5678"),
        FieldDef("occupation", "Ocupacion", "Ej: Ingeniero, Docente"),
    )
    "allergies" -> listOf(
        FieldDef("medication_allergies", "Alergias a Medicamentos", "Ej: Penicilina, Ibuprofeno"),
        FieldDef("food_allergies", "Alergias Alimentarias", "Ej: Frutos secos, Mariscos"),
        FieldDef("environmental_allergies", "Alergias Ambientales", "Ej: Polen, Polvo, Acaros"),
        FieldDef("other_allergies", "Otras Alergias", "Latex, Picaduras, etc."),
    )
    "current_medications" -> listOf(
        FieldDef("medications", "Medicamentos Actuales", "Nombre, dosis, frecuencia"),
        FieldDef("supplements", "Suplementos y Vitaminas", "Ej: Vitamina D, Omega 3"),
        FieldDef("natural_remedies", "Remedios Naturales", "Ej: Valeriana, Melatonina"),
    )
    "medical_conditions" -> listOf(
        FieldDef("chronic_conditions", "Enfermedades Cronicas", "Ej: Diabetes, Hipertension"),
        FieldDef("past_conditions", "Enfermedades Pasadas Relevantes", "Ej: Hepatitis, Dengue"),
        FieldDef("mental_health", "Salud Mental", "Ej: Ansiedad, Depresion (tratada/actual)"),
        FieldDef("disabilities", "Discapacidades", "Si aplica"),
    )
    "surgical_history" -> listOf(
        FieldDef("surgeries", "Cirugias Previas", "Tipo, fecha aproximada, hospital"),
        FieldDef("hospitalizations", "Internaciones", "Motivo, duracion, fecha"),
        FieldDef("anesthesia_reactions", "Reacciones a Anestesia", "Si tuvo alguna reaccion"),
    )
    "family_history" -> listOf(
        FieldDef("cardiovascular", "Enfermedades Cardiovasculares", "Familiar y parentesco"),
        FieldDef("cancer", "Cancer", "Tipo, familiar y parentesco"),
        FieldDef("diabetes_family", "Diabetes", "Familiar y parentesco"),
        FieldDef("other_hereditary", "Otras Enfermedades Hereditarias", "Detalle"),
    )
    "lifestyle" -> listOf(
        FieldDef("smoking", "Tabaquismo", "No fumador / Ex fumador / Actual (cantidad)"),
        FieldDef("alcohol", "Alcohol", "No consume / Ocasional / Regular"),
        FieldDef("exercise", "Actividad Fisica", "Tipo, frecuencia semanal"),
        FieldDef("diet", "Alimentacion", "Tipo de dieta, restricciones"),
        FieldDef("sleep", "Patron de Sueno", "Horas promedio, calidad"),
    )
    else -> listOf(
        FieldDef("notes", "Notas", "Ingrese informacion relevante"),
    )
}
