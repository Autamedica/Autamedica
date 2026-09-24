package com.autamedica.android.presentation.videocall.components

import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

private data class ClinicalReasonItem(
    val key: String,
    val labelRes: Int,
)

private val ClinicalReasonItems = listOf(
    ClinicalReasonItem("Dolor", R.string.videocall_reason_pain),
    ClinicalReasonItem("Control", R.string.videocall_reason_control),
    ClinicalReasonItem("Receta", R.string.videocall_reason_prescription),
    ClinicalReasonItem("Estudios", R.string.videocall_reason_tests),
)

@Composable
fun PatientPreconsultationSection(
    doctorName: String,
    doctorRole: String,
    doctorCrm: String,
    selectedReason: String,
    symptomsDescription: String,
    isSaved: Boolean,
    onReasonSelected: (String) -> Unit,
    onSymptomsChanged: (String) -> Unit,
    onSavePreconsultation: () -> Unit,
    modifier: Modifier = Modifier,
    onClose: (() -> Unit)? = null,
) {
    val scrollState = rememberScrollState()

    var isRecording by remember { mutableStateOf(false) }
    var hasAudioRecording by remember { mutableStateOf(false) }
    var isPlaying by remember { mutableStateOf(false) }
    var recordingDurationSeconds by remember { mutableIntStateOf(0) }

    LaunchedEffect(isRecording) {
        if (isRecording) {
            recordingDurationSeconds = 0
            while (isRecording && recordingDurationSeconds < 90) {
                delay(1000)
                recordingDurationSeconds++
            }
            if (recordingDurationSeconds >= 90) {
                isRecording = false
                hasAudioRecording = true
            }
        }
    }

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            delay((recordingDurationSeconds * 1000L).coerceAtLeast(3000L))
            isPlaying = false
        }
    }

    val buttonColor by animateColorAsState(
        targetValue = if (isSaved) Color(0xFF10B981) else Color(0xFF0284C7),
        animationSpec = tween(300),
        label = "saveButtonColor",
    )

    // Modal Blanco / Light Mode Nivel Nubank & Apple Health
    Surface(
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 24.dp,
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 20.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Drag Handle (Nubank / iOS style)
            Box(
                modifier = Modifier
                    .size(width = 40.dp, height = 4.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFCBD5E1))
                    .align(Alignment.CenterHorizontally),
            )

            // Header: Doctor + Close Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier.weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = stringResource(R.string.videocall_preconsultation_sheet_title),
                        color = Color(0xFF0F172A),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.3).sp,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = doctorName,
                            color = Color(0xFF475569),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (doctorCrm.isNotBlank()) {
                            Text(
                                text = "•",
                                color = Color(0xFF94A3B8),
                                fontSize = 11.sp,
                            )
                            Text(
                                text = doctorCrm,
                                color = Color(0xFF64748B),
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                            )
                        }
                    }
                }

                if (onClose != null) {
                    IconButton(
                        onClick = onClose,
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFF1F5F9)),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.videocall_close),
                            tint = Color(0xFF475569),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }

            // ── Relato de Voz Clínico (Clean Card) ──
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = when {
                    isRecording -> Color(0xFFFEF2F2)
                    hasAudioRecording -> Color(0xFFF0FDF4)
                    else -> Color(0xFFF8FAFC)
                },
                border = BorderStroke(
                    1.dp,
                    when {
                        isRecording -> Color(0xFFFCA5A5)
                        hasAudioRecording -> Color(0xFF86EFAC)
                        else -> Color(0xFFE2E8F0)
                    },
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    if (!isRecording && !hasAudioRecording) {
                        // Estado 1: Idle
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.weight(1f),
                            ) {
                                Surface(
                                    modifier = Modifier.size(36.dp),
                                    shape = CircleShape,
                                    color = Color(0xFFE0F2FE),
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = Icons.Filled.Mic,
                                            contentDescription = null,
                                            tint = Color(0xFF0284C7),
                                            modifier = Modifier.size(18.dp),
                                        )
                                    }
                                }
                                Column {
                                    Text(
                                        text = stringResource(R.string.videocall_audio_symptoms_title),
                                        color = Color(0xFF0F172A),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = stringResource(R.string.videocall_audio_symptoms_subtitle),
                                        color = Color(0xFF64748B),
                                        fontSize = 11.sp,
                                    )
                                }
                            }

                            Button(
                                onClick = { isRecording = true },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFF0284C7),
                                    contentColor = Color.White,
                                ),
                                shape = RoundedCornerShape(999.dp),
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp),
                                modifier = Modifier.height(36.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Mic,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = stringResource(R.string.videocall_record_audio),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                )
                            }
                        }
                    } else if (isRecording) {
                        // Estado 2: Recording (Live timer & dynamic wave)
                        val pulseTransition = rememberInfiniteTransition(label = "recPulse")
                        val pulseScale by pulseTransition.animateFloat(
                            initialValue = 0.85f,
                            targetValue = 1.25f,
                            animationSpec = infiniteRepeatable(
                                animation = tween(500),
                                repeatMode = RepeatMode.Reverse,
                            ),
                            label = "scale",
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(10.dp)
                                        .scale(pulseScale)
                                        .clip(CircleShape)
                                        .background(Color(0xFFEF4444)),
                                )
                                val mins = recordingDurationSeconds / 60
                                val secs = recordingDurationSeconds % 60
                                Text(
                                    text = String.format("%02d:%02d", mins, secs),
                                    color = Color(0xFFDC2626),
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }

                            // Waveform animado
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(3.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                            ) {
                                val heights = listOf(6, 12, 20, 10, 24, 14, 8, 18, 22, 12, 18, 8, 18, 10)
                                heights.forEachIndexed { i, h ->
                                    val barH = (h * (0.6f + (i % 3) * 0.2f)).dp
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .height(barH)
                                            .clip(RoundedCornerShape(1.dp))
                                            .background(Color(0xFFEF4444)),
                                    )
                                }
                            }

                            IconButton(
                                onClick = {
                                    isRecording = false
                                    hasAudioRecording = true
                                },
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFFEF4444)),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Stop,
                                    contentDescription = stringResource(R.string.videocall_stop_recording),
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    } else {
                        // Estado 3: Recorded (Inline Player)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.weight(1f),
                            ) {
                                IconButton(
                                    onClick = { isPlaying = !isPlaying },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF0284C7)),
                                ) {
                                    Icon(
                                        imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                                        contentDescription = stringResource(R.string.videocall_play_audio),
                                        tint = Color.White,
                                        modifier = Modifier.size(20.dp),
                                    )
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Text(
                                            text = if (isPlaying) stringResource(R.string.videocall_playing_audio) else stringResource(R.string.videocall_audio_attached),
                                            color = Color(0xFF0F172A),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 1,
                                        )
                                        val mins = recordingDurationSeconds / 60
                                        val secs = recordingDurationSeconds % 60
                                        Text(
                                            text = String.format("%02d:%02d", mins, secs),
                                            color = Color(0xFF15803D),
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }

                                    // Waveform bars
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(2.5.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(top = 3.dp),
                                    ) {
                                        val heights = listOf(5, 10, 16, 8, 14, 20, 10, 7, 16, 12, 6, 14, 18, 9, 6, 12)
                                        heights.forEachIndexed { i, h ->
                                            val isPlayed = isPlaying && (i < (heights.size * 0.5f))
                                            Box(
                                                modifier = Modifier
                                                    .width(3.dp)
                                                    .height((h * 0.65f).dp)
                                                    .clip(RoundedCornerShape(1.dp))
                                                    .background(if (isPlayed) Color(0xFF0284C7) else Color(0xFF94A3B8)),
                                            )
                                        }
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.width(8.dp))

                            IconButton(
                                onClick = {
                                    hasAudioRecording = false
                                    isRecording = false
                                    isPlaying = false
                                    recordingDurationSeconds = 0
                                },
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFFFEE2E2)),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.DeleteOutline,
                                    contentDescription = stringResource(R.string.videocall_rerecord_audio),
                                    tint = Color(0xFFDC2626),
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }
                }
            }

            // ── Motivo de Consulta: Segmented Control Nubank ──
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = stringResource(R.string.videocall_main_reason),
                    color = Color(0xFF0F172A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ClinicalReasonItems.forEach { item ->
                        val isSelected = selectedReason.startsWith(item.key) || selectedReason == item.key
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) Color(0xFF0284C7) else Color(0xFFF1F5F9),
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) Color(0xFF0284C7) else Color(0xFFE2E8F0),
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .clickable { onReasonSelected(item.key) },
                        ) {
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier.padding(vertical = 10.dp),
                            ) {
                                Text(
                                    text = stringResource(item.labelRes),
                                    color = if (isSelected) Color.White else Color(0xFF334155),
                                    fontSize = 12.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    maxLines = 1,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                }
            }

            // ── Notas Clínicas Integradas ──
            OutlinedTextField(
                value = symptomsDescription,
                onValueChange = onSymptomsChanged,
                placeholder = {
                    Text(
                        text = stringResource(R.string.videocall_additional_notes_placeholder),
                        color = Color(0xFF94A3B8),
                        fontSize = 12.sp,
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color(0xFF0F172A),
                    unfocusedTextColor = Color(0xFF0F172A),
                    focusedContainerColor = Color(0xFFF8FAFC),
                    unfocusedContainerColor = Color(0xFFF8FAFC),
                    focusedBorderColor = Color(0xFF0284C7),
                    unfocusedBorderColor = Color(0xFFE2E8F0),
                    cursorColor = Color(0xFF0284C7),
                ),
                maxLines = 2,
            )

            // ── Botón de Confirmación ──
            Button(
                onClick = onSavePreconsultation,
                colors = ButtonDefaults.buttonColors(
                    containerColor = buttonColor,
                    contentColor = Color.White,
                ),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                if (isSaved) {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.videocall_preconsultation_saved_badge),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.5.sp,
                    )
                } else {
                    Text(
                        text = stringResource(R.string.videocall_confirm_and_continue),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.5.sp,
                    )
                }
            }
        }
    }
}
