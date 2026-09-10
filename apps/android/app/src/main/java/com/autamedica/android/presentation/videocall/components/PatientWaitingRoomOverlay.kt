package com.autamedica.android.presentation.videocall.components

import android.media.AudioManager
import android.media.ToneGenerator
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val GlassSurface = Color(0xEB0A1324)
private val GlassBorder = Color(0x1FFFFFFF)
private val PrimarySky = Color(0xFF0284C7)

@Composable
fun PatientWaitingRoomOverlay(
    isAudioEnabled: Boolean,
    isVideoEnabled: Boolean,
    statusMessage: String?,
    isConnecting: Boolean,
    onToggleAudio: () -> Unit,
    onToggleVideo: () -> Unit,
    onSwitchCamera: () -> Unit,
    onJoinOrRetry: () -> Unit,
    onCancelCall: () -> Unit = {},
    onExit: () -> Unit,
    modifier: Modifier = Modifier,
    doctorName: String = "Dr. Felipe Silva",
    doctorRole: String = "Clínica Médica & Telemedicina",
    doctorCrm: String = "CRM/SP 184.920",
    clinicName: String = "AUTAMEDICA",
    preconsultationReason: String = "",
    preconsultationSymptoms: String = "",
    preconsultationEvolution: String = "",
    isPreconsultationSaved: Boolean = false,
    onReasonSelected: (String) -> Unit = {},
    onSymptomsChanged: (String) -> Unit = {},
    onEvolutionSelected: (String) -> Unit = {},
    onSavePreconsultation: () -> Unit = {},
) {
    var showPreconsultationSection by remember { mutableStateOf(!isPreconsultationSaved) }

    // Tono de timbrado de llamada saliente ("Llamando al médico...")
    DisposableEffect(isConnecting) {
        var toneGen: ToneGenerator? = null
        if (isConnecting) {
            try {
                toneGen = ToneGenerator(AudioManager.STREAM_MUSIC, 85)
                toneGen.startTone(ToneGenerator.TONE_SUP_RINGTONE)
            } catch (_: Throwable) {
                // Fallback silencioso si el dispositivo bloquea el canal de audio
            }
        }
        onDispose {
            try {
                toneGen?.stopTone()
                toneGen?.release()
            } catch (_: Throwable) {}
        }
    }

    Box(
        modifier = modifier.fillMaxSize(),
    ) {
        // ── 1. Background Gradient Overlays (Full-Bleed Vignette) ──
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp)
                .align(Alignment.TopCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Black.copy(alpha = 0.80f), Color.Transparent),
                    ),
                ),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(220.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.88f)),
                    ),
                ),
        )

        // ── 2. Unified Header (FaceTime / Uber Style, Zero Dotted Lines, Zero Generic Logos) ──
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .align(Alignment.TopCenter),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Row 1: Exit Button + AutaMedica Brand [Left] | "En espera" Status [Right]
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    IconButton(
                        onClick = onExit,
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Color(0x66000000)),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = "Salir",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                    }

                    Text(
                        text = "AutaMedica",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        letterSpacing = (-0.3).sp,
                    )
                }

                // Minimalist Room Status (Green Dot + Text)
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0x66000000),
                    border = BorderStroke(1.dp, Color(0x33FFFFFF)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF22C55E)),
                        )
                        Text(
                            text = "En espera",
                            color = Color(0xFFF1F5F9),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            // Row 2: Doctor Identity Strip (Clean Frosted Glass Pill)
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0x88000000),
                border = BorderStroke(1.dp, Color(0x26FFFFFF)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
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
                            color = Color(0x3338BDF8),
                            border = BorderStroke(1.dp, Color(0x4D38BDF8)),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Filled.Person,
                                    contentDescription = null,
                                    tint = Color(0xFF38BDF8),
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }

                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = doctorName,
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(
                                    text = doctorRole,
                                    color = Color(0xFF38BDF8),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false),
                                )
                                if (doctorCrm.isNotBlank()) {
                                    Text(
                                        text = "• $doctorCrm",
                                        color = Color(0xFF94A3B8),
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 10.sp,
                                        maxLines = 1,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── 4. Preconsultation Bottom Sheet Section (Uber / Nubank Style) ──
        AnimatedVisibility(
            visible = showPreconsultationSection,
            enter = fadeIn(tween(200)),
            exit = fadeOut(tween(200)),
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.60f))
                    .clickable { showPreconsultationSection = false },
            )
        }

        AnimatedVisibility(
            visible = showPreconsultationSection,
            enter = slideInVertically(tween(250)) { it } + fadeIn(tween(250)),
            exit = slideOutVertically(tween(200)) { it } + fadeOut(tween(200)),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
        ) {
            PatientPreconsultationSection(
                doctorName = doctorName,
                doctorRole = doctorRole,
                doctorCrm = doctorCrm,
                selectedReason = preconsultationReason,
                symptomsDescription = preconsultationSymptoms,
                isSaved = isPreconsultationSaved,
                onReasonSelected = onReasonSelected,
                onSymptomsChanged = onSymptomsChanged,
                onSavePreconsultation = {
                    onSavePreconsultation()
                    showPreconsultationSection = false
                },
                onClose = {
                    showPreconsultationSection = false
                },
            )
        }

        // ── 5. Floating Action Dock (Lower Peripheral HUD when preconsultation is collapsed) ──
        AnimatedVisibility(
            visible = !showPreconsultationSection,
            enter = fadeIn() + slideInVertically { it },
            exit = fadeOut() + slideOutVertically { it },
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Floating Media Control Pill (iOS / Nubank level)
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = GlassSurface,
                    border = BorderStroke(1.dp, GlassBorder),
                    shadowElevation = 16.dp,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(
                            onClick = onToggleAudio,
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(if (isAudioEnabled) Color(0x26FFFFFF) else Color(0xFFDC2626)),
                        ) {
                            Icon(
                                imageVector = if (isAudioEnabled) Icons.Filled.Mic else Icons.Filled.MicOff,
                                contentDescription = "Audio",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                        }

                        IconButton(
                            onClick = onToggleVideo,
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(if (isVideoEnabled) Color(0x26FFFFFF) else Color(0xFFDC2626)),
                        ) {
                            Icon(
                                imageVector = if (isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                                contentDescription = "Video",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                        }

                        IconButton(
                            onClick = onSwitchCamera,
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(Color(0x26FFFFFF)),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Refresh,
                                contentDescription = "Invertir cámara",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }

                // Preconsultation Summary Button / Pill
                Surface(
                    onClick = { showPreconsultationSection = true },
                    shape = RoundedCornerShape(999.dp),
                    color = GlassSurface,
                    border = BorderStroke(
                        1.dp,
                        if (isPreconsultationSaved) Color(0x4D10B981) else Color(0x3338BDF8),
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f, fill = false),
                        ) {
                            Icon(
                                imageVector = if (isPreconsultationSaved) Icons.Filled.Check else Icons.Outlined.Description,
                                contentDescription = null,
                                tint = if (isPreconsultationSaved) Color(0xFF10B981) else Color(0xFF38BDF8),
                                modifier = Modifier.size(15.dp),
                            )
                            Text(
                                text = if (isPreconsultationSaved) {
                                    val cleanReason = preconsultationReason
                                        .replace("Motivo:", "")
                                        .replace("Motivo", "")
                                        .trim()
                                    if (cleanReason.isNotBlank()) "Ficha lista: $cleanReason" else "Ficha previa lista"
                                } else {
                                    "Ficha médica (opcional)"
                                },
                                color = Color.White,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            text = if (isPreconsultationSaved) "Editar" else "Completar",
                            color = Color(0xFF38BDF8),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                // Primary CTA: "Llamar al médico" vs "Cancelar llamada" (Colgar)
                if (isConnecting) {
                    Button(
                        onClick = onCancelCall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFDC2626),
                            contentColor = Color.White,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CallEnd,
                            contentDescription = "Cancelar llamada",
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Cancelar llamada",
                            fontSize = 13.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                } else {
                    Button(
                        onClick = onJoinOrRetry,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PrimarySky,
                            contentColor = Color.White,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Videocam,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Llamar al médico",
                            fontSize = 13.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                // Microcopy Legal / Compliance
                Text(
                    text = "Al llamar al médico, aceptás los Términos de Teleasistencia Médica.",
                    color = Color(0xFF94A3B8),
                    fontSize = 9.5.sp,
                    lineHeight = 12.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }
    }
}
