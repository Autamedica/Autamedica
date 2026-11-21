package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatientsAction
import com.autamedica.android.presentation.theme.PrimaryContainer

/**
 * Compact 2x2 quick-access tiles for secondary clinical areas that do NOT
 * duplicate the bottom navigation bar or the Hero.
 */
@Composable
fun CompactServicesSection(
    onHistoryClick: () -> Unit,
    onMentalHealthClick: () -> Unit,
    onPreventionClick: () -> Unit,
    onMoreServicesClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = stringResource(R.string.patient_home_other_services_heading),
            style = MaterialTheme.typography.titleMedium,
            color = AuTextPrimary,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 2.dp),
        )

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                CompactServiceTile(
                    icon = Icons.Outlined.FavoriteBorder,
                    title = stringResource(R.string.patient_home_tile_history),
                    onClick = onHistoryClick,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
                CompactServiceTile(
                    icon = Icons.Outlined.Psychology,
                    title = stringResource(R.string.patient_home_tile_mental_health),
                    onClick = onMentalHealthClick,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                CompactServiceTile(
                    icon = Icons.Outlined.Shield,
                    title = stringResource(R.string.patient_home_tile_prevention),
                    onClick = onPreventionClick,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
                CompactServiceTile(
                    icon = Icons.Outlined.GridView,
                    title = stringResource(R.string.patient_home_tile_more),
                    onClick = onMoreServicesClick,
                    highlighted = true,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
            }
        }
    }
}

@Composable
private fun CompactServiceTile(
    icon: ImageVector,
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    highlighted: Boolean = false,
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = if (highlighted) Color(0xFFF0F9FF) else Color.White,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = if (highlighted) 0.dp else 1.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(PrimaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = PortalPatientsAction,
                    modifier = Modifier.size(18.dp),
                )
            }
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = AuTextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoreServicesBottomSheet(
    onDismiss: () -> Unit,
    onClinicalDocumentsClick: () -> Unit,
    onReproductiveHealthClick: () -> Unit,
    onContinuityClick: () -> Unit,
    onHealthReserveClick: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Text(
                text = stringResource(R.string.patient_home_more_sheet_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.patient_home_more_sheet_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = AuTextSecondary,
            )
            Spacer(modifier = Modifier.height(16.dp))

            MoreServiceRow(
                icon = Icons.Outlined.FolderOpen,
                title = stringResource(R.string.patient_home_more_documents_title),
                subtitle = stringResource(R.string.patient_home_more_documents_desc),
                onClick = {
                    onDismiss()
                    onClinicalDocumentsClick()
                },
            )
            HorizontalDivider(color = Color(0xFFF1F5F9))
            MoreServiceRow(
                icon = Icons.Outlined.HealthAndSafety,
                title = stringResource(R.string.patient_home_more_reproductive_title),
                subtitle = stringResource(R.string.patient_home_more_reproductive_desc),
                onClick = {
                    onDismiss()
                    onReproductiveHealthClick()
                },
            )
            HorizontalDivider(color = Color(0xFFF1F5F9))
            MoreServiceRow(
                icon = Icons.Outlined.Shield,
                title = stringResource(R.string.patient_home_more_continuity_title),
                subtitle = stringResource(R.string.patient_home_more_continuity_desc),
                onClick = {
                    onDismiss()
                    onContinuityClick()
                },
            )
            HorizontalDivider(color = Color(0xFFF1F5F9))
            MoreServiceRow(
                icon = Icons.Outlined.AutoAwesome,
                title = stringResource(R.string.patient_home_more_reserve_title),
                subtitle = stringResource(R.string.patient_home_more_reserve_desc),
                onClick = {
                    onDismiss()
                    onHealthReserveClick()
                },
            )
        }
    }
}

@Composable
private fun MoreServiceRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(PrimaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = PortalPatientsAction,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = AuTextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = AuTextTertiary,
            modifier = Modifier.size(20.dp),
        )
    }
}
