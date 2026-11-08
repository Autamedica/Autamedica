package com.autamedica.android.presentation.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import com.autamedica.android.R
import com.autamedica.android.domain.model.RenaperIdentity
import com.autamedica.android.domain.model.RenaperSexId

/**
 * Argentina-only patient identity lookup. Input and response stay in Compose
 * memory; the result is not stored as a verified medical credential.
 */
@Composable
fun RenaperIdentityCard(
    loading: Boolean,
    identity: RenaperIdentity?,
    errorStatus: Int?,
    onLookup: (String, RenaperSexId) -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var dni by remember { mutableStateOf("") }
    var sex by remember { mutableStateOf<RenaperSexId?>(null) }
    var consent by remember { mutableStateOf(false) }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = androidx.compose.ui.graphics.Color.White,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, androidx.compose.ui.graphics.Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(stringResource(R.string.renaper_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(stringResource(R.string.renaper_notice), style = MaterialTheme.typography.bodySmall)

            OutlinedTextField(
                value = dni,
                onValueChange = { input ->
                    dni = input.filter(Char::isDigit).take(12)
                    onClear()
                },
                enabled = !loading,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(stringResource(R.string.renaper_dni_label)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )

            Text(stringResource(R.string.renaper_sex_label), style = MaterialTheme.typography.bodyMedium)
            listOf(
                RenaperSexId.FEMALE to R.string.renaper_sex_female,
                RenaperSexId.MALE to R.string.renaper_sex_male,
                RenaperSexId.OTHER to R.string.renaper_sex_other,
            ).forEach { (value, label) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = sex == value,
                        enabled = !loading,
                        onClick = { sex = value; onClear() },
                    )
                    Text(stringResource(label), style = MaterialTheme.typography.bodyMedium)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = consent,
                    enabled = !loading,
                    onCheckedChange = { consent = it; onClear() },
                )
                Text(stringResource(R.string.renaper_consent), style = MaterialTheme.typography.bodySmall)
            }
            Button(
                onClick = {
                    val selectedSex = sex ?: return@Button
                    onLookup(dni, selectedSex)
                },
                enabled = !loading && consent && sex != null && dni.matches(Regex("^[0-9]{6,12}$")),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (loading) CircularProgressIndicator(strokeWidth = 2.dp)
                else Text(stringResource(R.string.renaper_action))
            }

            if (errorStatus != null) {
                val errorMessage = when (errorStatus) {
                    400 -> R.string.renaper_error_invalid
                    401, 403 -> R.string.renaper_error_auth
                    429 -> R.string.renaper_error_limit
                    503, 504 -> R.string.renaper_error_unavailable
                    else -> R.string.renaper_error_default
                }
                Text(stringResource(errorMessage), color = MaterialTheme.colorScheme.error)
            }

            if (identity != null) {
                if (!identity.hasPaid) {
                    Text(stringResource(R.string.renaper_partial), style = MaterialTheme.typography.bodySmall)
                }
                val name = listOf(identity.firstName, identity.lastName).filter(String::isNotBlank).joinToString(" ")
                if (name.isNotBlank()) {
                    Text(stringResource(R.string.renaper_name, name))
                }
                if (!identity.coverageName.isNullOrBlank()) {
                    Text(stringResource(R.string.renaper_coverage, identity.coverageName))
                }
                if (identity.checkedAt.isNotBlank()) {
                    Text(stringResource(R.string.renaper_checked_at, identity.checkedAt), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
