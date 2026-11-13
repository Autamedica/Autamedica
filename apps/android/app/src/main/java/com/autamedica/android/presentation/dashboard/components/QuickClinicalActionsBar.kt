package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuCyan
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalDoctorsAction

/**
 * Barra de Accesos Rápidos Clínicos (Quick Clinical Actions Bar).
 * 
 * Botones táctiles de radio amplio (20dp) con iconografía médica estilizada:
 * - "Receta Digital"
 * - "Certificado"
 * - "Órdenes"
 * - "Radar On-Demand"
 * - "+ Turno"
 * 
 * Incluye feedback háptico táctil en cada pulsación.
 */
@Composable
fun QuickClinicalActionsBar(
    onNavigateToPrescriptions: () -> Unit,
    onNavigateToCertificates: () -> Unit,
    onNavigateToMedicalOrders: () -> Unit,
    onNavigateToDoctorOnDemand: () -> Unit,
    onNavigateToCreateAppointment: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.ui_clinical_tools),
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.sp,
            ),
            color = PortalDoctorsAction,
        )

        val actions = listOf(
            ClinicalActionItem(
                label = stringResource(R.string.ui_clinical_prescription),
                icon = Icons.Outlined.Medication,
                accentColor = PortalDoctors,
                bgColor = Color(0xFFEBF1FF),
                onClick = onNavigateToPrescriptions,
            ),
            ClinicalActionItem(
                label = stringResource(R.string.ui_clinical_certificate),
                icon = Icons.Outlined.Verified,
                accentColor = AuEmerald,
                bgColor = Color(0xFFECFDF5),
                onClick = onNavigateToCertificates,
            ),
            ClinicalActionItem(
                label = stringResource(R.string.ui_clinical_orders),
                icon = Icons.AutoMirrored.Outlined.Assignment,
                accentColor = AuCyan,
                bgColor = Color(0xFFECFEFF),
                onClick = onNavigateToMedicalOrders,
            ),
            ClinicalActionItem(
                label = stringResource(R.string.ui_clinical_duty),
                icon = Icons.Filled.Sensors,
                accentColor = Color(0xFF0F172A),
                bgColor = Color(0xFFF1F5F9),
                onClick = onNavigateToDoctorOnDemand,
            ),
            ClinicalActionItem(
                label = stringResource(R.string.ui_clinical_appointment),
                icon = Icons.Default.Add,
                accentColor = PortalDoctors,
                bgColor = Color(0xFFEBF1FF),
                onClick = onNavigateToCreateAppointment,
            ),
        )
        val fontScale = LocalDensity.current.fontScale
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val columns = if (maxWidth < 400.dp || fontScale >= 1.3f) 2 else 3
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                actions.chunked(columns).forEach { rowActions ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        rowActions.forEach { action ->
                            ClinicalActionButton(
                                label = action.label,
                                icon = action.icon,
                                accentColor = action.accentColor,
                                bgColor = action.bgColor,
                                onClick = action.onClick,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        repeat(columns - rowActions.size) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

private data class ClinicalActionItem(
    val label: String,
    val icon: ImageVector,
    val accentColor: Color,
    val bgColor: Color,
    val onClick: () -> Unit,
)

@Composable
private fun ClinicalActionButton(
    label: String,
    icon: ImageVector,
    accentColor: Color,
    bgColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hapticFeedback = LocalHapticFeedback.current

    Card(
        onClick = {
            hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        },
        modifier = modifier
            .heightIn(min = 94.dp)
            .shadow(
                elevation = 2.dp,
                shape = RoundedCornerShape(20.dp),
                ambientColor = Color(0x06000000),
                spotColor = Color(0x10000000),
            ),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(bgColor),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = accentColor,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(modifier = Modifier.height(7.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 15.sp,
                ),
                color = AuTextPrimary,
                maxLines = 2,
                softWrap = true,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
        }
    }
}
