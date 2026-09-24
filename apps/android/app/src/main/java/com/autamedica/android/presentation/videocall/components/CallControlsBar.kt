package com.autamedica.android.presentation.videocall.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.theme.AuCrimson

private val DockSurface = Color(0xF20F172A)
private val DockBorder = Color(0x33FFFFFF)
private val GlassButtonOn = Color(0x26FFFFFF)
private val DangerRed = AuCrimson
private val PrimarySky = Color(0xFF0284C7)
private val TealFicha = Color(0xFF0D9488)

@Composable
fun CallControlsBar(
    isAudioEnabled: Boolean,
    isVideoEnabled: Boolean,
    onToggleAudio: () -> Unit,
    onToggleVideo: () -> Unit,
    onEndCall: () -> Unit,
    modifier: Modifier = Modifier,
    isDoctor: Boolean = false,
    isFichaOpen: Boolean = false,
    hasSafetyAlerts: Boolean = false,
    onOpenFicha: (() -> Unit)? = null,
    isOverflowOpen: Boolean = false,
    overflowBadgeCount: Int = 0,
    onOpenOverflow: (() -> Unit)? = null,
    isSpeakerOn: Boolean = true,
    isChatOpen: Boolean = false,
    unreadMessages: Int = 0,
    onToggleSpeaker: (() -> Unit)? = null,
    onToggleChat: (() -> Unit)? = null,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = DockSurface,
        border = BorderStroke(1.dp, DockBorder),
        shadowElevation = 20.dp,
        modifier = modifier
            .navigationBarsPadding()
            .padding(bottom = 16.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (isDoctor) {
                // Jerarquía clínica: ficha/guía + medios (overflow) + colgar.
                // Mic/cam NO van en primera vista.
                if (onOpenFicha != null) {
                    Box {
                        ControlDockButton(
                            icon = Icons.Filled.MedicalServices,
                            contentDescription = "Guía clínica",
                            isActive = isFichaOpen,
                            activeColor = TealFicha,
                            onClick = onOpenFicha,
                        )
                        if (hasSafetyAlerts && !isFichaOpen) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(DangerRed),
                            )
                        }
                    }
                }

                if (onOpenOverflow != null) {
                    Box {
                        ControlDockButton(
                            icon = Icons.Filled.MoreHoriz,
                            contentDescription = "Medios y chat",
                            isActive = isOverflowOpen,
                            activeColor = PrimarySky,
                            onClick = onOpenOverflow,
                        )
                        val mutedOrCamOff = !isAudioEnabled || !isVideoEnabled
                        if (overflowBadgeCount > 0 || mutedOrCamOff) {
                            UnreadBadge(
                                count = if (overflowBadgeCount > 0) overflowBadgeCount else 1,
                                modifier = Modifier.align(Alignment.TopEnd),
                                showDotOnly = overflowBadgeCount == 0,
                            )
                        }
                    }
                }
            } else {
                ControlDockButton(
                    icon = if (isAudioEnabled) Icons.Filled.Mic else Icons.Filled.MicOff,
                    contentDescription = if (isAudioEnabled) "Silenciar" else "Activar micrófono",
                    isActive = isAudioEnabled,
                    isDanger = !isAudioEnabled,
                    onClick = onToggleAudio,
                )
                ControlDockButton(
                    icon = if (isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                    contentDescription = if (isVideoEnabled) "Desactivar cámara" else "Activar cámara",
                    isActive = isVideoEnabled,
                    isDanger = !isVideoEnabled,
                    onClick = onToggleVideo,
                )
                if (onToggleSpeaker != null) {
                    ControlDockButton(
                        icon = if (isSpeakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                        contentDescription = if (isSpeakerOn) "Altavoz activo" else "Auricular",
                        isActive = isSpeakerOn,
                        onClick = onToggleSpeaker,
                    )
                }
                if (onToggleChat != null) {
                    Box {
                        ControlDockButton(
                            icon = Icons.AutoMirrored.Filled.Chat,
                            contentDescription = "Chat",
                            isActive = isChatOpen,
                            activeColor = PrimarySky,
                            onClick = onToggleChat,
                        )
                        if (unreadMessages > 0) {
                            UnreadBadge(
                                count = unreadMessages,
                                modifier = Modifier.align(Alignment.TopEnd),
                            )
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(26.dp)
                    .background(Color(0x26FFFFFF)),
            )

            Surface(
                shape = RoundedCornerShape(18.dp),
                color = DangerRed,
                shadowElevation = 8.dp,
                modifier = Modifier.size(width = 56.dp, height = 44.dp),
            ) {
                val haptic = LocalHapticFeedback.current
                IconButton(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onEndCall()
                    },
                    modifier = Modifier.size(width = 56.dp, height = 44.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.CallEnd,
                        contentDescription = "Finalizar llamada",
                        tint = Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun UnreadBadge(
    count: Int,
    modifier: Modifier = Modifier,
    showDotOnly: Boolean = false,
) {
    if (showDotOnly) {
        Box(
            modifier = modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(DangerRed),
        )
        return
    }
    Box(
        modifier = modifier
            .size(16.dp)
            .clip(CircleShape)
            .background(DangerRed),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (count > 9) "9+" else count.toString(),
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun ControlDockButton(
    icon: ImageVector,
    contentDescription: String,
    isActive: Boolean,
    isDanger: Boolean = false,
    activeColor: Color = GlassButtonOn,
    onClick: () -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    val background = when {
        isDanger -> DangerRed
        isActive -> activeColor
        else -> Color(0x1AFFFFFF)
    }

    IconButton(
        onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        },
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(background),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = Color.White,
            modifier = Modifier.size(20.dp),
        )
    }
}
