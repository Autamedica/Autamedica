package com.autamedica.android.presentation.health.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextTertiary

private val ObsidianDark = Color(0xFF09090B)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SuggestionChipsRow(
    suggestions: List<String>,
    currentValue: String,
    enabled: Boolean,
    onSelectSuggestion: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (suggestions.isEmpty()) return

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Sugerencias frecuentes:",
            style = MaterialTheme.typography.labelSmall,
            color = AuTextTertiary,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.3.sp,
        )
        Spacer(modifier = Modifier.height(6.dp))
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            suggestions.forEach { suggestion ->
                val isAlreadyIncluded = currentValue.contains(suggestion, ignoreCase = true)
                Surface(
                    onClick = {
                        if (enabled && !isAlreadyIncluded) {
                            val nextValue = when {
                                currentValue.isBlank() -> suggestion
                                currentValue.contains("\n") -> "$currentValue\n- $suggestion"
                                else -> "$currentValue, $suggestion"
                            }
                            onSelectSuggestion(nextValue)
                        }
                    },
                    shape = RoundedCornerShape(16.dp),
                    color = if (isAlreadyIncluded) ObsidianDark else AuSurface,
                    border = BorderStroke(
                        1.dp,
                        if (isAlreadyIncluded) ObsidianDark else AuBorder
                    ),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        if (!isAlreadyIncluded) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = null,
                                tint = AuTextTertiary,
                                modifier = Modifier.size(12.dp),
                            )
                        }
                        Text(
                            text = suggestion,
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isAlreadyIncluded) Color.White else AuTextPrimary,
                            fontWeight = if (isAlreadyIncluded) FontWeight.Bold else FontWeight.Normal,
                        )
                    }
                }
            }
        }
    }
}
