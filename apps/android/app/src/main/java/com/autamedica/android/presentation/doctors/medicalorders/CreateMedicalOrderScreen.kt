package com.autamedica.android.presentation.doctors.medicalorders

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateMedicalOrderScreen(
    patientId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorMedicalOrdersViewModel = viewModel()
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Nueva Orden Médica") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = modifier
                .padding(paddingValues)
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text("Prescribir Estudios (Paciente: $patientId)")
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(value = "", onValueChange = {}, label = { Text("Tipo (Análisis de sangre, radiografía...)") }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(value = "", onValueChange = {}, label = { Text("Indicaciones clínicas") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
            
            Spacer(modifier = Modifier.weight(1f))
            Button(
                onClick = { viewModel.createOrder(); onBack() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Generar Orden Médica")
            }
        }
    }
}
