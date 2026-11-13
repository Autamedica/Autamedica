package com.autamedica.android.presentation.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.Primary

/**
 * Explicit clinical jurisdiction selector shared by pharmacy intake and Agenda.
 * The onClick does not infer or persist a care country from UI locale; callers
 * own that decision and validate it against their corresponding backend.
 */
@Composable
fun CareCountryPicker(
    selectedCountry: String?,
    onCountrySelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    showTitle: Boolean = true,
    showMedicalRegistration: Boolean = false,
    enabled: Boolean = true,
) {
    val haptic = LocalHapticFeedback.current
    Column(modifier = modifier) {
        if (showTitle) {
            Text(
                text = stringResource(R.string.pharmacy_flow_country_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            listOf(Triple("AR", "🇦🇷", "Argentina"), Triple("BR", "🇧🇷", "Brasil")).forEach { (country, flag, label) ->
                val selected = selectedCountry == country
                val accessibilityLabel = stringResource(R.string.pharmacy_flow_country_select, label)
                Surface(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onCountrySelected(country)
                    },
                    enabled = enabled,
                    modifier = Modifier
                        .weight(1f)
                        .height(116.dp)
                        .semantics { contentDescription = accessibilityLabel },
                    shape = RoundedCornerShape(18.dp),
                    color = if (selected) Primary.copy(alpha = 0.08f) else AuSurface,
                    border = BorderStroke(
                        if (selected) 2.dp else 1.dp,
                        if (selected) Primary else AuBorder,
                    ),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                        modifier = Modifier.padding(10.dp),
                    ) {
                        Text(text = flag, fontSize = 32.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                            if (selected) {
                                Spacer(modifier = Modifier.width(4.dp))
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Primary,
                                    modifier = Modifier.size(15.dp),
                                )
                            }
                        }
                        Text(
                            text = if (showMedicalRegistration) {
                                if (country == "BR") "CRM" else "MN / MP"
                            } else {
                                if (country == "BR") "CPF" else "DNI"
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextSecondary,
                        )
                    }
                }
            }
        }
    }
}
