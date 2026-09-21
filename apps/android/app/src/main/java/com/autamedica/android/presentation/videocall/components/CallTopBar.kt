package com.autamedica.android.presentation.videocall.components

import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.StreamQualityLevel

@Composable
fun CallTopBar(
    connectionState: ConnectionState,
    qualityLevel: StreamQualityLevel,
    durationSeconds: Long,
    modifier: Modifier = Modifier,
    isWaitingRoom: Boolean = false,
    runtime: String? = null,
) {
    val isConnected = connectionState == ConnectionState.CONNECTED && durationSeconds > 0 && !isWaitingRoom
    val infiniteTransition = rememberInfiniteTransition(label = "topbar_pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dotPulse",
    )

    val dotColor = if (isConnected) Color(0xFF10B981) else Color(0xFF38BDF8)
    val statusText = if (isConnected) stringResource(R.string.videocall_status_in_consultation) else stringResource(R.string.videocall_status_waiting_doctor)

    // Format duration
    val hours = durationSeconds / 3600
    val minutes = (durationSeconds % 3600) / 60
    val seconds = durationSeconds % 60
    val formattedDuration = if (hours > 0) {
        String.format("%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format("%02d:%02d", minutes, seconds)
    }

    Surface(
        shape = RoundedCornerShape(999.dp),
        color = Color(0xCC0F172A),
        border = BorderStroke(1.dp, Color(0x26FFFFFF)),
        shadowElevation = 10.dp,
        modifier = modifier
            .statusBarsPadding()
            .padding(top = 10.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Status Dot + Label ('En espera del médico' o 'En consulta')
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(if (isConnected) dotColor else dotColor.copy(alpha = pulseAlpha)),
                )
                Text(
                    text = statusText,
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                )
            }

            // Quality Bars (4 subtle bars)
            val barsCount = when (qualityLevel) {
                StreamQualityLevel.EXCELLENT -> 4
                StreamQualityLevel.GOOD -> 3
                StreamQualityLevel.FAIR -> 2
                StreamQualityLevel.POOR -> 1
                StreamQualityLevel.UNKNOWN -> if (isConnected) 4 else 3
            }
            val barColor = if (barsCount >= 3) Color(0xFF10B981) else if (barsCount == 2) Color(0xFFF59E0B) else Color(0xFFEF4444)
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.height(12.dp),
            ) {
                for (i in 1..4) {
                    Box(
                        modifier = Modifier
                            .width(2.5.dp)
                            .height((4 + i * 2).dp)
                            .clip(RoundedCornerShape(1.dp))
                            .background(if (i <= barsCount) barColor else Color(0x33FFFFFF)),
                    )
                }
            }

            // Monospace Duration Timer (solo si durationSeconds > 0)
            if (durationSeconds > 0) {
                Text(
                    text = formattedDuration,
                    color = Color(0xFFE2E8F0),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            // Discreet security lock icon
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = stringResource(R.string.videocall_secure_connection),
                tint = Color(0xFF38BDF8).copy(alpha = 0.75f),
                modifier = Modifier.size(11.dp),
            )
        }
    }
}
