package com.autamedica.android.presentation.health

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuBorder
import androidx.compose.foundation.shape.RoundedCornerShape

@Composable
fun AdverseEventsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AdverseEventsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    val textFieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = AuTextPrimary,
        unfocusedTextColor = AuTextPrimary,
        focusedContainerColor = AuBackground,
        unfocusedContainerColor = AuBackground,
        focusedBorderColor = AuAccent,
        unfocusedBorderColor = AuBorder,
    )

    Column(
        modifier = modifier.fillMaxSize().background(AuBackground).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Reporte de Eventos Adversos", style = MaterialTheme.typography.headlineSmall, color = AuTextPrimary)
        
        OutlinedTextField(
            value = uiState.medication,
            onValueChange = viewModel::onMedicationChange,
            label = { Text("Medicamento sospechoso") },
            modifier = Modifier.fillMaxWidth(),
            colors = textFieldColors,
            shape = RoundedCornerShape(14.dp)
        )

        Text("Severidad:", color = AuTextPrimary)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Leve", "Moderada", "Grave").forEach { level ->
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    RadioButton(
                        selected = uiState.severity == level,
                        onClick = { viewModel.onSeverityChange(level) },
                        colors = RadioButtonDefaults.colors(selectedColor = AuAccent)
                    )
                    Text(level, color = AuTextPrimary)
                }
            }
        }

        OutlinedTextField(
            value = uiState.description,
            onValueChange = viewModel::onDescriptionChange,
            label = { Text("Descripción de síntomas") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
            colors = textFieldColors,
            shape = RoundedCornerShape(14.dp)
        )

        Spacer(modifier = Modifier.weight(1f))

        Button(
            onClick = onBack, 
            modifier = Modifier.fillMaxWidth().height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = AuAccent),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text("Enviar Reporte")
        }
    }
}
