package com.autamedica.android.presentation.videocall.components

import android.content.Intent
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.CallClinicalGuidance
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.presentation.videocall.ClinicalSheetPanel

private val HudBg = Color(0xF20F172A)
private val HudBorder = Color(0x33FFFFFF)
private val HudAccent = Color(0xFF38BDF8)
private val HudTeal = Color(0xFF0D9488)
private val HudAmber = Color(0xFFFBBF24)
private val HudAmberText = Color(0xFFFDE68A)
private val HudDanger = Color(0xFFEF4444)
private val HudSlate = Color(0xFF94A3B8)
private val HudSlateLight = Color(0xFFE2E8F0)
private val HudChipBg = Color(0x14FFFFFF)
private val HudChipBorder = Color(0x26FFFFFF)
private val HudSurfaceAlt = Color(0xFF1E293B)

/** Banda inferior reservada para el dock de controles (colgar siempre accesible). */
private val ReservedDockDp = 160.dp

/**
 * HUD clínico del médico durante la call.
 *
 * - [ClinicalSheetPanel.GUIDANCE]: reposo compacto (DoctorClinicalGuidePanel canónico,
 *   0 taps). El chevron sube al detent.
 * - RESUMEN / PREGUNTAS / NOTAS: sheet NO modal con pestañas que morfea desde el reposo
 *   y deja el video visible arriba. Drag del header: abajo→detent medio (44%), más→colapsa
 *   al reposo; arriba→detent completo (85%).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClinicalHudLayer(
    panel: ClinicalSheetPanel,
    guidance: CallClinicalGuidance,
    clinicalContext: PatientClinicalContext?,
    fallbackMotivo: String?,
    patientName: String,
    hasPatient: Boolean,
    isLoading: Boolean,
    consultationNotes: String,
    initialNotes: String?,
    isSavingNotes: Boolean,
    notesSaved: Boolean,
    onNotesChange: (String) -> Unit,
    onSaveNotes: () -> Unit,
    onRequestPanelChange: (ClinicalSheetPanel) -> Unit,
    modifier: Modifier = Modifier,
    onOpenSoap: (() -> Unit)? = null,
    onEmitPrescription: (() -> Unit)? = null,
    onEmitCertificate: (() -> Unit)? = null,
) {
    val isSheet = panel != ClinicalSheetPanel.GUIDANCE
    val sheetFullH = (LocalConfiguration.current.screenHeightDp.dp - ReservedDockDp)
    val sheetMidH = (LocalConfiguration.current.screenHeightDp * 0.44f).dp
    val density = LocalDensity.current
    val midOffsetPx = with(density) { (sheetFullH - sheetMidH).toPx() }

    var anchorFull by remember { mutableStateOf(true) }
    var dragAccumPx by remember { mutableFloatStateOf(0f) }

    val baseOffsetPx by animateFloatAsState(
        targetValue = if (anchorFull) 0f else midOffsetPx,
        animationSpec = spring(stiffness = 500f),
        label = "clinicalSheetBase",
    )
    val visualOffsetPx = baseOffsetPx + dragAccumPx

    // Al abrir el sheet (desde reposo) arranca en detent medio.
    LaunchedEffect(isSheet) {
        if (isSheet) anchorFull = false
    }

    fun settle() {
        val total = baseOffsetPx + dragAccumPx
        dragAccumPx = 0f
        when {
            // Jalado muy abajo desde el detent medio: colapsa al reposo.
            !anchorFull && total > midOffsetPx + midOffsetPx * 0.55f -> {
                anchorFull = false
                onRequestPanelChange(ClinicalSheetPanel.GUIDANCE)
            }
            !anchorFull && total < midOffsetPx * 0.25f -> anchorFull = true
            anchorFull && total > midOffsetPx * 0.55f -> anchorFull = false
        }
    }

    // El drag vive SOLO en el header: el contenido (scroll/pestañas/notas) mantiene
    // sus gestos propios sin conflicto.
    val headerDragModifier = Modifier.pointerInput(isSheet) {
        if (!isSheet) return@pointerInput
        detectVerticalDragGestures(
            onVerticalDrag = { _, dragAmount ->
                dragAccumPx = (dragAccumPx + dragAmount)
                    .coerceIn(-midOffsetPx, midOffsetPx * 2f)
            },
            onDragEnd = { settle() },
            onDragCancel = { dragAccumPx = 0f },
        )
    }

    val motivo = guidance.chiefComplaint?.takeIf { it.isNotBlank() }
        ?: fallbackMotivo?.takeIf { it.isNotBlank() }
        ?: "Motivo sin cargar"

    Box(modifier = modifier.fillMaxWidth()) {
        AnimatedVisibility(
            visible = !isSheet,
            enter = fadeIn(),
            exit = fadeOut() + slideOutVertically { it / 3 },
            modifier = Modifier.fillMaxWidth(),
        ) {
            DoctorClinicalGuidePanel(
                guidance = guidance,
                onOpenFicha = { onRequestPanelChange(ClinicalSheetPanel.RESUMEN) },
            )
        }

        AnimatedVisibility(
            visible = isSheet,
            enter = fadeIn() + slideInVertically { it / 3 },
            exit = fadeOut(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            SheetSurface(
                panel = panel,
                guidance = guidance,
                clinicalContext = clinicalContext,
                motivo = motivo,
                patientName = patientName,
                hasPatient = hasPatient,
                isLoading = isLoading,
                consultationNotes = consultationNotes,
                initialNotes = initialNotes,
                isSavingNotes = isSavingNotes,
                notesSaved = notesSaved,
                onNotesChange = onNotesChange,
                onSaveNotes = onSaveNotes,
                onRequestPanelChange = onRequestPanelChange,
                anchorFull = anchorFull,
                onExpand = { anchorFull = true },
                onCollapse = {
                    if (anchorFull) anchorFull = false else onRequestPanelChange(ClinicalSheetPanel.GUIDANCE)
                },
                onClose = { onRequestPanelChange(ClinicalSheetPanel.GUIDANCE) },
                onOpenSoap = onOpenSoap,
                onEmitPrescription = {
                    onRequestPanelChange(ClinicalSheetPanel.GUIDANCE)
                    onEmitPrescription?.invoke()
                },
                onEmitCertificate = {
                    onRequestPanelChange(ClinicalSheetPanel.GUIDANCE)
                    onEmitCertificate?.invoke()
                },
                headerDragModifier = headerDragModifier,
                modifier = Modifier
                    .graphicsLayer { translationY = visualOffsetPx }
                    .height(if (isSheet) sheetFullH else 0.dp),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SheetSurface(
    panel: ClinicalSheetPanel,
    guidance: CallClinicalGuidance,
    clinicalContext: PatientClinicalContext?,
    motivo: String,
    patientName: String,
    hasPatient: Boolean,
    isLoading: Boolean,
    consultationNotes: String,
    initialNotes: String?,
    isSavingNotes: Boolean,
    notesSaved: Boolean,
    onNotesChange: (String) -> Unit,
    onSaveNotes: () -> Unit,
    onRequestPanelChange: (ClinicalSheetPanel) -> Unit,
    anchorFull: Boolean,
    onExpand: () -> Unit,
    onCollapse: () -> Unit,
    onClose: () -> Unit,
    onOpenSoap: (() -> Unit)?,
    onEmitPrescription: () -> Unit,
    onEmitCertificate: () -> Unit,
    headerDragModifier: Modifier,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        color = HudBg,
        border = BorderStroke(1.dp, HudBorder),
        shadowElevation = 20.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.fillMaxWidth().imePadding()) {
            SheetHeader(
                patientName = patientName,
                motivo = motivo,
                clinicalContext = clinicalContext,
                isLoading = isLoading,
                anchorFull = anchorFull,
                onExpand = onExpand,
                onCollapse = onCollapse,
                onClose = onClose,
                dragModifier = headerDragModifier,
            )

            SheetTabs(
                panel = panel,
                onSelectTab = onRequestPanelChange,
            )

            when (panel) {
                ClinicalSheetPanel.RESUMEN -> SheetResumen(
                    context = clinicalContext,
                    motivo = motivo,
                    onEmitPrescription = onEmitPrescription,
                    onEmitCertificate = onEmitCertificate,
                )
                ClinicalSheetPanel.PREGUNTAS -> SheetPreguntas(
                    guidance = guidance,
                    onEmitPrescription = onEmitPrescription,
                    onEmitCertificate = onEmitCertificate,
                )
                ClinicalSheetPanel.NOTAS -> SheetNotas(
                    consultationNotes = consultationNotes,
                    initialNotes = initialNotes,
                    isSaving = isSavingNotes,
                    isSaved = notesSaved,
                    onNotesChange = onNotesChange,
                    onSaveNotes = onSaveNotes,
                    onOpenSoap = onOpenSoap,
                    onClose = onClose,
                )
                ClinicalSheetPanel.GUIDANCE -> Unit
            }
        }
    }
}

@Composable
private fun SheetHeader(
    patientName: String,
    motivo: String,
    clinicalContext: PatientClinicalContext?,
    isLoading: Boolean,
    anchorFull: Boolean,
    onExpand: () -> Unit,
    onCollapse: () -> Unit,
    onClose: () -> Unit,
    dragModifier: Modifier = Modifier,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(dragModifier)
            .padding(start = 16.dp, top = 12.dp, end = 8.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "GUÍA DE CONSULTA",
                    color = HudAccent,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                )
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(10.dp), strokeWidth = 1.5.dp, color = HudAccent)
                }
            }
            Text(
                text = patientName.ifBlank { "Paciente" },
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = motivo,
                    color = HudSlateLight,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                clinicalContext?.ageYears?.let { age ->
                    HudChip(text = "$age años", borderColor = HudBorder)
                }
                clinicalContext?.anamnesisCompletion?.takeIf { it > 0 }?.let { pct ->
                    HudChip(text = "Anamnesis $pct%", borderColor = HudAccent.copy(alpha = 0.6f), textColor = HudAccent)
                }
            }
        }

        IconButton(onClick = if (anchorFull) onCollapse else onExpand) {
            Icon(
                imageVector = if (anchorFull) Icons.Filled.KeyboardArrowDown else Icons.Filled.KeyboardArrowUp,
                contentDescription = if (anchorFull) "Contraer" else "Expandir",
                tint = HudSlate,
            )
        }
        IconButton(onClick = onClose) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = "Volver a la guía compacta",
                tint = HudSlate,
            )
        }
    }
}

@Composable
private fun SheetTabs(
    panel: ClinicalSheetPanel,
    onSelectTab: (ClinicalSheetPanel) -> Unit,
) {
    val tabs = listOf(
        ClinicalSheetPanel.RESUMEN to "Resumen",
        ClinicalSheetPanel.PREGUNTAS to "Preguntas",
        ClinicalSheetPanel.NOTAS to "Notas",
    )
    Row(modifier = Modifier.fillMaxWidth()) {
        tabs.forEach { (tab, label) ->
            val selected = panel == tab
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp))
                    .background(if (selected) HudChipBg else Color.Transparent)
                    .clickable { onSelectTab(tab) }
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = label,
                    color = if (selected) Color.White else HudSlate,
                    fontSize = 12.sp,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                )
                Spacer(modifier = Modifier.height(3.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.45f)
                        .height(2.dp)
                        .clip(CircleShape)
                        .background(if (selected) HudAccent else Color.Transparent),
                )
            }
        }
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(HudChipBorder),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SheetResumen(
    context: PatientClinicalContext?,
    motivo: String,
    onEmitPrescription: () -> Unit,
    onEmitCertificate: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        SheetSection(title = "REPARTO DE LA ENFERMEDAD ACTUAL", accent = HudAccent, icon = Icons.Outlined.MedicalServices) {
            val relato = context?.presentIllness?.takeIf { it.isNotBlank() }
                ?: context?.chiefComplaint?.takeIf { it.isNotBlank() }
                ?: motivo.takeIf { it != "Motivo sin cargar" }
                ?: "Sin relato de la enfermedad actual cargado"
            Text(
                text = relato,
                color = if (relato.startsWith("Sin ")) HudSlate else Color.White,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontStyle = if (relato.startsWith("Sin ")) FontStyle.Italic else FontStyle.Normal,
            )
        }

        SheetSection(title = "ANTECEDENTES FISIOLÓGICOS", accent = HudTeal, icon = Icons.Outlined.MedicalServices) {
            SheetListChips(items = context?.physiologicalHistory.orEmpty())
        }

        SheetSection(title = "ANTECEDENTES PATOLÓGICOS", accent = HudTeal, icon = Icons.Outlined.MedicalServices) {
            SheetListChips(items = context?.pathologicalHistory.orEmpty())
        }

        SheetSection(title = "ANTECEDENTES FAMILIARES", accent = HudTeal, icon = Icons.Outlined.MedicalServices) {
            SheetListChips(items = context?.familyHistory.orEmpty())
        }

        SheetSection(title = "MEDICACIÓN ACTUAL", accent = HudAccent, icon = Icons.Outlined.Medication) {
            val med = context?.medications?.takeIf { it.isNotBlank() }
            val medFallback = if (context?.hasAnamnesis == true) {
                "Sin medicación registrada"
            } else {
                "Sin anamnesis compartida"
            }
            Text(
                text = med ?: medFallback,
                color = if (med != null) Color.White else HudSlate,
                fontSize = 13.sp,
                fontStyle = if (med != null) FontStyle.Normal else FontStyle.Italic,
            )
        }

        SheetSection(title = "ALERGIAS", accent = HudDanger, icon = Icons.Filled.Warning) {
            val allergies = context?.allergies.orEmpty().filter { it.isNotBlank() }
            if (allergies.isEmpty()) {
                Text("Sin alergias registradas", color = HudSlate, fontSize = 12.sp, fontStyle = FontStyle.Italic)
            } else {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    allergies.forEach { allergy ->
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = HudDanger.copy(alpha = 0.14f),
                            border = BorderStroke(1.dp, HudDanger.copy(alpha = 0.55f)),
                        ) {
                            Text(
                                text = allergy,
                                color = Color(0xFFFCA5A5),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            )
                        }
                    }
                }
            }
        }

        SheetActionsRow(
            onEmitPrescription = onEmitPrescription,
            onEmitCertificate = onEmitCertificate,
        )
    }
}

@Composable
private fun SheetPreguntas(
    guidance: CallClinicalGuidance,
    onEmitPrescription: () -> Unit,
    onEmitCertificate: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (guidance.suggestedQuestions.isEmpty()) {
            Text(
                text = "Sin preguntas sugeridas aún. Siga el relato y las alertas de la guía.",
                color = HudSlate,
                fontSize = 13.sp,
                fontStyle = FontStyle.Italic,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                guidance.suggestedQuestions.forEach { q ->
                    val accent = when (q.priority) {
                        "critical" -> HudDanger
                        "high" -> HudAmber
                        else -> HudAccent
                    }
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = HudChipBg,
                        border = BorderStroke(1.dp, HudChipBorder),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Box(
                                modifier = Modifier
                                    .padding(top = 4.dp)
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(accent),
                            )
                            Text(
                                text = q.question,
                                color = HudSlateLight,
                                fontSize = 13.sp,
                                lineHeight = 18.sp,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }

        SheetActionsRow(
            onEmitPrescription = onEmitPrescription,
            onEmitCertificate = onEmitCertificate,
        )
    }
}

@Composable
private fun SheetActionsRow(
    onEmitPrescription: () -> Unit,
    onEmitCertificate: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Button(
            onClick = onEmitPrescription,
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF0284C7),
                contentColor = Color.White,
            ),
        ) {
            Icon(Icons.Outlined.Medication, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("Receta", fontSize = 13.sp)
        }
        OutlinedButton(
            onClick = onEmitCertificate,
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
            border = BorderStroke(1.dp, HudBorder),
        ) {
            Icon(Icons.Outlined.Description, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("Atestado", fontSize = 13.sp)
        }
    }
}

@Composable
private fun SheetNotas(
    consultationNotes: String,
    initialNotes: String?,
    isSaving: Boolean,
    isSaved: Boolean,
    onNotesChange: (String) -> Unit,
    onSaveNotes: () -> Unit,
    onOpenSoap: (() -> Unit)?,
    onClose: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!initialNotes.isNullOrBlank()) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = HudSurfaceAlt,
                border = BorderStroke(1.dp, HudBorder),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "MOTIVO / ANTECEDENTES REPORTADOS",
                        color = HudSlate,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = initialNotes,
                        color = HudSlateLight,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                    )
                }
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val dictation = rememberLiveDictation(onFinalText = { final ->
                onNotesChange(
                    consultationNotes.let { if (it.isBlank()) final else "$it $final" },
                )
            })
            IconButton(
                onClick = dictation.toggle,
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(
                        when (dictation.state.value) {
                            DictationState.LISTENING -> HudDanger.copy(alpha = 0.85f)
                            DictationState.UNAVAILABLE -> HudSurfaceAlt
                            DictationState.IDLE -> HudChipBg
                        },
                    ),
            ) {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = if (dictation.state.value == DictationState.LISTENING) "Detener dictado" else "Dictar notas por voz",
                    tint = when (dictation.state.value) {
                        DictationState.LISTENING -> Color.White
                        DictationState.UNAVAILABLE -> HudSlate
                        DictationState.IDLE -> Color.White
                    },
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (dictation.state.value == DictationState.LISTENING) "Escuchando..." else "Dictado en vivo",
                    color = if (dictation.state.value == DictationState.LISTENING) Color.White else HudSlateLight,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                when (dictation.state.value) {
                    DictationState.UNAVAILABLE -> Text(
                        text = "No disponible en esta llamada: escriba la evolución.",
                        color = HudAmberText,
                        fontSize = 11.sp,
                    )
                    DictationState.LISTENING -> Text(
                        text = dictation.liveText.value.ifBlank { "Hable con naturalidad..." },
                        color = HudSlate,
                        fontSize = 11.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    DictationState.IDLE -> Text(
                        text = "Transcripción on-device sin salir del video.",
                        color = HudSlate,
                        fontSize = 11.sp,
                    )
                }
            }
        }

        OutlinedTextField(
            value = consultationNotes,
            onValueChange = onNotesChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp),
            placeholder = {
                Text(
                    text = "Escriba la evolución clínica, indicaciones, diagnóstico presuntivo o plan terapéutico...",
                    color = HudSlate,
                    fontSize = 12.sp,
                )
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedContainerColor = HudSurfaceAlt,
                unfocusedContainerColor = HudSurfaceAlt,
                focusedBorderColor = HudAccent,
                unfocusedBorderColor = HudBorder,
            ),
            shape = RoundedCornerShape(14.dp),
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (isSaved) {
                    Text("Guardado en ficha médica", color = Color(0xFF22C55E), fontSize = 11.sp, fontWeight = FontWeight.Medium)
                } else {
                    Text("Registro cifrado", color = HudSlate, fontSize = 11.sp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (onOpenSoap != null) {
                    OutlinedButton(
                        onClick = onOpenSoap,
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, HudAccent),
                    ) {
                        Text("SOAP", color = HudAccent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Button(
                    onClick = onSaveNotes,
                    enabled = !isSaving && consultationNotes.isNotBlank(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = HudTeal, contentColor = Color.White),
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    } else {
                        Text("Guardar evolución", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
    }
}

@Composable
private fun SheetSection(
    title: String,
    accent: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(imageVector = icon, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
            Text(
                text = title,
                color = accent,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
        }
        content()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SheetListChips(items: List<String>) {
    val filtered = items.filter { it.isNotBlank() }
    if (filtered.isEmpty()) {
        Text("Sin antecedentes registrados", color = HudSlate, fontSize = 12.sp, fontStyle = FontStyle.Italic)
        return
    }
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        filtered.forEach { item ->
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = HudChipBg,
                border = BorderStroke(1.dp, HudChipBorder),
            ) {
                Text(
                    text = item,
                    color = HudSlateLight,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun HudChip(
    text: String,
    borderColor: Color = HudBorder,
    textColor: Color = HudSlateLight,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = HudChipBg,
        border = BorderStroke(1.dp, borderColor),
    ) {
        Text(
            text = text,
            color = textColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

private enum class DictationState { IDLE, LISTENING, UNAVAILABLE }

private class LiveDictationHandler(
    val state: androidx.compose.runtime.MutableState<DictationState>,
    val liveText: androidx.compose.runtime.MutableState<String>,
    val onToggle: () -> Unit,
) {
    val toggle: () -> Unit get() = onToggle
}

@Composable
private fun rememberLiveDictation(onFinalText: (String) -> Unit): LiveDictationHandler {
    val context = LocalContext.current
    val state = remember { mutableStateOf(DictationState.IDLE) }
    val liveText = remember { mutableStateOf("") }

    val recognizer = remember {
        runCatching { SpeechRecognizer.createSpeechRecognizer(context) }.getOrNull()
    }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { recognizer?.destroy() }
        }
    }

    val recognitionListener = remember(state, liveText) {
        object : RecognitionListener {
            override fun onReadyForSpeech(params: android.os.Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: android.os.Bundle?) {
                val partials = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = partials?.lastOrNull()?.takeIf { it.isNotBlank() }
                if (text != null) liveText.value = text
            }
            override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
            override fun onResults(results: android.os.Bundle?) {
                val finals = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = finals?.firstOrNull()?.takeIf { it.isNotBlank() }
                state.value = DictationState.IDLE
                liveText.value = ""
                if (text != null) onFinalText(text)
            }
            override fun onError(error: Int) {
                state.value = if (error in unavailableCodes) DictationState.UNAVAILABLE else DictationState.IDLE
                liveText.value = ""
            }
        }
    }

    DisposableEffect(recognizer, recognitionListener) {
        recognizer?.setRecognitionListener(recognitionListener)
        onDispose {
            runCatching { recognizer?.setRecognitionListener(null) }
        }
    }

    fun toggle() {
        when (state.value) {
            DictationState.LISTENING -> {
                runCatching { recognizer?.stopListening() }
                state.value = DictationState.IDLE
            }
            DictationState.UNAVAILABLE -> state.value = DictationState.IDLE
            DictationState.IDLE -> {
                if (recognizer == null) {
                    state.value = DictationState.UNAVAILABLE
                    return
                }
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-AR")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                }
                runCatching {
                    recognizer.startListening(intent)
                    state.value = DictationState.LISTENING
                    liveText.value = ""
                }.onFailure {
                    state.value = DictationState.UNAVAILABLE
                }
            }
        }
    }

    return remember(state, recognizer) {
        LiveDictationHandler(
            state = state,
            liveText = liveText,
            onToggle = { toggle() },
        )
    }
}

private val unavailableCodes = setOf(
    SpeechRecognizer.ERROR_AUDIO,
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS,
    SpeechRecognizer.ERROR_NETWORK,
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY,
    SpeechRecognizer.ERROR_SERVER,
)