package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.DoctorStats
import com.autamedica.android.presentation.theme.PortalDoctors

/**
 * Clinical counters backed exclusively by the authenticated doctor's Supabase queries.
 * If the query fails, show an unavailable state instead of invented demo statistics.
 */
@Composable
fun NubankClinicalMetricsSection(
    stats: DoctorStats,
    statsAvailable: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.ui_clinical_metrics_title),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.sp,
            ),
            color = PortalDoctors,
        )

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 2.dp, vertical = 4.dp),
        ) {
            item {
                ClinicalMetricCard(
                    title = stringResource(R.string.ui_clinical_completed_today),
                    value = if (statsAvailable) stats.completedToday.toString() else "—",
                    subtext = stringResource(R.string.ui_clinical_completed_today_hint),
                )
            }
            item {
                ClinicalMetricCard(
                    title = stringResource(R.string.doctor_dashboard_uncancelled_appointments_title),
                    value = if (statsAvailable) stats.todayAppointments.toString() else "—",
                    subtext = stringResource(R.string.doctor_dashboard_appointment_records_subtitle),
                )
            }
            item {
                ClinicalMetricCard(
                    title = stringResource(R.string.doctor_dashboard_linked_patients_title),
                    value = if (statsAvailable) stats.totalPatients.toString() else "—",
                    subtext = stringResource(R.string.doctor_dashboard_doctor_links_subtitle),
                )
            }
        }
        if (!statsAvailable) {
            Text(
                text = stringResource(R.string.doctor_dashboard_metrics_error),
                color = Color(0xFF64748B),
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun ClinicalMetricCard(
    title: String,
    value: String,
    subtext: String,
) {
    Card(
        modifier = Modifier.width(226.dp),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF64748B),
            )
            Text(
                text = value,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.ExtraBold,
                color = Color(0xFF0F172A),
            )
            Text(
                text = subtext,
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFF64748B),
            )
        }
    }
}
