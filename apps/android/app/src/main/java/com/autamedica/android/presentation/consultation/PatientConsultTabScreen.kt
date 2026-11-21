package com.autamedica.android.presentation.consultation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.autamedica.android.R
import com.autamedica.android.presentation.appointments.AppointmentsScreen
import com.autamedica.android.presentation.main.PatientConsultSegment
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.PortalPatientsAction
import com.autamedica.android.presentation.theme.PrimaryContainer

/**
 * Unified Patient Consultation hub (Apple/Uber segmented pattern).
 * Combines immediate care (ConsultationHubScreen) and scheduled appointments
 * (AppointmentsScreen) under a single unmistakable "Consultar" tab.
 */
@Composable
fun PatientConsultTabScreen(
    selectedSegment: PatientConsultSegment,
    onSelectSegment: (PatientConsultSegment) -> Unit,
    onNavigateToVideoCall: (appointmentId: String) -> Unit,
    onNavigateToPharmacyIntake: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color.White),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color.White,
            border = BorderStroke(1.dp, Color(0xFFF1F5F9)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = PrimaryContainer.copy(alpha = 0.7f),
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        ConsultSegmentPill(
                            label = stringResource(R.string.patient_consult_segment_now),
                            icon = Icons.Outlined.Videocam,
                            selected = selectedSegment == PatientConsultSegment.IMMEDIATE,
                            onClick = { onSelectSegment(PatientConsultSegment.IMMEDIATE) },
                            modifier = Modifier.weight(1f),
                        )
                        ConsultSegmentPill(
                            label = stringResource(R.string.patient_consult_segment_scheduled),
                            icon = Icons.Outlined.CalendarMonth,
                            selected = selectedSegment == PatientConsultSegment.SCHEDULED,
                            onClick = { onSelectSegment(PatientConsultSegment.SCHEDULED) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .consumeWindowInsets(WindowInsets.statusBars),
        ) {
            when (selectedSegment) {
                PatientConsultSegment.IMMEDIATE -> ConsultationHubScreen(
                    onNavigateToVideoCall = onNavigateToVideoCall,
                    onNavigateToBookAppointment = { onSelectSegment(PatientConsultSegment.SCHEDULED) },
                    onNavigateToPharmacyIntake = onNavigateToPharmacyIntake,
                )
                PatientConsultSegment.SCHEDULED -> AppointmentsScreen(
                    onNavigateToVideoCall = onNavigateToVideoCall,
                    onNavigateToBookAppointment = { onSelectSegment(PatientConsultSegment.SCHEDULED) },
                )
            }
        }
    }
}

@Composable
private fun ConsultSegmentPill(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .sizeIn(minHeight = 42.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) PortalPatientsAction else Color.Transparent,
        shadowElevation = if (selected) 1.dp else 0.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) Color.White else AuTextSecondary,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = if (selected) Color.White else AuTextSecondary,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
