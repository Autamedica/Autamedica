package com.autamedica.android.presentation.patients.psychiatry

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PsychiatryIntakeScreen(
    onBack: () -> Unit,
    onNavigateToTdahEvaluation: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: PsychiatryIntakeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.psychiatry_intake_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.psychiatry_intake_back_cd)
                        )
                    }
                }
            )
        },
        modifier = modifier
    ) { innerPadding ->
        if (uiState.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        if (uiState.isSubmitted) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = stringResource(R.string.psychiatry_intake_submitted_title),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = stringResource(R.string.psychiatry_intake_submitted_desc),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Button(onClick = onNavigateToTdahEvaluation) {
                        Text(stringResource(R.string.psychiatry_intake_tdah_btn))
                    }
                    Button(onClick = onBack) {
                        Text(stringResource(R.string.psychiatry_intake_back_home_btn))
                    }
                }
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = stringResource(R.string.psychiatry_intake_form_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )

            OutlinedTextField(
                value = uiState.reasonForVisit,
                onValueChange = viewModel::onReasonForVisitChanged,
                label = { Text(stringResource(R.string.psychiatry_intake_reason_label)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            OutlinedTextField(
                value = uiState.previousHistory,
                onValueChange = viewModel::onPreviousHistoryChanged,
                label = { Text(stringResource(R.string.psychiatry_intake_history_label)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            OutlinedTextField(
                value = uiState.currentMedication,
                onValueChange = viewModel::onCurrentMedicationChanged,
                label = { Text(stringResource(R.string.psychiatry_intake_medication_label)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            Button(
                onClick = viewModel::submitIntake,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                enabled = uiState.reasonForVisit.isNotBlank()
            ) {
                Text(
                    stringResource(R.string.psychiatry_intake_submit_btn),
                    modifier = Modifier.padding(vertical = 4.dp)
                )
            }
        }
    }
}
