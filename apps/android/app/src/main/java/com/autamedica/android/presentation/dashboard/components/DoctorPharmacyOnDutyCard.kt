package com.autamedica.android.presentation.dashboard.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.LocalPharmacy
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.DoctorOnDutyPharmacyState
import com.autamedica.android.domain.model.PharmacyConsultationRequest
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary

@Composable
fun DoctorPharmacyOnDutyCard(
    state: DoctorOnDutyPharmacyState,
    onToggleDuty: (Boolean) -> Unit,
    onClaimRequest: (String) -> Unit,
    modifier: Modifier = Modifier,
    claimingRequestId: String? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = AuSurface,
        border = BorderStroke(
            width = if (state.isOnDuty) 1.5.dp else 1.dp,
            color = if (state.isOnDuty) AuAccent.copy(alpha = 0.5f) else AuBorder
        ),
        shadowElevation = if (state.isOnDuty) 2.dp else 0.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp)
        ) {
            // Header: Icon + Title + Switch
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(
                                if (state.isOnDuty) AuAccent.copy(alpha = 0.12f)
                                else MaterialTheme.colorScheme.surfaceVariant
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.LocalPharmacy,
                            contentDescription = stringResource(R.string.pharmacy_on_demand_title),
                            tint = if (state.isOnDuty) AuAccent else AuTextSecondary,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = stringResource(R.string.pharmacy_on_demand_title),
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = AuTextPrimary
                                )
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            // Status Dot
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (state.isOnDuty) AuSuccess else AuTextTertiary)
                            )
                        }

                        Text(
                            text = if (state.isOnDuty) {
                                stringResource(R.string.pharmacy_on_demand_status_active)
                            } else {
                                stringResource(R.string.pharmacy_on_demand_status_inactive)
                            },
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = if (state.isOnDuty) AuSuccess else AuTextSecondary,
                                fontSize = 12.sp
                            )
                        )
                    }
                }

                Switch(
                    checked = state.isOnDuty,
                    onCheckedChange = onToggleDuty,
                    enabled = !state.isLoading,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = AuAccent,
                        uncheckedThumbColor = AuTextTertiary,
                        uncheckedTrackColor = AuBorder
                    )
                )
            }

            // On-Duty Active Panel
            AnimatedVisibility(
                visible = state.isOnDuty,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    // Queue count banner
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (state.waitingQueueCount > 0) AuAccent.copy(alpha = 0.08f)
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                            )
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.FlashOn,
                                contentDescription = null,
                                tint = if (state.waitingQueueCount > 0) AuAccent else AuTextSecondary,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (state.waitingQueueCount > 0) {
                                    stringResource(R.string.pharmacy_on_demand_pending_badge, state.waitingQueueCount)
                                } else {
                                    stringResource(R.string.pharmacy_on_demand_no_pending)
                                },
                                style = MaterialTheme.typography.labelMedium.copy(
                                    fontWeight = if (state.waitingQueueCount > 0) FontWeight.Bold else FontWeight.Normal,
                                    color = if (state.waitingQueueCount > 0) AuAccent else AuTextSecondary
                                )
                            )
                        }
                    }

                    // Pending requests list
                    if (state.pendingRequests.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            state.pendingRequests.forEach { request ->
                                PharmacyRequestItem(
                                    request = request,
                                    isClaiming = claimingRequestId == request.id,
                                    onClaim = { onClaimRequest(request.id) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PharmacyRequestItem(
    request: PharmacyConsultationRequest,
    isClaiming: Boolean,
    onClaim: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, AuBorder)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = request.patientName,
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "${stringResource(R.string.pharmacy_on_demand_dni_label)} ${request.patientDni} • ${request.pharmacyName}",
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = AuTextSecondary,
                            fontSize = 11.sp
                        )
                    )
                }

                if (request.minutesWaiting > 0) {
                    Text(
                        text = "${request.minutesWaiting} min",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = if (request.minutesWaiting > 5) AuDanger else AuTextSecondary,
                            fontWeight = FontWeight.Medium
                        )
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "${stringResource(R.string.pharmacy_on_demand_reason_label)} ${request.reason}",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = AuTextSecondary,
                    fontSize = 12.sp
                ),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(10.dp))

            Button(
                onClick = onClaim,
                enabled = !isClaiming,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AuAccent,
                    contentColor = Color.White
                )
            ) {
                if (isClaiming) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.pharmacy_on_demand_claiming),
                        style = MaterialTheme.typography.labelMedium
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.pharmacy_on_demand_claim_btn),
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    }
}
