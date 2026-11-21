package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.PortalPatientsAction
import com.autamedica.android.presentation.theme.PrimaryContainer

/**
 * Prominent 3-pillar clinical issuance bar for Doctors (Receta · Certificado · Órdenes).
 * High-contrast AutaMedica Blue (#0369A1, 5.93:1) — each button opens its creation form directly.
 */
@Composable
fun QuickClinicalActionsBar(
    onNavigateToPrescriptions: () -> Unit,
    onNavigateToCertificates: () -> Unit,
    onNavigateToMedicalOrders: () -> Unit,
    onNavigateToDoctorOnDemand: () -> Unit = {},
    onNavigateToCreateAppointment: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = stringResource(R.string.ui_clinical_tools),
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 11.5.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.sp,
            ),
            color = PortalPatientsAction,
        )

        val actions = listOf(
            ClinicalActionItem(
                label = stringResource(R.string.ui_clinical_prescription),
                icon = Icons.Outlined.Medication,
                onClick = onNavigateToPrescriptions,
            ),
            ClinicalActionItem(
                label = stringResource(R.string.ui_clinical_certificate),
                icon = Icons.Outlined.Verified,
                onClick = onNavigateToCertificates,
            ),
            ClinicalActionItem(
                label = stringResource(R.string.ui_clinical_orders),
                icon = Icons.AutoMirrored.Outlined.Assignment,
                onClick = onNavigateToMedicalOrders,
            ),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            actions.forEach { action ->
                ClinicalActionButton(
                    label = action.label,
                    icon = action.icon,
                    actionCta = stringResource(R.string.doctor_quick_action_issue_cta),
                    onClick = action.onClick,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
            }
        }
    }
}

private data class ClinicalActionItem(
    val label: String,
    val icon: ImageVector,
    val onClick: () -> Unit,
)

@Composable
private fun ClinicalActionButton(
    label: String,
    icon: ImageVector,
    actionCta: String,
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
            .heightIn(min = 122.dp)
            .shadow(
                elevation = 3.dp,
                shape = RoundedCornerShape(22.dp),
                ambientColor = Color(0x0A000000),
                spotColor = PortalPatientsAction.copy(alpha = 0.14f),
            ),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.5.dp, PortalPatientsAction.copy(alpha = 0.25f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(PortalPatientsAction),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = Color.White,
                    modifier = Modifier.size(26.dp),
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall.copy(
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.ExtraBold,
                    lineHeight = 17.sp,
                ),
                color = AuTextPrimary,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = PrimaryContainer,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = null,
                        tint = PortalPatientsAction,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = actionCta,
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                        ),
                        color = PortalPatientsAction,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
        }
    }
}
