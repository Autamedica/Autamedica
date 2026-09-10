package com.autamedica.android.presentation.health

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

// Dark Obsidian & Premium Tokens
private val ObsidianDark = Color(0xFF09090B)
private val ObsidianCard = Color(0xFF18181B)
private val EmeraldSuccess = Color(0xFF16A34A)
private val EmeraldSoft = Color(0xFFDCFCE7)

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
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = "Anamnesis",
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        if (uiState.sections.isNotEmpty()) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = ObsidianDark,
                            ) {
                                Text(
                                    text = "${uiState.currentSectionIndex + 1}/${uiState.sections.size}",
                                    color = Color.White,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
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
                actions = {
                    if (uiState.sections.isNotEmpty()) {
                        // Switch between Wizard (Paso a paso) and Overview (Secciones)
                        Text(
                            text = if (uiState.displayMode == AnamnesisDisplayMode.WIZARD) "Ver Todo" else "Paso a Paso",
                            style = MaterialTheme.typography.labelMedium,
                            color = AuAccent,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .clickable {
                                    val nextMode = if (uiState.displayMode == AnamnesisDisplayMode.WIZARD) {
                                        AnamnesisDisplayMode.OVERVIEW
                                    } else {
                                        AnamnesisDisplayMode.WIZARD
                                    }
                                    viewModel.switchMode(nextMode)
                                }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
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
                    onGoToSection = { index ->
                        viewModel.goToSection(index)
                        if (uiState.displayMode == AnamnesisDisplayMode.OVERVIEW) {
                            viewModel.switchMode(AnamnesisDisplayMode.WIZARD)
                        }
                    },
                    onSubmit = viewModel::submitAnamnesis,
                    onDismissSuccess = viewModel::dismissSaveSuccess,
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
    onDismissSuccess: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val completed = uiState.completedSectionsCount
    val total = uiState.sections.size.coerceAtLeast(1)
    val progress = (completed.toFloat() / total).coerceIn(0f, 1f)

    Column(modifier = modifier.fillMaxSize()) {
        // Clinical Progress Bar with completion percentage pill
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(AuSurface)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Paso ${uiState.currentSectionIndex + 1} de $total",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                )
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (completed == total) EmeraldSoft else AuSurfaceHover,
                    border = BorderStroke(1.dp, if (completed == total) EmeraldSuccess.copy(alpha = 0.4f) else AuBorder),
                ) {
                    Text(
                        text = "${uiState.completionPercentage}% completado",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (completed == total) EmeraldSuccess else AuAccent,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                    )
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp),
                color = if (completed == total) EmeraldSuccess else AuAccent,
                trackColor = AuBorder.copy(alpha = 0.2f),
            )
        }

        // Horizontal Section Tabs
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(uiState.sections) { index, section ->
                SectionChip(
                    label = AnamnesisSection.shortLabel(section.section),
                    isSelected = index == uiState.currentSectionIndex,
                    isCompleted = section.completed,
                    onClick = { onGoToSection(index) },
                )
            }
        }

        // Success message banner (Feedback visual claro al guardar cada sección)
        AnimatedVisibility(
            visible = uiState.saveSuccessMessage != null,
            enter = fadeIn() + slideInVertically(),
            exit = fadeOut() + slideOutVertically(),
        ) {
            val message = uiState.saveSuccessMessage.orEmpty()
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                shape = RoundedCornerShape(10.dp),
                color = EmeraldSoft,
                border = BorderStroke(1.dp, EmeraldSuccess.copy(alpha = 0.4f)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = EmeraldSuccess,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF14532D),
                            fontWeight = FontWeight.Medium,
                        )
                    }
                    IconButton(onClick = onDismissSuccess, modifier = Modifier.size(20.dp)) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Cerrar",
                            tint = Color(0xFF14532D),
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
            }
        }

        if (uiState.displayMode == AnamnesisDisplayMode.OVERVIEW) {
            // OVERVIEW MODE: List all 13 sections with clinical category and progress
            AnamnesisOverviewList(
                sections = uiState.sections,
                currentSectionIndex = uiState.currentSectionIndex,
                onSelectSection = onGoToSection,
                modifier = Modifier.weight(1f),
            )
        } else {
            // WIZARD MODE: Active section with rich field inputs
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
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    item {
                        Column {
                            val category = AnamnesisSection.category(currentSection.section)
                            val subtitle = AnamnesisSection.subtitle(currentSection.section)

                            Text(
                                text = category.uppercase(),
                                style = MaterialTheme.typography.labelSmall,
                                color = AuAccent,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = AnamnesisSection.displayName(currentSection.section),
                                style = MaterialTheme.typography.titleLarge,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                            if (subtitle.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = subtitle,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = AuTextSecondary,
                                )
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                StatusChip(
                                    text = anamnesisStatusLabel(uiState.summary),
                                    color = when {
                                        uiState.summary?.status.equals("approved", ignoreCase = true) -> Color(0xFF14532D)
                                        uiState.summary?.status.equals("under_review", ignoreCase = true) -> Color(0xFF1D4ED8)
                                        uiState.summary?.locked == true -> Color(0xFF7F1D1D)
                                        else -> AuSurfaceHover
                                    },
                                )
                                if (currentSection.completed) {
                                    Surface(
                                        shape = RoundedCornerShape(999.dp),
                                        color = EmeraldSoft,
                                        border = BorderStroke(1.dp, EmeraldSuccess.copy(alpha = 0.3f)),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = null,
                                                tint = EmeraldSuccess,
                                                modifier = Modifier.size(12.dp),
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(
                                                text = "Completada",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = EmeraldSuccess,
                                                fontWeight = FontWeight.Bold,
                                            )
                                        }
                                    }
                                }
                            }
                        }
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

                    // Render visible section fields
                    items(sectionFields.size) { index ->
                        val field = sectionFields[index]
                        val isVisible = if (field.dependsOnKey != null) {
                            uiState.fieldValues[field.dependsOnKey]?.trim() == field.dependsOnValue
                        } else {
                            true
                        }

                        if (isVisible) {
                            AnamnesisFieldRenderer(
                                field = field,
                                value = uiState.fieldValues[field.key] ?: "",
                                isError = uiState.fieldErrors.containsKey(field.key),
                                errorText = uiState.fieldErrors[field.key],
                                enabled = !uiState.isReadOnly,
                                onValueChange = { onFieldChange(field.key, it) },
                            )
                        }
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
                if (!uiState.isFirstSection && uiState.displayMode == AnamnesisDisplayMode.WIZARD) {
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
                        colors = ButtonDefaults.buttonColors(containerColor = EmeraldSuccess),
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
                        colors = ButtonDefaults.buttonColors(containerColor = ObsidianDark),
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

@Composable
private fun AnamnesisOverviewList(
    sections: List<AnamnesisSection>,
    currentSectionIndex: Int,
    onSelectSection: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                text = "Estructura de la Historia Clínica (13 Pasos)",
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Podés completar las secciones en orden o seleccionar cualquiera para revisar su contenido.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        itemsIndexed(sections) { index, section ->
            val isCurrent = index == currentSectionIndex
            val isCompleted = section.completed
            val category = AnamnesisSection.category(section.section)
            val displayName = AnamnesisSection.displayName(section.section)
            val subtitle = AnamnesisSection.subtitle(section.section)

            Surface(
                onClick = { onSelectSection(index) },
                shape = RoundedCornerShape(12.dp),
                color = when {
                    isCurrent -> ObsidianDark
                    isCompleted -> AuSurfaceHover
                    else -> AuSurface
                },
                border = BorderStroke(
                    width = 1.dp,
                    color = when {
                        isCurrent -> ObsidianDark
                        isCompleted -> EmeraldSuccess.copy(alpha = 0.5f)
                        else -> AuBorder
                    },
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = category.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isCurrent) AuAccent else AuTextTertiary,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp,
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "${index + 1}. $displayName",
                            style = MaterialTheme.typography.titleSmall,
                            color = if (isCurrent) Color.White else AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        if (subtitle.isNotBlank()) {
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (isCurrent) Color.White.copy(alpha = 0.7f) else AuTextSecondary,
                            )
                        }
                    }
                    if (isCompleted) {
                        Surface(
                            shape = CircleShape,
                            color = EmeraldSuccess,
                            modifier = Modifier.size(24.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(14.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AnamnesisFieldRenderer(
    field: AnamnesisFieldDefinition,
    value: String,
    isError: Boolean,
    errorText: String?,
    enabled: Boolean,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val displayLabel = buildString {
        append(field.label)
        if (field.required) append(" *")
    }

    Column(modifier = modifier.fillMaxWidth()) {
        when (field.type) {
            FieldType.BOOLEAN -> {
                Text(
                    text = displayLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    val isYesSelected = value.trim() == "true"
                    val isNoSelected = value.trim() == "false"

                    Surface(
                        onClick = { if (enabled) onValueChange("true") },
                        shape = RoundedCornerShape(10.dp),
                        color = if (isYesSelected) ObsidianDark else AuSurface,
                        border = BorderStroke(1.dp, if (isYesSelected) ObsidianDark else AuBorder),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            if (isYesSelected) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp),
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                            }
                            Text(
                                text = "Sí",
                                color = if (isYesSelected) Color.White else AuTextPrimary,
                                fontWeight = if (isYesSelected) FontWeight.Bold else FontWeight.Medium,
                            )
                        }
                    }

                    Surface(
                        onClick = { if (enabled) onValueChange("false") },
                        shape = RoundedCornerShape(10.dp),
                        color = if (isNoSelected) ObsidianDark else AuSurface,
                        border = BorderStroke(1.dp, if (isNoSelected) ObsidianDark else AuBorder),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            if (isNoSelected) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp),
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                            }
                            Text(
                                text = "No",
                                color = if (isNoSelected) Color.White else AuTextPrimary,
                                fontWeight = if (isNoSelected) FontWeight.Bold else FontWeight.Medium,
                            )
                        }
                    }
                }
            }

            FieldType.SELECT -> {
                Text(
                    text = displayLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    field.options.forEach { option ->
                        val isSelected = value.trim() == option.value
                        Surface(
                            onClick = { if (enabled) onValueChange(option.value) },
                            shape = RoundedCornerShape(10.dp),
                            color = if (isSelected) ObsidianDark else AuSurface,
                            border = BorderStroke(1.dp, if (isSelected) ObsidianDark else AuBorder),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = option.label,
                                    color = if (isSelected) Color.White else AuTextPrimary,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                if (isSelected) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            FieldType.MULTISELECT -> {
                Text(
                    text = displayLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                val selectedValues = parseMultiSelectValues(value)
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    field.options.forEach { option ->
                        val isSelected = selectedValues.contains(option.value)
                        Surface(
                            onClick = {
                                if (enabled) {
                                    val nextValue = toggleMultiSelectValue(value, option.value)
                                    onValueChange(nextValue)
                                }
                            },
                            shape = RoundedCornerShape(20.dp),
                            color = if (isSelected) ObsidianDark else AuSurface,
                            border = BorderStroke(1.dp, if (isSelected) ObsidianDark else AuBorder),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (isSelected) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(14.dp),
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                }
                                Text(
                                    text = option.label,
                                    color = if (isSelected) Color.White else AuTextPrimary,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                )
                            }
                        }
                    }
                }
            }

            FieldType.SCALE -> {
                val selectedNum = value.toIntOrNull()
                Text(
                    text = displayLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = field.scaleMinLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                    Text(
                        text = field.scaleMaxLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(field.scaleMax - field.scaleMin + 1) { offset ->
                        val num = field.scaleMin + offset
                        val isSelected = selectedNum == num

                        Surface(
                            onClick = { if (enabled) onValueChange(num.toString()) },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) ObsidianDark else AuSurface,
                            border = BorderStroke(1.dp, if (isSelected) ObsidianDark else AuBorder),
                            modifier = Modifier.size(44.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = num.toString(),
                                    color = if (isSelected) Color.White else AuTextPrimary,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                }
            }

            FieldType.DATE -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    enabled = enabled,
                    label = { Text(displayLabel) },
                    placeholder = { Text(if (field.hint.isNotBlank()) field.hint else "AAAA-MM-DD", color = AuTextTertiary) },
                    trailingIcon = {
                        Icon(
                            imageVector = Icons.Default.DateRange,
                            contentDescription = null,
                            tint = AuTextTertiary,
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    isError = isError,
                    supportingText = {
                        if (errorText != null) {
                            Text(errorText, color = Color(0xFFDC2626))
                        }
                    },
                    colors = outlinedColors(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true,
                )
            }

            FieldType.TEXTAREA -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    enabled = enabled,
                    label = { Text(displayLabel) },
                    placeholder = { Text(field.hint, color = AuTextTertiary) },
                    modifier = Modifier.fillMaxWidth(),
                    isError = isError,
                    minLines = 3,
                    maxLines = 6,
                    supportingText = {
                        if (errorText != null) {
                            Text(errorText, color = Color(0xFFDC2626))
                        }
                    },
                    colors = outlinedColors(),
                    shape = RoundedCornerShape(10.dp),
                )
            }

            FieldType.TEXT, FieldType.NUMBER -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    enabled = enabled,
                    label = { Text(displayLabel) },
                    placeholder = { Text(field.hint, color = AuTextTertiary) },
                    modifier = Modifier.fillMaxWidth(),
                    isError = isError,
                    singleLine = field.type != FieldType.TEXTAREA,
                    supportingText = {
                        if (errorText != null) {
                            Text(errorText, color = Color(0xFFDC2626))
                        }
                    },
                    colors = outlinedColors(),
                    shape = RoundedCornerShape(10.dp),
                )
            }
        }

        if (errorText != null && field.type in listOf(FieldType.BOOLEAN, FieldType.SELECT, FieldType.MULTISELECT, FieldType.SCALE)) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = errorText,
                color = Color(0xFFDC2626),
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun outlinedColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = AuTextPrimary,
    unfocusedTextColor = AuTextPrimary,
    cursorColor = ObsidianDark,
    focusedBorderColor = ObsidianDark,
    unfocusedBorderColor = AuBorder,
    errorBorderColor = Color(0xFFDC2626),
    errorLabelColor = Color(0xFFDC2626),
    focusedLabelColor = ObsidianDark,
    unfocusedLabelColor = AuTextSecondary,
    focusedContainerColor = AuSurface,
    unfocusedContainerColor = AuSurface,
)

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
            isSelected -> ObsidianDark
            isCompleted -> EmeraldSoft
            else -> AuSurfaceHover
        },
        border = BorderStroke(
            width = 1.dp,
            color = when {
                isSelected -> ObsidianDark
                isCompleted -> EmeraldSuccess.copy(alpha = 0.5f)
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
                    tint = EmeraldSuccess,
                )
                Spacer(modifier = Modifier.width(4.dp))
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = when {
                    isSelected -> Color.White
                    isCompleted -> Color(0xFF15803D)
                    else -> AuTextSecondary
                },
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
            )
        }
    }
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

private fun parseMultiSelectValues(raw: String?): Set<String> {
    if (raw.isNullOrBlank()) return emptySet()
    return raw.split(",").map { it.trim() }.filter { it.isNotEmpty() }.toSet()
}

private fun toggleMultiSelectValue(currentRaw: String?, valueToToggle: String): String {
    val current = parseMultiSelectValues(currentRaw).toMutableSet()
    if (valueToToggle == "ninguna" || valueToToggle == "ninguno") {
        return if (current.contains(valueToToggle)) "" else valueToToggle
    }
    current.remove("ninguna")
    current.remove("ninguno")
    if (current.contains(valueToToggle)) {
        current.remove(valueToToggle)
    } else {
        current.add(valueToToggle)
    }
    return current.joinToString(",")
}

