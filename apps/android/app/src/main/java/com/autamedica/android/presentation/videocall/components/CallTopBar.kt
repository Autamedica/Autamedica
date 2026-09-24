package com.autamedica.android.presentation.videocall.components

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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.ConnectionState
import com.autamedica.android.domain.model.StreamQualityLevel

@Composable
fun CallTopBar(
    connectionState: ConnectionState,
    qualityLevel: StreamQualityLevel,
    durationSeconds: Long,
    participantLabel: String,
    modifier: Modifier = Modifier,
    isWaitingRoom: Boolean = false,
    safetyAlert: String? = null,
    /** En call del médico: solo identidad + seguridad. Sin timer ni barras. */
    clinicalFirst: Boolean = false,
    onMinimize: (() -> Unit)? = null,
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

    val hasSafety = !safetyAlert.isNullOrBlank()
    val showMediaChrome = !clinicalFirst
    val showPoorQualityOnly = clinicalFirst && (
        qualityLevel == StreamQualityLevel.POOR || qualityLevel == StreamQualityLevel.FAIR
    )

    val dotColor = when {
        hasSafety -> Color(0xFFF59E0B)
        isConnected -> Color(0xFF10B981)
        else -> Color(0xFF38BDF8)
    }

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
            .padding(top = 10.dp, start = 12.dp, end = 12.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = if (onMinimize != null) 6.dp else 12.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (onMinimize != null) {
                IconButton(
                    onClick = onMinimize,
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.KeyboardArrowDown,
                        contentDescription = "Minimizar videollamada",
                        tint = Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.weight(1f, fill = false),
            ) {
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(if (isConnected) dotColor else dotColor.copy(alpha = pulseAlpha)),
                )
                Text(
                    text = participantLabel,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = if (clinicalFirst) 180.dp else 140.dp),
                )
            }

            if (hasSafety) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0x33EF4444),
                    border = BorderStroke(1.dp, Color(0x66EF4444)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Warning,
                            contentDescription = "Alerta de seguridad",
                            tint = Color(0xFFFCA5A5),
                            modifier = Modifier.size(11.dp),
                        )
                        Text(
                            text = safetyAlert.orEmpty(),
                            color = Color(0xFFFECACA),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.widthIn(max = 120.dp),
                        )
                    }
                }
            }

            if (showMediaChrome || showPoorQualityOnly) {
                val barsCount = when (qualityLevel) {
                    StreamQualityLevel.EXCELLENT -> 4
                    StreamQualityLevel.GOOD -> 3
                    StreamQualityLevel.FAIR -> 2
                    StreamQualityLevel.POOR -> 1
                    StreamQualityLevel.UNKNOWN -> if (isConnected) 4 else 3
                }
                val barColor = when {
                    barsCount >= 3 -> Color(0xFF10B981)
                    barsCount == 2 -> Color(0xFFF59E0B)
                    else -> Color(0xFFEF4444)
                }
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
            }

            if (showMediaChrome && durationSeconds > 0) {
                Text(
                    text = formattedDuration,
                    color = Color(0xFFE2E8F0),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
