package com.autamedica.android.presentation.videocall.components

import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
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
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Medication
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val DockSurface = Color(0xF20F172A)
private val DockBorder = Color(0x33FFFFFF)
private val GlassButtonOn = Color(0x26FFFFFF)
private val DangerRed = Color(0xFFDC2626)
private val PrimarySky = Color(0xFF0284C7)

@Composable
fun CallControlsBar(
    isAudioEnabled: Boolean,
    isVideoEnabled: Boolean,
    isSpeakerOn: Boolean,
    isChatOpen: Boolean,
    onToggleAudio: () -> Unit,
    onToggleVideo: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onToggleChat: () -> Unit,
    onEndCall: () -> Unit,
    onSwitchCamera: (() -> Unit)? = null,
    isDoctor: Boolean = false,
    isClinicalNotesOpen: Boolean = false,
    onToggleClinicalNotes: (() -> Unit)? = null,
    onEmitPrescription: (() -> Unit)? = null,
    onEmitCertificate: (() -> Unit)? = null,
    unreadMessages: Int = 0,
    modifier: Modifier = Modifier,
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
            // Audio toggle
            ControlDockButton(
                icon = if (isAudioEnabled) Icons.Filled.Mic else Icons.Filled.MicOff,
                contentDescription = if (isAudioEnabled) stringResource(R.string.videocall_mute) else stringResource(R.string.videocall_unmute_mic),
                isActive = isAudioEnabled,
                isDanger = !isAudioEnabled,
                onClick = onToggleAudio,
            )

            // Video toggle
            ControlDockButton(
                icon = if (isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                contentDescription = if (isVideoEnabled) stringResource(R.string.videocall_camera_off) else stringResource(R.string.videocall_camera_on),
                isActive = isVideoEnabled,
                isDanger = !isVideoEnabled,
                onClick = onToggleVideo,
            )

            // Switch Camera
            if (onSwitchCamera != null && isVideoEnabled) {
                ControlDockButton(
                    icon = Icons.Filled.Refresh,
                    contentDescription = stringResource(R.string.videocall_switch_camera),
                    isActive = true,
                    onClick = onSwitchCamera,
                )
            }

            // Speaker toggle
            ControlDockButton(
                icon = if (isSpeakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                contentDescription = if (isSpeakerOn) stringResource(R.string.videocall_speaker_on) else stringResource(R.string.videocall_earpiece),
                isActive = isSpeakerOn,
                onClick = onToggleSpeaker,
            )

            // Chat toggle with badge
            Box {
                ControlDockButton(
                    icon = Icons.AutoMirrored.Filled.Chat,
                    contentDescription = stringResource(R.string.videocall_chat),
                    isActive = isChatOpen,
                    activeColor = PrimarySky,
                    onClick = onToggleChat,
                )
                if (unreadMessages > 0) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(DangerRed),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = unreadMessages.toString(),
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            // Doctor Clinical Actions (Notes, Prescription, Certificate)
            if (isDoctor) {
                if (onToggleClinicalNotes != null) {
                    ControlDockButton(
                        icon = Icons.Outlined.Description,
                        contentDescription = stringResource(R.string.videocall_clinical_notes),
                        isActive = isClinicalNotesOpen,
                        activeColor = Color(0xFF0D9488),
                        onClick = onToggleClinicalNotes,
                    )
                }
                if (onEmitPrescription != null) {
                    ControlDockButton(
                        icon = Icons.Outlined.Medication,
                        contentDescription = stringResource(R.string.videocall_emit_prescription),
                        isActive = false,
                        activeColor = Color(0xFF0284C7),
                        onClick = onEmitPrescription,
                    )
                }
                if (onEmitCertificate != null) {
                    ControlDockButton(
                        icon = Icons.AutoMirrored.Outlined.Assignment,
                        contentDescription = stringResource(R.string.videocall_emit_certificate),
                        isActive = false,
                        activeColor = Color(0xFF10B981),
                        onClick = onEmitCertificate,
                    )
                }
            }

            // Divider line
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(26.dp)
                    .background(Color(0x26FFFFFF)),
            )

            // End Call Button (Rounded rectangle with red shadow)
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = DangerRed,
                shadowElevation = 8.dp,
                modifier = Modifier.size(width = 56.dp, height = 44.dp),
            ) {
                IconButton(
                    onClick = onEndCall,
                    modifier = Modifier.size(width = 56.dp, height = 44.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.CallEnd,
                        contentDescription = stringResource(R.string.videocall_end),
                        tint = Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
        }
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
    val background = when {
        isDanger -> DangerRed
        isActive -> activeColor
        else -> Color(0x1AFFFFFF)
    }

    IconButton(
        onClick = onClick,
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
