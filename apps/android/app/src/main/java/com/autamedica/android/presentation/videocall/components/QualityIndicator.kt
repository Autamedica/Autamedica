package com.autamedica.android.presentation.videocall.components

import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SignalCellular0Bar
import androidx.compose.material.icons.filled.SignalCellular4Bar
import androidx.compose.material.icons.filled.SignalCellularAlt
import androidx.compose.material.icons.filled.SignalCellularAlt1Bar
import androidx.compose.material.icons.filled.SignalCellularAlt2Bar
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.StreamQualityLevel

@Composable
fun QualityIndicator(
    level: StreamQualityLevel,
    modifier: Modifier = Modifier,
) {
    val (icon, color, label) = when (level) {
        StreamQualityLevel.EXCELLENT -> Triple(Icons.Filled.SignalCellular4Bar, Color(0xFF4CAF50), "Excelente")
        StreamQualityLevel.GOOD -> Triple(Icons.Filled.SignalCellularAlt, Color(0xFF8BC34A), "Buena")
        StreamQualityLevel.FAIR -> Triple(Icons.Filled.SignalCellularAlt2Bar, Color(0xFFFFC107), "Regular")
        StreamQualityLevel.POOR -> Triple(Icons.Filled.SignalCellularAlt1Bar, Color(0xFFF44336), "Mala")
        StreamQualityLevel.UNKNOWN -> Triple(Icons.Filled.SignalCellular0Bar, Color.Gray, "")
    }

    if (level == StreamQualityLevel.UNKNOWN) return

    Row(
        modifier = modifier
            .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = stringResource(R.string.videocall_quality_indicator, label),
            tint = color,
            modifier = Modifier.size(16.dp),
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = label,
            color = Color.White,
            fontSize = 11.sp,
        )
    }
}
