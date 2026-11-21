package com.autamedica.android.presentation.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.autamedica.android.R
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.RenaperIdentity
import com.autamedica.android.domain.model.RenaperLookupPolicy
import com.autamedica.android.domain.model.RenaperSexId

/**
 * Argentina-only patient identity lookup. Input and preview stay in Compose
 * memory; the server owns masking and persists official status in Postgres.
 */
@Composable
fun RenaperIdentityCard(
    patient: PatientProfileSnapshot,
    loading: Boolean,
    identity: RenaperIdentity?,
    errorStatus: Int?,
    onLookup: (RenaperSexId) -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var sex by remember { mutableStateOf<RenaperSexId?>(null) }
    var consent by remember { mutableStateOf(false) }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color.White,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = stringResource(R.string.renaper_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.renaper_notice),
                style = MaterialTheme.typography.bodySmall,
            )

            if (patient.identityStatus == "verified_renaper") {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFF0FDF4),
                    border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.renaper_status_recorded_title),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF166534),
                        )
                        Text(
                            text = stringResource(R.string.renaper_status_recorded_notice),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF166534),
                        )
                        if (!patient.pucoCoverageName.isNullOrBlank()) {
                            Text(
                                text = stringResource(R.string.renaper_coverage, patient.pucoCoverageName),
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF166534),
                            )
                        }
                    }
                }
            }

            // The client never accepts a free-text DNI for this operation.
            // Show only an obscured hint of the registered patient's document.
            val maskedDni = RenaperLookupPolicy.maskedDni(patient)
            if (maskedDni == null) {
                Text(
                    text = stringResource(R.string.renaper_dni_missing),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                Text(
                    text = stringResource(R.string.renaper_dni_registered, maskedDni),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            Text(
                text = stringResource(R.string.renaper_sex_label),
                style = MaterialTheme.typography.bodyMedium,
            )
            listOf(
                RenaperSexId.FEMALE to R.string.renaper_sex_female,
                RenaperSexId.MALE to R.string.renaper_sex_male,
                RenaperSexId.OTHER to R.string.renaper_sex_other,
            ).forEach { (value, label) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = sex == value,
                        enabled = !loading,
                        onClick = {
                            sex = value
                            onClear()
                        },
                    )
                    Text(
                        text = stringResource(label),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = consent,
                    enabled = !loading,
                    onCheckedChange = {
                        consent = it
                        onClear()
                    },
                )
                Text(
                    text = stringResource(R.string.renaper_consent),
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Button(
                onClick = {
                    val selectedSex = sex ?: return@Button
                    onLookup(selectedSex)
                },
                enabled = !loading && consent && (sex?.let { RenaperLookupPolicy.canQuery(patient, it) } == true),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (loading) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                } else {
                    Text(stringResource(R.string.renaper_action))
                }
            }

            if (errorStatus != null) {
                val errorMessage = when (errorStatus) {
                    400 -> R.string.renaper_error_invalid
                    401 -> R.string.renaper_error_auth
                    403 -> R.string.renaper_error_scope
                    409 -> R.string.renaper_error_mismatch
                    429 -> R.string.renaper_error_limit
                    503, 504 -> R.string.renaper_error_unavailable
                    else -> R.string.renaper_error_default
                }
                Text(
                    text = stringResource(errorMessage),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            if (identity != null) {
                Text(
                    text = stringResource(R.string.renaper_data_matched),
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(R.string.renaper_identity_not_verified),
                    style = MaterialTheme.typography.bodySmall,
                )
                if (identity.identityStatus == "mismatch") {
                    Text(
                        text = stringResource(R.string.renaper_status_mismatch),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                if (!identity.hasPaid) {
                    Text(
                        text = stringResource(R.string.renaper_partial),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                val name = listOf(identity.firstName, identity.lastName)
                    .filter(String::isNotBlank)
                    .joinToString(" ")
                if (name.isNotBlank()) {
                    Text(stringResource(R.string.renaper_name, name))
                }
                if (!identity.coverageName.isNullOrBlank()) {
                    Text(stringResource(R.string.renaper_coverage, identity.coverageName))
                }
                if (identity.maskedAddress.isNotBlank()) {
                    Text(stringResource(R.string.renaper_address, identity.maskedAddress))
                }

                // Never decode, display or fetch RENAPER image bytes here.
                // Even if an official photo exists, only a generic locked
                // silhouette is shown until a separate identity-ownership flow.
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(68.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(12.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Person,
                            contentDescription = null,
                            modifier = Modifier.size(36.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Icon(
                            imageVector = Icons.Outlined.Lock,
                            contentDescription = null,
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(5.dp)
                                .size(17.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        text = stringResource(
                            if (identity.photoAvailable) R.string.renaper_photo_hidden
                            else R.string.renaper_photo_unavailable,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Text(
                    text = stringResource(R.string.renaper_photo_preview_note),
                    style = MaterialTheme.typography.bodySmall,
                )
                if (identity.checkedAt.isNotBlank()) {
                    Text(
                        text = stringResource(R.string.renaper_checked_at, identity.checkedAt),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}
