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
import androidx.compose.ui.res.stringResource
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
                        Button(onClick = onBack) { Text(stringResource(com.autamedica.android.R.string.common_back)) }
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
            val sectionFields = getSectionFieldDefinitions(currentSection.section)
            val validationHint = getSectionValidationHint(currentSection.section)
            val readOnlyMessage = uiState.readOnlyMessage
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
                    Spacer(modifier = Modifier.height(8.dp))
                    StatusChip(
                        text = anamnesisStatusLabel(uiState.summary),
                        color = when {
                            uiState.summary?.status.equals("approved", ignoreCase = true) -> Color(0xFF14532D)
                            uiState.summary?.status.equals("under_review", ignoreCase = true) -> Color(0xFF1D4ED8)
                            uiState.summary?.locked == true -> Color(0xFF7F1D1D)
                            else -> AuSurfaceHover
                        },
                    )
                }

                if (readOnlyMessage != null) {
                    item {
                        InlineNotice(
                            text = readOnlyMessage,
                            backgroundColor = Color(0xFF1E293B),
                            contentColor = Color(0xFFE2E8F0),
                        )
                    }
                }

                if (validationHint != null && !uiState.isReadOnly) {
                    item {
                        InlineNotice(
                            text = validationHint,
                            backgroundColor = AuSurfaceHover,
                            contentColor = AuTextSecondary,
                        )
                    }
                }

                items(sectionFields.size) { index ->
                    val field = sectionFields[index]
                    SectionField(
                        label = buildString {
                            append(field.label)
                            if (field.required) append(" *")
                        },
                        value = uiState.fieldValues[field.key] ?: "",
                        hint = field.hint,
                        isError = uiState.fieldErrors.containsKey(field.key),
                        errorText = uiState.fieldErrors[field.key],
                        enabled = !uiState.isReadOnly,
                        onValueChange = { onFieldChange(field.key, it) },
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
                            Text(stringResource(com.autamedica.android.R.string.common_previous))
                        }
                    } else {
                        Spacer(modifier = Modifier.width(1.dp))
                    }

                    if (uiState.isReadOnly) {
                        Text(
                            text = "Solo lectura",
                            style = MaterialTheme.typography.labelLarge,
                            color = AuTextTertiary,
                            fontWeight = FontWeight.Medium,
                        )
                    } else if (uiState.isLastSection && uiState.allSectionsCompleted && !uiState.hasUnsavedChanges) {
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
                            Text(stringResource(com.autamedica.android.R.string.health_submit_anamnesis), color = Color.White)
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
                                text = when {
                                    uiState.isLastSection && uiState.hasUnsavedChanges -> stringResource(com.autamedica.android.R.string.common_save_changes)
                                    uiState.isLastSection -> stringResource(com.autamedica.android.R.string.common_save)
                                    else -> stringResource(com.autamedica.android.R.string.common_next)
                                },
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
    isError: Boolean,
    errorText: String?,
    enabled: Boolean,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        label = { Text(label) },
        placeholder = { Text(hint, color = AuTextTertiary) },
        modifier = modifier.fillMaxWidth(),
        isError = isError,
        supportingText = {
            if (errorText != null) {
                Text(errorText, color = Color(0xFFDC2626))
            }
        },
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = AuTextPrimary,
            unfocusedTextColor = AuTextPrimary,
            cursorColor = AuAccent,
            focusedBorderColor = AuAccent,
            unfocusedBorderColor = AuBorder,
            errorBorderColor = Color(0xFFDC2626),
            errorLabelColor = Color(0xFFDC2626),
            focusedLabelColor = AuAccent,
            unfocusedLabelColor = AuTextSecondary,
            focusedContainerColor = AuSurface,
            unfocusedContainerColor = AuSurface,
        ),
        shape = RoundedCornerShape(8.dp),
    )
}

@Composable
private fun StatusChip(
    text: String,
    color: Color,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = color.copy(alpha = 0.12f),
        border = BorderStroke(1.dp, color.copy(alpha = 0.3f)),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = color,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun InlineNotice(
    text: String,
    backgroundColor: Color,
    contentColor: Color,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = backgroundColor,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = contentColor,
            modifier = Modifier.padding(12.dp),
        )
    }
}
