package com.autamedica.android.presentation.videocall.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients

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
    onExit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        shape = RoundedCornerShape(24.dp),
        color = AuSurface.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 20.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Badge
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = PortalPatients.copy(alpha = 0.15f),
                border = BorderStroke(1.dp, PortalPatients.copy(alpha = 0.35f)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Surface(
                        modifier = Modifier.size(7.dp),
                        shape = CircleShape,
                        color = AuSuccess,
                    ) {}
                    Text(
                        text = "SALA DE ESPERA VIRTUAL",
                        style = MaterialTheme.typography.labelSmall,
                        color = PortalPatients,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                    )
                }
            }

            // Title & Status
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = "Consultorio AutaMedica",
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = statusMessage ?: "Tu cámara y micrófono están listos. Te conectarás con tu profesional en cuanto inicie la sesión.",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                    textAlign = TextAlign.Center,
                )
            }

            // Media Preview & Device Controls
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = AuBackground,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Audio toggle
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        IconButton(
                            onClick = onToggleAudio,
                            modifier = Modifier
                                .size(42.dp)
                                .background(
                                    if (isAudioEnabled) PortalPatients.copy(alpha = 0.18f) else Color.Red.copy(alpha = 0.2f),
                                    CircleShape,
                                ),
                        ) {
                            Icon(
                                imageVector = if (isAudioEnabled) Icons.Filled.Mic else Icons.Filled.MicOff,
                                contentDescription = "Audio",
                                tint = if (isAudioEnabled) PortalPatients else Color.Red,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        Text(
                            text = if (isAudioEnabled) "Mic Activo" else "Mic Mudo",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontSize = 10.sp,
                        )
                    }

                    // Video toggle
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        IconButton(
                            onClick = onToggleVideo,
                            modifier = Modifier
                                .size(42.dp)
                                .background(
                                    if (isVideoEnabled) PortalPatients.copy(alpha = 0.18f) else Color.Red.copy(alpha = 0.2f),
                                    CircleShape,
                                ),
                        ) {
                            Icon(
                                imageVector = if (isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                                contentDescription = "Video",
                                tint = if (isVideoEnabled) PortalPatients else Color.Red,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        Text(
                            text = if (isVideoEnabled) "Cámara On" else "Cámara Off",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontSize = 10.sp,
                        )
                    }

                    // Switch camera toggle
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        IconButton(
                            onClick = onSwitchCamera,
                            enabled = isVideoEnabled,
                            modifier = Modifier
                                .size(42.dp)
                                .background(AuBorder.copy(alpha = 0.3f), CircleShape),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Refresh,
                                contentDescription = "Girar cámara",
                                tint = if (isVideoEnabled) AuTextSecondary else AuTextTertiary,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        Text(
                            text = "Rotar",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                            fontSize = 10.sp,
                        )
                    }
                }
            }

            // Telemedicine Legal & Clinical Consent Note
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = AuBackground.copy(alpha = 0.6f),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Security,
                        contentDescription = null,
                        tint = AuTextTertiary,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "Consulta médica confidencial y cifrada punto a punto según la normativa de telemedicina.",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                        fontSize = 10.sp,
                        lineHeight = 13.sp,
                    )
                }
            }

            // Action Buttons
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = onJoinOrRetry,
                    enabled = !isConnecting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatients,
                        contentColor = Color.White,
                    ),
                ) {
                    if (isConnecting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Conectando al consultorio...",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                        )
                    } else {
                        Text(
                            text = "Entrar al Consultorio",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                OutlinedButton(
                    onClick = onExit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, AuBorder),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = AuTextSecondary,
                    ),
                ) {
                    Text(
                        text = "Volver a la agenda",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}
