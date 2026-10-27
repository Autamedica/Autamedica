package com.autamedica.android.presentation.doctors.signature

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.autamedica.android.R

/**
 * Professional license validation only.
 *
 * A finger-drawn signature is not PAdES, and SISA/REFEPS identity checks
 * do not issue a personal FirmAR certificate. No fake success action is shown.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorSignatureScreen(
    onNavigateBack: () -> Unit,
    viewModel: DoctorSignatureViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsState()
    var dni by remember { mutableStateOf("") }
    var licenseNumber by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(stringResource(R.string.signature_title)) })
        },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = dni,
                onValueChange = { dni = it.filter(Char::isDigit).take(9) },
                label = { Text(stringResource(R.string.signature_label_dni)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = licenseNumber,
                onValueChange = { licenseNumber = it },
                label = { Text(stringResource(R.string.signature_label_license)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { viewModel.validateWithSisaRefeps(dni, licenseNumber) },
                enabled = !state.isLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    when {
                        state.isLoading -> stringResource(R.string.signature_verifying)
                        state.sisaValidated -> stringResource(R.string.signature_status_verified_button)
                        else -> stringResource(R.string.signature_button_verify)
                    },
                )
            }
            when {
                state.isLoading -> Unit
                state.sisaValidated -> Text(
                    state.validationMessageRes?.let { stringResource(it) }
                        ?: state.validationMessage
                        ?: stringResource(R.string.signature_status_sisa_verified),
                    color = Color(0xFF00C853),
                )
                state.errorMessageRes != null -> Text(
                    stringResource(state.errorMessageRes!!),
                    color = MaterialTheme.colorScheme.error,
                )
                state.errorMessage != null -> Text(
                    state.errorMessage!!,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            Card(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = stringResource(R.string.signature_remote_pending_notice),
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}
