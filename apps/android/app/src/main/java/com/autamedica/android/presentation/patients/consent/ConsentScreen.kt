package com.autamedica.android.presentation.patients.consent

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary

@Composable
fun ConsentScreen(
    onAccept: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ConsentViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = modifier.fillMaxSize().background(AuBackground).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(stringResource(R.string.consent_title), style = MaterialTheme.typography.headlineSmall, color = AuTextPrimary)
        Text(stringResource(R.string.consent_description), color = AuTextSecondary)
        
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = uiState.isAccepted, 
                onCheckedChange = { viewModel.onAcceptedChanged(it); viewModel.onReadConsentChanged(it) },
                colors = CheckboxDefaults.colors(checkedColor = AuAccent)
            )
            Text(stringResource(R.string.consent_checkbox_label), color = AuTextPrimary)
        }

        Spacer(modifier = Modifier.weight(1f))

        Button(
            onClick = onAccept,
            enabled = uiState.isAccepted,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = AuAccent)
        ) {
            Text(stringResource(R.string.consent_submit_button))
        }
    }
}
