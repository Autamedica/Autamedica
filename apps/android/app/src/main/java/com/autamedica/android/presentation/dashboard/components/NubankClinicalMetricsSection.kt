package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.PortalPatientsAction

/**
 * Compact 3-number daily summary (Turnos hoy · En espera · Atendidos).
 * Automatically hidden when all three counters are 0 to eliminate visual noise.
 */
@Composable
fun NubankClinicalMetricsSection(
    stats: DoctorStats,
    statsAvailable: Boolean,
    modifier: Modifier = Modifier,
) {
    if (!statsAvailable) return
    val allZero = stats.todayAppointments == 0 &&
        stats.pendingAppointments == 0 &&
        stats.completedToday == 0
    if (allZero) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = stringResource(R.string.ui_clinical_metrics_title),
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.sp,
            ),
            color = PortalPatientsAction,
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            CompactClinicalMetricPill(
                label = stringResource(R.string.doctor_cockpit_metric_today),
                value = stats.todayAppointments.toString(),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
            CompactClinicalMetricPill(
                label = stringResource(R.string.doctor_cockpit_metric_pending),
                value = stats.pendingAppointments.toString(),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
            CompactClinicalMetricPill(
                label = stringResource(R.string.doctor_cockpit_metric_completed),
                value = stats.completedToday.toString(),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
        }
    }
}

@Composable
private fun CompactClinicalMetricPill(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontSize = 22.sp,
                    fontWeight = FontWeight.ExtraBold,
                ),
                color = PortalPatientsAction,
                maxLines = 1,
                softWrap = false,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.SemiBold,
                ),
                color = AuTextSecondary,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
        }
    }
}
