package com.autamedica.android.presentation.videocall.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.CallClinicalGuidance
import com.autamedica.android.domain.model.SuggestedClinicalQuestion

/**
 * Panel clínico permanente en call del médico.
 * Prioriza motivo, alertas y preguntas guía — no controles de media.
 */
@Composable
fun DoctorClinicalGuidePanel(
    guidance: CallClinicalGuidance,
    onOpenFicha: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var checkedQuestions by remember { mutableStateOf(setOf<Int>()) }
    val visibleQuestions = guidance.suggestedQuestions.take(4)
    val motivo = guidance.chiefComplaint?.takeIf { it.isNotBlank() } ?: "Motivo sin cargar"

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = Color(0xF20F172A),
        border = BorderStroke(1.dp, Color(0x33FFFFFF)),
        shadowElevation = 12.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpenFicha),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "GUÍA DE CONSULTA",
                        color = Color(0xFF38BDF8),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                    )
                    Text(
                        text = motivo,
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Icon(
                    imageVector = Icons.Filled.KeyboardArrowUp,
                    contentDescription = "Abrir ficha completa",
                    tint = Color(0xFFCBD5E1),
                )
            }

            if (guidance.redFlags.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    guidance.redFlags.take(3).forEach { flag ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Warning,
                                contentDescription = null,
                                tint = Color(0xFFFBBF24),
                                modifier = Modifier.size(13.dp),
                            )
                            Text(
                                text = flag,
                                color = Color(0xFFFDE68A),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }

            if (visibleQuestions.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.HelpOutline,
                            contentDescription = null,
                            tint = Color(0xFF94A3B8),
                            modifier = Modifier.size(13.dp),
                        )
                        Text(
                            text = "Preguntar ahora",
                            color = Color(0xFF94A3B8),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    visibleQuestions.forEachIndexed { index, question ->
                        GuideQuestionRow(
                            question = question,
                            checked = checkedQuestions.contains(index),
                            onToggle = {
                                checkedQuestions = if (checkedQuestions.contains(index)) {
                                    checkedQuestions - index
                                } else {
                                    checkedQuestions + index
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GuideQuestionRow(
    question: SuggestedClinicalQuestion,
    checked: Boolean,
    onToggle: () -> Unit,
) {
    val priorityColor = when (question.priority) {
        "critical" -> Color(0xFFEF4444)
        "high" -> Color(0xFFF59E0B)
        else -> Color(0xFF38BDF8)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0x14FFFFFF))
            .clickable(onClick = onToggle)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .padding(top = 2.dp)
                .size(18.dp)
                .clip(CircleShape)
                .background(if (checked) Color(0xFF0D9488) else Color.Transparent)
                .then(
                    if (!checked) {
                        Modifier.background(Color.Transparent)
                    } else {
                        Modifier
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = Color(0xFF5EEAD4),
                    modifier = Modifier.size(18.dp),
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(Color.Transparent)
                        .padding(0.dp),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color.Transparent,
                        border = BorderStroke(1.5.dp, priorityColor.copy(alpha = 0.8f)),
                        modifier = Modifier.size(16.dp),
                    ) {}
                }
            }
        }
        Text(
            text = question.question,
            color = if (checked) Color(0xFF64748B) else Color(0xFFF1F5F9),
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            textDecoration = if (checked) TextDecoration.LineThrough else TextDecoration.None,
            modifier = Modifier.weight(1f),
            lineHeight = 16.sp,
        )
    }
}
