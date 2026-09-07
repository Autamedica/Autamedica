package com.autamedica.android.presentation.doctors.agenda

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorAgendaScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorAgendaViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Agenda y Disponibilidad") },
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
            Text("Editor de Franjas Horarias (Lunes a Domingo)")
            Spacer(modifier = Modifier.height(16.dp))
            
            // Placeholder for days and time slots
            Row {
                Text("Lunes")
                Switch(checked = true, onCheckedChange = { viewModel.toggleDay("Lunes") })
            }
            
            Spacer(modifier = Modifier.weight(1f))
            
            Button(
                onClick = { viewModel.saveAvailability() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Guardar Disponibilidad en Supabase")
            }
        }
    }
}
