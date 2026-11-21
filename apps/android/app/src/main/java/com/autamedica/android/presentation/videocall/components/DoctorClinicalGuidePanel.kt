package com.autamedica.android.presentation.videocall.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.CallClinicalGuidance
import com.autamedica.android.domain.model.SuggestedClinicalQuestion
import kotlinx.coroutines.delay

// Translucent Clinical Glassmorphism palette (keeps patient visible through the HUD)
private val GlassHudSurface = Color(0xA80F172A)
private val GlassHudBorder = Color(0x4DE0F2FE)
private val GlassInnerPill = Color(0x22FFFFFF)
private val GlassInnerBorder = Color(0x33E0F2FE)
private val ClinicalSky = Color(0xFF38BDF8)
private val ClinicalPrimary = Color(0xFF0284C7)
private val ClinicalTeal = Color(0xFF0D9488)
private val ClinicalCyan = Color(0xFF06B6D4)
private val ClinicalDanger = Color(0xFFEF4444)

/**
 * Senior Clinical Guide Panel for the Doctor during a video consultation.
 *
 * Design principles:
 * 1. Translucent Clinical Glassmorphism (`#A80F172A` + luminous `#4DE0F2FE` specular border)
 *    so the patient remains visible behind the guide.
 * 2. Step-by-Step Progressive Pacing: starts compact with Patient + Chief Complaint + Quick Facts
 *    during the initial greeting, then reveals 1 priority question at a time (`1 de N`).
 *    Tapping a question (`✓`) marks it answered and smoothly advances to the next one.
 * 3. Pinned 1-Tap Clinical Action Bar (`+ Receta · + Certificado/Atestado · Dictar Nota`)
 *    always accessible with zero scrolling.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DoctorClinicalGuidePanel(
    guidance: CallClinicalGuidance,
    onOpenFicha: () -> Unit,
    modifier: Modifier = Modifier,
    patientName: String = "",
    patientDetail: String = "",
    patientQuickFacts: List<String> = emptyList(),
    countryCode: String? = null,
    onEmitPrescription: (() -> Unit)? = null,
    onEmitCertificate: (() -> Unit)? = null,
    onOpenNotes: (() -> Unit)? = null,
) {
    val questions = remember(guidance.suggestedQuestions) {
        guidance.suggestedQuestions.take(5)
    }
    var checkedQuestions by remember(questions) { mutableStateOf(setOf<Int>()) }
    var manualQuestionIdx by remember(questions) { mutableIntStateOf(0) }
    var isCollapsed by remember { mutableStateOf(false) }
    var revealQuestionStep by remember { mutableStateOf(false) }

    // Progressive pacing: wait 2.2s after mount (greeting phase) before sliding in the first question
    LaunchedEffect(questions.size) {
        if (questions.isNotEmpty() && !revealQuestionStep) {
            delay(2_200L)
            revealQuestionStep = true
        }
    }

    val motivo = guidance.chiefComplaint?.takeIf { it.isNotBlank() } ?: "Consulta médica en curso"
    val certificateLabel = if (countryCode == "BR") "Atestado" else "Certificado"
    val primaryRedFlag = guidance.redFlags.firstOrNull()

    if (isCollapsed) {
        Surface(
            shape = RoundedCornerShape(999.dp),
            color = GlassHudSurface,
            border = BorderStroke(1.dp, GlassHudBorder),
            shadowElevation = 10.dp,
            modifier = modifier.clickable { isCollapsed = false },
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.Description,
                    contentDescription = null,
                    tint = ClinicalSky,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = if (patientName.isNotBlank()) "$patientName • $motivo" else motivo,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (questions.isNotEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = GlassInnerPill,
                        border = BorderStroke(1.dp, GlassInnerBorder),
                    ) {
                        Text(
                            text = "${checkedQuestions.size}/${questions.size}",
                            color = ClinicalSky,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                        )
                    }
                }
                Icon(
                    imageVector = Icons.Default.KeyboardArrowUp,
                    contentDescription = "Mostrar guía clínica",
                    tint = Color(0xFFE0F2FE),
                    modifier = Modifier.size(18.dp),
                )
            }
        }
        return
    }

    Surface(
        shape = RoundedCornerShape(22.dp),
        color = GlassHudSurface,
        border = BorderStroke(1.dp, GlassHudBorder),
        shadowElevation = 14.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0x2438BDF8),
                            Color.Transparent,
                        ),
                    ),
                )
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // 1. Single gesture handle pill + Header (tap to open full clinical sheet)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpenFicha),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0x66E0F2FE)),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(onClick = onOpenFicha),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = "GUÍA CLÍNICA",
                            color = ClinicalSky,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                        )
                        if (patientName.isNotBlank()) {
                            Text(
                                text = "• $patientName",
                                color = Color(0xFFF1F5F9),
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            text = "Ver ficha ↗",
                            color = ClinicalSky,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Text(
                        text = motivo,
                        color = Color.White,
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (patientDetail.isNotBlank() && patientDetail != motivo) {
                        Text(
                            text = patientDetail,
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                // Single clean collapse button (eliminates duplicate up/down arrows)
                IconButton(
                    onClick = { isCollapsed = true },
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(GlassInnerPill),
                ) {
                    Icon(
                        imageVector = Icons.Default.KeyboardArrowDown,
                        contentDescription = "Minimizar guía",
                        tint = Color(0xFFE0F2FE),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            // 2. Patient Quick Facts + Primary Red Flag in a single compact row
            if (patientQuickFacts.isNotEmpty() || primaryRedFlag != null) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    patientQuickFacts.take(4).forEach { fact ->
                        val isAlert = fact.startsWith("Alergia", ignoreCase = true)
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = if (isAlert) Color(0x33EF4444) else GlassInnerPill,
                            border = BorderStroke(
                                1.dp,
                                if (isAlert) Color(0x80EF4444) else GlassInnerBorder,
                            ),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                if (isAlert) {
                                    Icon(
                                        imageVector = Icons.Filled.Warning,
                                        contentDescription = null,
                                        tint = Color(0xFFFCA5A5),
                                        modifier = Modifier.size(11.dp),
                                    )
                                }
                                Text(
                                    text = fact,
                                    color = if (isAlert) Color(0xFFFECACA) else Color(0xFFE0F2FE),
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                    if (primaryRedFlag != null && patientQuickFacts.none { it.contains(primaryRedFlag, ignoreCase = true) }) {
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = Color(0x2606B6D4),
                            border = BorderStroke(1.dp, Color(0x6606B6D4)),
                        ) {
                            Text(
                                text = primaryRedFlag,
                                color = Color(0xFFE0F2FE),
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.5.dp),
                            )
                        }
                    }
                }
            }

            // 3. Step-by-Step Progressive Single Question Card (1 question at a time)
            AnimatedVisibility(
                visible = revealQuestionStep && questions.isNotEmpty(),
                enter = fadeIn() + slideInVertically { it / 2 },
                exit = fadeOut() + slideOutVertically { it / 2 },
            ) {
                val allCompleted = checkedQuestions.size >= questions.size
                val currentIdx = manualQuestionIdx.coerceIn(0, (questions.size - 1).coerceAtLeast(0))

                if (allCompleted) {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0x260D9488),
                        border = BorderStroke(1.dp, Color(0x665EEAD4)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(onClick = onOpenFicha),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF5EEAD4),
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    text = "Guía completada (${questions.size}/${questions.size})",
                                    color = Color(0xFFCCFBF1),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            Text(
                                text = "Reiniciar",
                                color = ClinicalSky,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.clickable {
                                    checkedQuestions = emptySet()
                                    manualQuestionIdx = 0
                                },
                            )
                        }
                    }
                } else {
                    val currentQuestion = questions[currentIdx]
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(
                                    text = "Paso ${currentIdx + 1} de ${questions.size}",
                                    color = Color(0xFFE0F2FE),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    questions.indices.forEach { idx ->
                                        val isDone = checkedQuestions.contains(idx)
                                        val isCurrent = idx == currentIdx
                                        Box(
                                            modifier = Modifier
                                                .size(if (isCurrent) 7.dp else 5.dp)
                                                .clip(CircleShape)
                                                .background(
                                                    when {
                                                        isDone -> Color(0xFF2DD4BF)
                                                        isCurrent -> ClinicalSky
                                                        else -> Color(0x4DFFFFFF)
                                                    },
                                                ),
                                        )
                                    }
                                }
                            }

                            if (questions.size > 1) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                                        contentDescription = "Pregunta anterior",
                                        tint = Color(0xFFCBD5E1),
                                        modifier = Modifier
                                            .size(18.dp)
                                            .clip(CircleShape)
                                            .clickable {
                                                manualQuestionIdx = if (currentIdx > 0) currentIdx - 1 else questions.lastIndex
                                            },
                                    )
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                                        contentDescription = "Siguiente pregunta",
                                        tint = Color(0xFFCBD5E1),
                                        modifier = Modifier
                                            .size(18.dp)
                                            .clip(CircleShape)
                                            .clickable {
                                                manualQuestionIdx = (currentIdx + 1) % questions.size
                                            },
                                    )
                                }
                            }
                        }

                        AnimatedContent(
                            targetState = currentIdx to currentQuestion,
                            transitionSpec = {
                                (fadeIn() + slideInVertically { it / 3 }) togetherWith
                                    (fadeOut() + slideOutVertically { -it / 3 })
                            },
                            label = "stepQuestionTransition",
                        ) { (idx, question) ->
                            SingleStepQuestionCard(
                                question = question,
                                isChecked = checkedQuestions.contains(idx),
                                onAdvance = {
                                    val updated = checkedQuestions + idx
                                    checkedQuestions = updated
                                    val nextUnchecked = questions.indices.firstOrNull { it > idx && !updated.contains(it) }
                                        ?: questions.indices.firstOrNull { !updated.contains(it) }
                                    if (nextUnchecked != null) {
                                        manualQuestionIdx = nextUnchecked
                                    }
                                },
                            )
                        }
                    }
                }
            }

            // 4. Pinned 1-Tap Clinical Action Bar (+ Receta · + Certificado/Atestado · Dictar Nota)
            if (onEmitPrescription != null || onEmitCertificate != null || onOpenNotes != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (onEmitPrescription != null) {
                        FilledTonalButton(
                            onClick = onEmitPrescription,
                            modifier = Modifier
                                .weight(1f)
                                .height(36.dp),
                            shape = RoundedCornerShape(11.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                            colors = ButtonDefaults.filledTonalButtonColors(
                                containerColor = ClinicalPrimary.copy(alpha = 0.85f),
                                contentColor = Color.White,
                            ),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Medication,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "+ Receta",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                            )
                        }
                    }

                    if (onEmitCertificate != null) {
                        OutlinedButton(
                            onClick = onEmitCertificate,
                            modifier = Modifier
                                .weight(1f)
                                .height(36.dp),
                            shape = RoundedCornerShape(11.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = GlassInnerPill,
                                contentColor = Color.White,
                            ),
                            border = BorderStroke(1.dp, GlassInnerBorder),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Description,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "+ $certificateLabel",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                            )
                        }
                    }

                    if (onOpenNotes != null) {
                        OutlinedButton(
                            onClick = onOpenNotes,
                            modifier = Modifier
                                .weight(1f)
                                .height(36.dp),
                            shape = RoundedCornerShape(11.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = ClinicalTeal.copy(alpha = 0.30f),
                                contentColor = Color(0xFFCCFBF1),
                            ),
                            border = BorderStroke(1.dp, Color(0x662DD4BF)),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Mic,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Dictar Nota",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SingleStepQuestionCard(
    question: SuggestedClinicalQuestion,
    isChecked: Boolean,
    onAdvance: () -> Unit,
) {
    val priorityColor = when (question.priority) {
        "critical" -> ClinicalDanger
        "high" -> ClinicalCyan
        else -> ClinicalSky
    }

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = GlassInnerPill,
        border = BorderStroke(1.dp, priorityColor.copy(alpha = 0.55f)),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onAdvance),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Surface(
                shape = CircleShape,
                color = if (isChecked) ClinicalTeal else priorityColor.copy(alpha = 0.22f),
                border = BorderStroke(1.5.dp, if (isChecked) Color(0xFF5EEAD4) else priorityColor),
                modifier = Modifier.size(22.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = "Marcar pregunta y avanzar",
                        tint = if (isChecked) Color(0xFF5EEAD4) else Color.White.copy(alpha = 0.85f),
                        modifier = Modifier.size(14.dp),
                    )
                }
            }

            Text(
                text = question.question,
                color = Color.White,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                lineHeight = 17.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )

            Text(
                text = "Siguiente →",
                color = ClinicalSky,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
