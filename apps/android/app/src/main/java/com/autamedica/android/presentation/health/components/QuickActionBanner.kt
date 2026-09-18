package com.autamedica.android.presentation.health.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import com.autamedica.android.presentation.health.SectionQuickAction
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary

private val EmeraldSuccess = Color(0xFF16A34A)
private val EmeraldSoft = Color(0xFFDCFCE7)
private val ObsidianDark = Color(0xFF09090B)

@Composable
fun QuickActionBanner(
    quickAction: SectionQuickAction,
    currentValues: Map<String, String>,
    enabled: Boolean,
    onApply: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isAlreadyApplied = quickAction.values.all { (k, v) ->
        currentValues[k]?.trim() == v.trim()
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isAlreadyApplied) EmeraldSoft.copy(alpha = 0.5f) else AuSurface,
        border = BorderStroke(
            1.dp,
            if (isAlreadyApplied) EmeraldSuccess.copy(alpha = 0.4f) else AuBorder
        ),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = if (isAlreadyApplied) Icons.Default.CheckCircle else Icons.Default.Check,
                        contentDescription = null,
                        tint = if (isAlreadyApplied) EmeraldSuccess else ObsidianDark,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "Acción rápida",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isAlreadyApplied) EmeraldSuccess else ObsidianDark,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = quickAction.label,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isAlreadyApplied) Color(0xFF14532D) else AuTextSecondary,
                    fontWeight = FontWeight.Medium,
                )
            }

            Spacer(modifier = Modifier.width(10.dp))

            if (isAlreadyApplied) {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = EmeraldSuccess,
                ) {
                    Text(
                        text = "Aplicado",
                        color = Color.White,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            } else {
                Button(
                    onClick = onApply,
                    enabled = enabled,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ObsidianDark),
                    contentPadding = ButtonDefaults.TextButtonContentPadding,
                ) {
                    Text(
                        text = "Auto-completar",
                        color = Color.White,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}
