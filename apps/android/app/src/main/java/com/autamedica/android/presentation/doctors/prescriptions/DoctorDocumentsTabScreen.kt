package com.autamedica.android.presentation.doctors.prescriptions

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Verified
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
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.presentation.doctors.certificates.DoctorCertificatesScreen
import com.autamedica.android.presentation.doctors.medicalorders.DoctorMedicalOrdersScreen
import com.autamedica.android.presentation.main.DoctorDocumentSegment
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.PortalPatientsAction

/**
 * Unified Doctor Documents hub inside the "Recetas" bottom tab.
 * Mirrors the Patient 3-button document switcher (Recetas · Certificados · Órdenes)
 * in high-contrast AutaMedica Blue (#0369A1, 5.93:1).
 */
@Composable
fun DoctorDocumentsTabScreen(
    selectedSegment: DoctorDocumentSegment,
    onSelectSegment: (DoctorDocumentSegment) -> Unit,
    onNavigateToCreatePrescription: () -> Unit,
    onNavigateToCreateCertificate: () -> Unit,
    onNavigateToCreateOrder: () -> Unit,
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
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .height(IntrinsicSize.Min)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                DoctorDocumentSegmentButton(
                    icon = Icons.Outlined.Medication,
                    label = stringResource(R.string.docs_tab_prescriptions_short),
                    selected = selectedSegment == DoctorDocumentSegment.PRESCRIPTIONS,
                    onClick = { onSelectSegment(DoctorDocumentSegment.PRESCRIPTIONS) },
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
                DoctorDocumentSegmentButton(
                    icon = Icons.Outlined.Verified,
                    label = stringResource(R.string.docs_tab_certificates_short),
                    selected = selectedSegment == DoctorDocumentSegment.CERTIFICATES,
                    onClick = { onSelectSegment(DoctorDocumentSegment.CERTIFICATES) },
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
                DoctorDocumentSegmentButton(
                    icon = Icons.AutoMirrored.Outlined.Assignment,
                    label = stringResource(R.string.docs_tab_orders_short),
                    selected = selectedSegment == DoctorDocumentSegment.ORDERS,
                    onClick = { onSelectSegment(DoctorDocumentSegment.ORDERS) },
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                )
            }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .consumeWindowInsets(WindowInsets.statusBars),
        ) {
            when (selectedSegment) {
                DoctorDocumentSegment.PRESCRIPTIONS -> DoctorPrescriptionsScreen(
                    onBack = {},
                    onNavigateToCreatePrescription = onNavigateToCreatePrescription,
                    showBackButton = false,
                )
                DoctorDocumentSegment.CERTIFICATES -> DoctorCertificatesScreen(
                    onBack = {},
                    onNavigateToCreateCertificate = onNavigateToCreateCertificate,
                    showBackButton = false,
                )
                DoctorDocumentSegment.ORDERS -> DoctorMedicalOrdersScreen(
                    onBack = {},
                    onNavigateToCreateOrder = onNavigateToCreateOrder,
                    showBackButton = false,
                )
            }
        }
    }
}

@Composable
private fun DoctorDocumentSegmentButton(
    icon: ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (selected) PortalPatientsAction else Color.White,
        border = BorderStroke(1.dp, if (selected) PortalPatientsAction else AuBorder),
        shadowElevation = if (selected) 1.dp else 0.dp,
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 6.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) Color.White else PortalPatientsAction,
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontSize = 11.5.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                color = if (selected) Color.White else AuTextPrimary,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
