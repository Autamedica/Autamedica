package com.autamedica.android.presentation.videocall.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallActionsOverflowSheet(
    isAudioEnabled: Boolean,
    isVideoEnabled: Boolean,
    isSpeakerOn: Boolean,
    unreadMessages: Int,
    onToggleAudio: () -> Unit,
    onToggleVideo: () -> Unit,
    onToggleChat: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onSwitchCamera: () -> Unit,
    onDismiss: () -> Unit,
    isFrontCamera: Boolean = true,
    isTorchEnabled: Boolean = false,
    onToggleTorch: (() -> Unit)? = null,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color(0xFF0F172A),
        contentColor = Color.White,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = stringResource(R.string.videocall_quality_indicator, "HD"),
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 4.dp),
            )

            if (isVideoEnabled) {
                OverflowActionRow(
                    icon = Icons.Filled.Refresh,
                    title = stringResource(R.string.videocall_switch_camera),
                    subtitle = if (isFrontCamera) "Cámara frontal activa (tocar para cámara trasera)" else "Cámara trasera de inspección activa (sin espejo)",
                    accent = Color(0xFF38BDF8),
                    onClick = onSwitchCamera,
                )

                if (!isFrontCamera && onToggleTorch != null) {
                    OverflowActionRow(
                        icon = if (isTorchEnabled) Icons.Filled.FlashOn else Icons.Filled.FlashOff,
                        title = if (isTorchEnabled) "Linterna clínica encendida" else "Encender linterna (Flash)",
                        subtitle = "Iluminar garganta, piel o documento médico",
                        accent = if (isTorchEnabled) Color(0xFF06B6D4) else Color(0xFF94A3B8),
                        onClick = onToggleTorch,
                    )
                }
            }

            OverflowActionRow(
                icon = if (isAudioEnabled) Icons.Filled.Mic else Icons.Filled.MicOff,
                title = if (isAudioEnabled) stringResource(R.string.videocall_mute) else stringResource(R.string.videocall_unmute_mic),
                subtitle = "DSP con supresión de ruido y cancelación de eco activa",
                accent = if (isAudioEnabled) Color(0xFF94A3B8) else Color(0xFFEF4444),
                onClick = onToggleAudio,
            )

            OverflowActionRow(
                icon = if (isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                title = if (isVideoEnabled) stringResource(R.string.videocall_camera_off) else stringResource(R.string.videocall_camera_on),
                subtitle = stringResource(R.string.videocall_end),
                accent = if (isVideoEnabled) Color(0xFF94A3B8) else Color(0xFFEF4444),
                onClick = onToggleVideo,
            )

            OverflowActionRow(
                icon = if (isSpeakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                title = if (isSpeakerOn) "Altavoz activo" else "Auricular / Bluetooth activo",
                subtitle = "Ruteo inteligente de audio",
                accent = Color(0xFF94A3B8),
                onClick = onToggleSpeaker,
            )

            OverflowActionRow(
                icon = Icons.AutoMirrored.Filled.Chat,
                title = stringResource(R.string.videocall_chat),
                subtitle = if (unreadMessages > 0) {
                    "$unreadMessages sin leer"
                } else {
                    stringResource(R.string.videocall_clinical_notes)
                },
                accent = if (unreadMessages > 0) Color(0xFFEF4444) else Color(0xFF38BDF8),
                onClick = {
                    onDismiss()
                    onToggleChat()
                },
            )
        }
    }
}

@Composable
private fun OverflowActionRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    accent: Color,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        color = Color(0x14FFFFFF),
        border = BorderStroke(1.dp, Color(0x1FFFFFFF)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = accent.copy(alpha = 0.18f),
                modifier = Modifier.size(40.dp),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier
                        .padding(10.dp)
                        .size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = subtitle,
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp,
                )
            }
        }
    }
}
