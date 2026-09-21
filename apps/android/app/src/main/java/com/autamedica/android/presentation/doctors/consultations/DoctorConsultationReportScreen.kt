package com.autamedica.android.presentation.doctors.consultations

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.autamedica.android.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorConsultationReportScreen(
    appointmentId: String,
    onNavigateBack: () -> Unit,
    viewModel: DoctorConsultationReportViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()
    var notes by remember { mutableStateOf("") }
    var diagnosis by remember { mutableStateOf("") }
    var plan by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.report_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.clinical_ops_back)
                        )
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            Text(stringResource(R.string.report_reason_evolution_label), style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                modifier = Modifier.fillMaxWidth().height(120.dp),
                placeholder = { Text(stringResource(R.string.report_notes_placeholder)) }
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(stringResource(R.string.report_diagnosis_label), style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = diagnosis,
                onValueChange = { diagnosis = it },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(stringResource(R.string.report_treatment_plan_label), style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = plan,
                onValueChange = { plan = it },
                modifier = Modifier.fillMaxWidth().height(120.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))
            
            Button(
                onClick = { viewModel.saveReport(appointmentId, notes, diagnosis, plan) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                } else {
                    Text(stringResource(R.string.report_close_record_button))
                }
            }

            if (state.errorRes != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(stringResource(state.errorRes!!), color = MaterialTheme.colorScheme.error)
            } else if (state.error != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
            }
            if (state.isSaved) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(stringResource(R.string.report_saved_success), color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
