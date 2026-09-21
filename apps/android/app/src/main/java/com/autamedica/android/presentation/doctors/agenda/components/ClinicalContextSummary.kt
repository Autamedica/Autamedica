package com.autamedica.android.presentation.doctors.agenda.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.PatientClinicalContext
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClinicalContextSummary(
    context: PatientClinicalContext?,
    fallbackReason: String?,
    hasPatient: Boolean,
    isLoading: Boolean,
    modifier: Modifier = Modifier,
    dense: Boolean = false,
    onOpenAnamnesis: (() -> Unit)? = null,
) {
    if (isLoading) {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp,
                color = PortalDoctors,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.doctor_agenda_clinical_loading),
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
            )
        }
        return
    }

    val reason = context?.chiefComplaint?.ifBlank { null }
        ?: fallbackReason?.ifBlank { null }
        ?: stringResource(R.string.doctor_agenda_clinical_not_specified)

    val emptyClinicalText = when {
        !hasPatient -> stringResource(R.string.doctor_agenda_clinical_guest_no_file)
        context?.hasAnamnesis == true -> stringResource(R.string.doctor_agenda_clinical_no_data)
        else -> stringResource(R.string.doctor_agenda_clinical_no_shared_anamnesis)
    }

    val chronicDiseases = context?.chronicDiseases.orEmpty()
    val allergies = context?.allergies.orEmpty()
    val hasHistory = chronicDiseases.isNotEmpty() || allergies.isNotEmpty()

    Column(modifier = modifier.fillMaxWidth()) {
        // 3 Blocks (Motivo, Antecedentes, Medicación)
        Column(verticalArrangement = Arrangement.spacedBy(if (dense) 12.dp else 16.dp)) {
            // 1. Motivo de consulta
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.MedicalServices,
                        contentDescription = null,
                        tint = PortalDoctors,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = stringResource(R.string.doctor_agenda_clinical_chief_complaint_title),
                        style = MaterialTheme.typography.labelSmall,
                        color = PortalDoctors,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        letterSpacing = 1.sp,
                    )
                }
                Text(
                    text = reason,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Medium,
                )
            }

            // 2. Antecedentes relevantes
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = Color(0xFFD97706), // Amber-600
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = stringResource(R.string.doctor_agenda_clinical_history_title),
                        style = MaterialTheme.typography.labelSmall,
                        color = PortalDoctors,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        letterSpacing = 1.sp,
                    )
                }

                if (hasHistory) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        chronicDiseases.forEach { disease ->
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = Color(0xFFFFFBEB), // amber-50
                                border = BorderStroke(1.dp, Color(0xFFFDE68A)), // amber-200
                            ) {
                                Text(
                                    text = disease,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFFB45309), // amber-700
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                )
                            }
                        }

                        allergies.forEach { allergy ->
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = Color(0xFFFEF2F2), // red-50
                                border = BorderStroke(1.dp, Color(0xFFFECACA)), // red-200
                            ) {
                                Text(
                                    text = allergy,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFFB91C1C), // red-700
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                )
                            }
                        }
                    }
                } else {
                    Text(
                        text = emptyClinicalText,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                        fontStyle = FontStyle.Italic,
                    )
                }
            }

            // 3. Medicación actual
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Medication,
                        contentDescription = null,
                        tint = PortalDoctors,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = stringResource(R.string.doctor_agenda_clinical_medication_title),
                        style = MaterialTheme.typography.labelSmall,
                        color = PortalDoctors,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        letterSpacing = 1.sp,
                    )
                }

                val med = context?.medications?.ifBlank { null }
                Text(
                    text = med ?: emptyClinicalText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (med != null) AuTextPrimary else AuTextTertiary,
                    fontStyle = if (med != null) FontStyle.Normal else FontStyle.Italic,
                )
            }
        }

        // Anamnesis link button
        if (context?.hasAnamnesis == true && onOpenAnamnesis != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = Color.Transparent,
            ) {
                TextButton(
                    onClick = onOpenAnamnesis,
                    modifier = Modifier.align(Alignment.End),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Description,
                        contentDescription = null,
                        tint = PortalDoctors,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.doctor_agenda_clinical_btn_view_anamnesis),
                        style = MaterialTheme.typography.labelSmall,
                        color = PortalDoctors,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = null,
                        tint = PortalDoctors,
                        modifier = Modifier.size(13.dp),
                    )
                }
            }
        }
    }
}
