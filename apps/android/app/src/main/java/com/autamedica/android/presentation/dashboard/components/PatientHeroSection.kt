package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.PortalPatientsAction
import java.util.Calendar

@Composable
fun PatientHeroSection(
    userName: String,
    subscriptionTier: String,
    benefitBalanceCredits: Int,
    onBookConsultation: () -> Unit,
    onOpenReserveDetails: () -> Unit,
    onPharmacyExpressClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val defaultPatientName = stringResource(R.string.role_label_patient)
    val firstName = userName.trim().split(Regex("\\s+")).firstOrNull()?.ifBlank { defaultPatientName } ?: defaultPatientName
    val greeting = stringResource(
        when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
            in 0..11 -> R.string.greeting_morning
            in 12..18 -> R.string.greeting_afternoon
            else -> R.string.greeting_evening
        },
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color.White,
        border = BorderStroke(1.dp, AuBorder),
        shadowElevation = 2.dp,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Visual anchor loved by users — clean full-bleed banner with AutaMedica sky gradient
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(136.dp)
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)),
            ) {
                Image(
                    painter = painterResource(R.drawable.hero_patient_bg),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color(0x1A0369A1),
                                    Color(0x000369A1),
                                    Color(0x8A0369A1),
                                ),
                            ),
                        ),
                )

                // Live readiness badge (Uber-style instant signal, zero clutter)
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(14.dp),
                    shape = RoundedCornerShape(999.dp),
                    color = Color.White.copy(alpha = 0.94f),
                    shadowElevation = 1.dp,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(AuEmerald),
                        )
                        Text(
                            text = stringResource(R.string.patient_home_live_badge),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = AuTextPrimary,
                            maxLines = 1,
                            softWrap = false,
                        )
                    }
                }

                // Greeting eyebrow anchored cleanly at the bottom of the hero image
                Text(
                    text = greeting,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(horizontal = 18.dp, vertical = 12.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.4.sp,
                )
            }

            // Street-readable content block: 1 title + 1 clear 3-pillar sentence + 2 thumb-friendly actions
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = stringResource(R.string.hero_health_on_track, firstName),
                        style = MaterialTheme.typography.headlineSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                        lineHeight = 28.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(R.string.patient_home_value_prop_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextSecondary,
                        lineHeight = 20.sp,
                    )
                }

                // Primary CTA — High-contrast AutaMedica Blue (5.93:1 WCAG AA, 56dp street thumb target)
                Button(
                    onClick = onPharmacyExpressClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 54.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PortalPatientsAction,
                        contentColor = Color.White,
                    ),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = stringResource(R.string.patient_home_primary_cta),
                            style = MaterialTheme.typography.labelLarge,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }

                // Secondary CTA — Calm outlined sky action for scheduled appointments
                OutlinedButton(
                    onClick = onBookConsultation,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = PortalPatientsAction,
                        containerColor = Color(0xFFF0F9FF),
                    ),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 11.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.patient_home_secondary_cta),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}
