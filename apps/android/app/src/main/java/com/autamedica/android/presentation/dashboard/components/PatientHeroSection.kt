package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import java.util.Calendar

@OptIn(ExperimentalLayoutApi::class)
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
    val colors = MaterialTheme.colorScheme
    val firstName = userName.trim().split(Regex("\\s+")).firstOrNull()?.ifBlank { "Paciente" } ?: "Paciente"
    val isCuidado = subscriptionTier.equals("cuidado", ignoreCase = true)
    val greeting = stringResource(
        when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
            in 0..11 -> R.string.greeting_morning
            in 12..18 -> R.string.greeting_afternoon
            else -> R.string.greeting_evening
        },
    )
    val serviceCards: List<Pair<ImageVector, Int>> = listOf(
        Icons.Filled.MedicalServices to R.string.patient_home_chip_consultation,
        Icons.Filled.Description to R.string.patient_home_chip_documents,
        Icons.Filled.LocationOn to R.string.patient_home_chip_pharmacy,
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp),
        color = colors.surface,
        contentColor = colors.onSurface,
        border = BorderStroke(1.dp, colors.outlineVariant),
        tonalElevation = 1.dp,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 468.dp)
                    .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)),
            ) {
                Image(
                    painter = painterResource(R.drawable.hero_patient_bg),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    alignment = BiasAlignment(horizontalBias = 0f, verticalBias = -0.44f),
                    modifier = Modifier.fillMaxSize(),
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color(0x2206111A),
                                    Color(0x4406111A),
                                    Color(0xF20A1824),
                                ),
                            ),
                        ),
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.horizontalGradient(
                                colors = listOf(
                                    Color(0x5506111A),
                                    Color.Transparent,
                                ),
                            ),
                        ),
                )

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 22.dp),
                    verticalArrangement = Arrangement.spacedBy(13.dp),
                ) {
                    Surface(
                        modifier = Modifier
                            .clickable(onClick = onOpenReserveDetails),
                        shape = RoundedCornerShape(999.dp),
                        color = Color(0x66313D46),
                        contentColor = Color.White,
                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.62f)),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = if (isCuidado) {
                                    stringResource(R.string.hero_plan_care_credits, benefitBalanceCredits)
                                } else {
                                    stringResource(R.string.hero_plan_benefits)
                                },
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }

                    Text(
                        text = greeting,
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White.copy(alpha = 0.94f),
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.4.sp,
                    )
                    Text(
                        text = stringResource(R.string.hero_health_on_track, firstName),
                        style = MaterialTheme.typography.headlineLarge,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        lineHeight = 38.sp,
                    )
                    Text(
                        text = stringResource(R.string.hero_subtitle_no_waits),
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White.copy(alpha = 0.92f),
                        lineHeight = 24.sp,
                    )

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 5.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Button(
                            onClick = onPharmacyExpressClick,
                            modifier = Modifier
                                .weight(1.15f)
                                .heightIn(min = 64.dp),
                            shape = RoundedCornerShape(999.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.White,
                                contentColor = Color(0xFF101827),
                            ),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                horizontal = 10.dp,
                                vertical = 12.dp,
                            ),
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = stringResource(R.string.patient_home_immediate_cta),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    textAlign = TextAlign.Center,
                                    lineHeight = 16.sp,
                                )
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                    contentDescription = null,
                                    modifier = Modifier
                                        .padding(start = 4.dp)
                                        .size(17.dp),
                                )
                            }
                        }

                        OutlinedButton(
                            onClick = onBookConsultation,
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 64.dp),
                            shape = RoundedCornerShape(999.dp),
                            border = BorderStroke(1.3.dp, Color.White.copy(alpha = 0.88f)),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = Color(0x33101827),
                                contentColor = Color.White,
                            ),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                horizontal = 8.dp,
                                vertical = 10.dp,
                            ),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.CalendarMonth,
                                contentDescription = null,
                                modifier = Modifier
                                    .padding(end = 5.dp)
                                    .size(17.dp),
                            )
                            Text(
                                text = stringResource(R.string.patient_home_scheduled_cta),
                                style = MaterialTheme.typography.labelMedium,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center,
                                lineHeight = 14.sp,
                            )
                        }
                    }

                    Text(
                        text = stringResource(R.string.patient_home_immediate_hint),
                        modifier = Modifier.fillMaxWidth(),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.9f),
                        textAlign = TextAlign.Center,
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = colors.primaryContainer,
                    contentColor = colors.onPrimaryContainer,
                ) {
                    Text(
                        text = stringResource(R.string.patient_home_immediate_tag),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }

                Text(
                    text = stringResource(R.string.patient_home_immediate_title),
                    style = MaterialTheme.typography.headlineMedium,
                    color = colors.onSurface,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 34.sp,
                )

                Text(
                    text = stringResource(R.string.patient_home_immediate_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceVariant,
                    lineHeight = 22.sp,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    serviceCards.forEach { (icon, labelRes) ->
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 116.dp),
                            shape = RoundedCornerShape(18.dp),
                            color = Color(0xFFF1F8FA),
                            contentColor = Color(0xFF123344),
                            border = BorderStroke(1.dp, Color(0xFFD7E8ED)),
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 7.dp, vertical = 12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center,
                            ) {
                                Icon(
                                    imageVector = icon,
                                    contentDescription = null,
                                    tint = Color(0xFF086B82),
                                    modifier = Modifier.size(27.dp),
                                )
                                Text(
                                    text = stringResource(labelRes),
                                    modifier = Modifier.padding(top = 8.dp),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    textAlign = TextAlign.Center,
                                    lineHeight = 16.sp,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}