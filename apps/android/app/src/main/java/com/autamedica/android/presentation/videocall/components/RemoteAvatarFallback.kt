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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun RemoteAvatarFallback(
    name: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    isCameraOff: Boolean = false,
    isReconnecting: Boolean = false,
    isConnecting: Boolean = false,
) {
    val initials = rememberInitials(name)
    val infiniteTransition = rememberInfiniteTransition(label = "pulse_avatar")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "avatarPulse",
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A)),
        contentAlignment = Alignment.Center,
    ) {
        // Concentric subtle background rings (matching Web GreenRoom / ActiveCall)
        Box(
            modifier = Modifier
                .size(320.dp)
                .clip(CircleShape)
                .background(Color(0x08FFFFFF)),
        )
        Box(
            modifier = Modifier
                .size(240.dp)
                .clip(CircleShape)
                .background(Color(0x0DFFFFFF)),
        )

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(horizontal = 32.dp),
        ) {
            // Main Avatar Circle with Gradient & Status Badge
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(112.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color.Transparent,
                    border = BorderStroke(1.5.dp, Color(0x33FFFFFF)),
                    shadowElevation = 16.dp,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(
                                        Color(0xFF334155),
                                        Color(0xFF1E293B),
                                    ),
                                ),
                            ),
                    ) {
                        if (isReconnecting || isConnecting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(44.dp),
                                color = if (isReconnecting) Color(0xFFF59E0B) else Color(0xFF38BDF8),
                                strokeWidth = 3.dp,
                            )
                        } else if (initials.isNotBlank() && initials != "?") {
                            Text(
                                text = initials,
                                color = Color(0xFFF8FAFC),
                                fontSize = 34.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Filled.Person,
                                contentDescription = null,
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(48.dp),
                            )
                        }
                    }
                }

                // Sub-badge at bottom-right (Camera Off or Spinner)
                if (isCameraOff) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF0F172A),
                        border = BorderStroke(1.dp, Color(0x33FFFFFF)),
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(30.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Filled.VideocamOff,
                                contentDescription = stringResource(R.string.videocall_camera_turned_off),
                                tint = Color(0xFFF43F5E),
                                modifier = Modifier.size(15.dp),
                            )
                        }
                    }
                } else if (isReconnecting) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF0F172A),
                        border = BorderStroke(1.dp, Color(0x33F59E0B)),
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(28.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = Color(0xFFF59E0B),
                                strokeWidth = 2.dp,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Remote Participant Name
            Text(
                text = name.ifBlank { stringResource(R.string.videocall_doctor_fallback) },
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(6.dp))

            // Subtitle status badge
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = Color(0x801E293B),
                border = BorderStroke(1.dp, Color(0x26FFFFFF)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (isReconnecting) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFF59E0B).copy(alpha = pulseAlpha)),
                        )
                    } else if (isConnecting) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF38BDF8).copy(alpha = pulseAlpha)),
                        )
                    }
                    Text(
                        text = subtitle,
                        color = Color(0xFF94A3B8),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

private fun rememberInitials(name: String?): String {
    if (name.isNullOrBlank()) return "?"
    val parts = name.trim().split("\\s+".toRegex()).filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    val cleanParts = if (parts.first().equals("Dr.", ignoreCase = true) || parts.first().equals("Dra.", ignoreCase = true)) {
        if (parts.size >= 2) parts.drop(1) else parts
    } else {
        parts
    }
    return if (cleanParts.size == 1) {
        cleanParts[0].take(2).uppercase()
    } else {
        "${cleanParts.first().first()}${cleanParts.last().first()}".uppercase()
    }
}
