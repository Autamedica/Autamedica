package com.autamedica.android.presentation.videocall.components

import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Description
import androidx.compose.ui.unit.dp

@Composable
fun CallControls(
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
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.6f))
            .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Mic toggle
        ControlButton(
            icon = {
                Icon(
                    imageVector = if (isAudioEnabled) Icons.Filled.Mic else Icons.Filled.MicOff,
                    contentDescription = if (isAudioEnabled) stringResource(R.string.videocall_mute) else stringResource(R.string.videocall_unmute_mic),
                    tint = Color.White,
                )
            },
            onClick = onToggleAudio,
            containerColor = if (isAudioEnabled) Color.DarkGray else Color.Red.copy(alpha = 0.8f),
        )

        Spacer(modifier = Modifier.width(10.dp))

        // Video toggle
        ControlButton(
            icon = {
                Icon(
                    imageVector = if (isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                    contentDescription = if (isVideoEnabled) stringResource(R.string.videocall_camera_off) else stringResource(R.string.videocall_camera_on),
                    tint = Color.White,
                )
            },
            onClick = onToggleVideo,
            containerColor = if (isVideoEnabled) Color.DarkGray else Color.Red.copy(alpha = 0.8f),
        )

        if (onSwitchCamera != null && isVideoEnabled) {
            Spacer(modifier = Modifier.width(10.dp))
            ControlButton(
                icon = {
                    Icon(
                        imageVector = Icons.Filled.Refresh,
                        contentDescription = stringResource(R.string.videocall_switch_camera),
                        tint = Color.White,
                    )
                },
                onClick = onSwitchCamera,
                containerColor = Color.DarkGray,
            )
        }

        Spacer(modifier = Modifier.width(10.dp))

        // Speaker toggle
        ControlButton(
            icon = {
                Icon(
                    imageVector = if (isSpeakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                    contentDescription = if (isSpeakerOn) "Desactivar altavoz" else "Activar altavoz",
                    tint = Color.White,
                )
            },
            onClick = onToggleSpeaker,
            containerColor = if (isSpeakerOn) Color.DarkGray else Color(0xFF455A64),
        )

        Spacer(modifier = Modifier.width(10.dp))

        // Chat toggle
        ControlButton(
            icon = {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Chat,
                    contentDescription = stringResource(R.string.videocall_chat),
                    tint = Color.White,
                )
            },
            onClick = onToggleChat,
            containerColor = if (isChatOpen) MaterialTheme.colorScheme.primary else Color.DarkGray,
        )

        // Doctor Clinical Notes toggle
        if (isDoctor && onToggleClinicalNotes != null) {
            Spacer(modifier = Modifier.width(10.dp))
            ControlButton(
                icon = {
                    Icon(
                        imageVector = Icons.Outlined.Description,
                        contentDescription = stringResource(R.string.videocall_clinical_notes),
                        tint = Color.White,
                    )
                },
                onClick = onToggleClinicalNotes,
                containerColor = if (isClinicalNotesOpen) Color(0xFF0D9488) else Color.DarkGray,
            )
        }

        Spacer(modifier = Modifier.width(16.dp))

        // End call
        FilledIconButton(
            onClick = onEndCall,
            modifier = Modifier.size(54.dp),
            shape = CircleShape,
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = Color.Red,
                contentColor = Color.White,
            ),
        ) {
            Icon(
                imageVector = Icons.Filled.CallEnd,
                contentDescription = stringResource(R.string.videocall_end),
            )
        }
    }
}

@Composable
private fun ControlButton(
    icon: @Composable () -> Unit,
    onClick: () -> Unit,
    containerColor: Color,
    modifier: Modifier = Modifier,
) {
    IconButton(
        onClick = onClick,
        modifier = modifier
            .size(48.dp)
            .background(containerColor, CircleShape),
    ) {
        icon()
    }
}
