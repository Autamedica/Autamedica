package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary

data class ChecklistItem(
    val id: Int,
    val label: String,
    val isCompleted: Boolean,
    val onClick: () -> Unit,
)

@Composable
fun OnboardingChecklistSection(
    items: List<ChecklistItem>,
    modifier: Modifier = Modifier,
) {
    val pendingItems = items.filter { !it.isCompleted }
    if (pendingItems.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = "Completá tu perfil",
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Requerido para tus consultas y recetas.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            pendingItems.take(4).forEach { item ->
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .sizeIn(minHeight = 48.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .clickable(
                            onClickLabel = "Completar ${item.label}",
                            onClick = item.onClick,
                        ),
                    shape = RoundedCornerShape(18.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    shadowElevation = 1.dp,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f),
                        ) {
                            Surface(
                                modifier = Modifier.size(24.dp),
                                shape = CircleShape,
                                color = if (item.isCompleted) Color(0xFF10B981) else Color.Transparent,
                                border = if (item.isCompleted) null else BorderStroke(2.dp, Color(0xFFCBD5E1)),
                            ) {
                                if (item.isCompleted) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = "Completado",
                                        tint = Color.White,
                                        modifier = Modifier.padding(4.dp),
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.width(12.dp))

                            Text(
                                text = item.label,
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }

                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = "Ir a ${item.label}",
                            tint = AuTextTertiary,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
        }
    }
}
