package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Shield
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary

data class ServiceItem(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val onClick: () -> Unit,
)

@Composable
fun ClinicalServicesGrid(
    onOnlineDoctorClick: () -> Unit,
    onSubscriptionClick: () -> Unit,
    onScheduleClick: () -> Unit,
    onPrescriptionsClick: () -> Unit,
    onHistoryClick: () -> Unit,
    onMentalHealthClick: () -> Unit,
    onPreventionClick: () -> Unit,
    onReproductiveHealthClick: () -> Unit,
    onCommunityClick: () -> Unit,
    onContinuityClick: () -> Unit = {},
    onPharmacyExpressClick: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val services = listOf(
        ServiceItem(
            title = stringResource(id = R.string.patient_pharmacy_express_button),
            description = stringResource(id = R.string.patient_pharmacy_express_desc),
            icon = Icons.Outlined.HealthAndSafety,
            onClick = onPharmacyExpressClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_online_title),
            description = stringResource(R.string.ui_service_online_desc),
            icon = Icons.Default.Videocam,
            onClick = onOnlineDoctorClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_reserve_title),
            description = stringResource(R.string.ui_service_reserve_desc),
            icon = Icons.Outlined.AutoAwesome,
            onClick = onSubscriptionClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_agenda_title),
            description = stringResource(R.string.ui_service_agenda_desc),
            icon = Icons.Default.CalendarMonth,
            onClick = onScheduleClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_prescriptions_title),
            description = stringResource(R.string.ui_service_prescriptions_desc),
            icon = Icons.Outlined.Description,
            onClick = onPrescriptionsClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_history_title),
            description = stringResource(R.string.ui_service_history_desc),
            icon = Icons.Outlined.FavoriteBorder,
            onClick = onHistoryClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_mental_title),
            description = stringResource(R.string.ui_service_mental_desc),
            icon = Icons.Outlined.Psychology,
            onClick = onMentalHealthClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_continuity_title),
            description = stringResource(R.string.ui_service_continuity_desc),
            icon = Icons.Outlined.Shield,
            onClick = onContinuityClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_prevention_title),
            description = stringResource(R.string.ui_service_prevention_desc),
            icon = Icons.Outlined.HealthAndSafety,
            onClick = onPreventionClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_reproductive_title),
            description = stringResource(R.string.ui_service_reproductive_desc),
            icon = Icons.Default.Favorite,
            onClick = onReproductiveHealthClick,
        ),
        ServiceItem(
            title = stringResource(R.string.ui_service_community_title),
            description = stringResource(R.string.ui_service_community_desc),
            icon = Icons.Default.Groups,
            onClick = onCommunityClick,
        ),
    )

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = stringResource(R.string.ui_services_heading),
                style = MaterialTheme.typography.titleMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.ui_services_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
        }

        // 2-Column Responsive Layout
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            services.chunked(2).forEach { rowItems ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    rowItems.forEach { item ->
                        ServiceCard(
                            item = item,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    // Balance odd count if needed
                    if (rowItems.size == 1) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun ServiceCard(
    item: ServiceItem,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .sizeIn(minHeight = 136.dp)
            .clip(RoundedCornerShape(24.dp))
            .clickable(
                onClickLabel = stringResource(R.string.ui_service_open_action, item.title),
                onClick = item.onClick,
            ),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            // Top Row: Obsidian Icon Container + Arrow
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                // Obsidian Icon Badge matching Web bg-slate-950 text-cyan-400
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF09090B)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = item.title,
                        tint = Color(0xFF22D3EE), // Cyan-400
                        modifier = Modifier.size(24.dp),
                    )
                }

                // Small circular arrow badge
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFF8FAFC)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = stringResource(R.string.ui_service_open_action, item.title),
                        tint = Color(0xFF64748B),
                        modifier = Modifier.size(13.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Bottom Content
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = item.title,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                    lineHeight = 18.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = item.description,
                    fontSize = 11.sp,
                    color = AuTextSecondary,
                    lineHeight = 15.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
