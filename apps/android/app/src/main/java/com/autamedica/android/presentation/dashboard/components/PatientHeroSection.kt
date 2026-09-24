package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.MonetizationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Image
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.Primary
import java.util.Calendar

@Composable
fun PatientHeroSection(
    userName: String,
    subscriptionTier: String,
    benefitBalanceCredits: Int,
    onBookConsultation: () -> Unit,
    onOpenReserveDetails: () -> Unit,
    onPharmacyExpressClick: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val firstName = userName.split(" ").firstOrNull()?.ifBlank { "Paciente" } ?: "Paciente"
    val isCuidado = subscriptionTier.equals("cuidado", ignoreCase = true)
    val greeting = stringResource(getGreetingRes())

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(420.dp),
        shape = RoundedCornerShape(32.dp),
        color = Color(0xFF0F172A),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Background Image
            Image(
                painter = painterResource(id = R.drawable.hero_patient_bg),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )

            // Dark Cinematic Gradient Vignette
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color(0x7309090B),
                                Color(0xB309090B),
                                Color(0xF209090B),
                            )
                        )
                    )
            )

            // Content Overlay
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                verticalArrangement = Arrangement.Bottom,
            ) {
                // Subscription Chip Pill (48dp min touch target)
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (isCuidado) Color(0x3306B6D4) else Color(0x26FFFFFF),
                    border = BorderStroke(
                        1.dp,
                        if (isCuidado) Color(0x6606B6D4) else Color(0x33FFFFFF)
                    ),
                    modifier = Modifier
                        .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .clickable(
                            onClickLabel = if (isCuidado) stringResource(R.string.hero_plan_see_credits) else stringResource(R.string.hero_plan_learn_benefits),
                            onClick = onOpenReserveDetails,
                        ),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    ) {
                        Icon(
                            imageVector = if (isCuidado) Icons.Outlined.AutoAwesome else Icons.Outlined.MonetizationOn,
                            contentDescription = if (isCuidado) stringResource(R.string.hero_plan_care_active) else stringResource(R.string.hero_plan_health),
                            modifier = Modifier.size(14.dp),
                            tint = if (isCuidado) Color(0xFF67E8F9) else Color(0xFFE2E8F0),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (isCuidado) {
                                stringResource(R.string.hero_plan_care_credits, benefitBalanceCredits)
                            } else {
                                stringResource(R.string.hero_plan_benefits)
                            },
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isCuidado) Color(0xFF67E8F9) else Color.White,
                            maxLines = 1,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(11.dp),
                            tint = if (isCuidado) Color(0xFF67E8F9) else Color.White.copy(alpha = 0.7f),
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Uppercase Greeting
                Text(
                    text = greeting,
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White.copy(alpha = 0.7f),
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp,
                )

                Spacer(modifier = Modifier.height(6.dp))

                // Large Editorial Title
                Text(
                    text = stringResource(R.string.hero_health_on_track, firstName),
                    fontSize = 30.sp,
                    lineHeight = 36.sp,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.5).sp,
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Subtitle
                Text(
                    text = stringResource(R.string.hero_subtitle_no_waits),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.85f),
                    lineHeight = 20.sp,
                )

                Spacer(modifier = Modifier.height(20.dp))

                // Hero Action Buttons
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    // Large Hero CTA Button (48dp touch target)
                    Button(
                        onClick = onBookConsultation,
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.White,
                            contentColor = Color(0xFF09090B),
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(
                            horizontal = 12.dp,
                            vertical = 0.dp,
                        ),
                    ) {
                        Text(
                            text = stringResource(R.string.hero_consult_cta),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                        )
                    }

                    // Pharmacy On-Demand Express Button
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = Primary.copy(alpha = 0.25f),
                        border = BorderStroke(1.dp, Primary.copy(alpha = 0.5f)),
                        modifier = Modifier
                            .weight(1.15f)
                            .height(48.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .clickable(
                                onClickLabel = stringResource(id = R.string.patient_pharmacy_express_button),
                                onClick = onPharmacyExpressClick,
                            ),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                            modifier = Modifier.padding(horizontal = 8.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color(0xFF60A5FA))
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = stringResource(R.string.hero_pharmacy_guard),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color.White,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun getGreetingRes(): Int {
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when {
        hour < 12 -> R.string.greeting_morning
        hour < 19 -> R.string.greeting_afternoon
        else -> R.string.greeting_evening
    }
}
