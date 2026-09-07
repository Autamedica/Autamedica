package com.autamedica.android.presentation.patients.continuity

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContinuityStatusScreen(
    onBack: () -> Unit,
    viewModel: ContinuityStatusViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Estado de tu solicitud") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFFF8FBFF))
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else if (uiState.status == "none" || uiState.request == null) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Sin solicitudes activas", style = MaterialTheme.typography.titleLarge)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "No tenés solicitudes de continuidad en curso.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.Gray
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(onClick = onBack) {
                        Text("Volver al inicio")
                    }
                }
            } else {
                val request = uiState.request!!
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                ) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            // Status Badge
                            val statusLabel = when (request.triageStatus) {
                                "pending" -> "Solicitud recibida"
                                "acknowledged" -> "En revisión médica"
                                "in_progress" -> "En proceso"
                                "resolved" -> "Resuelto"
                                "escalated" -> "Derivado a consulta"
                                else -> "Desconocido"
                            }
                            
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(Color(0xFFFFF7ED))
                                    .border(1.dp, Color(0xFFFFEDD5), RoundedCornerShape(16.dp))
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = statusLabel,
                                    color = Color(0xFFD97706),
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.labelMedium
                                )
                            }
                            
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            // Medication Info
                            request.medication?.let { med ->
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Color(0xFFF1F5F9))
                                        .padding(12.dp)
                                ) {
                                    Column {
                                        Text(med.name, fontWeight = FontWeight.Bold)
                                        Text(med.dose, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                        med.daysRemaining?.let { days ->
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text(
                                                if (days == 0) "Sin medicación disponible" else "$days días restantes",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = if (days <= 3) Color.Red else Color.Gray
                                            )
                                        }
                                    }
                                }
                                Spacer(modifier = Modifier.height(16.dp))
                            }
                            
                            // Timeline
                            TimelineStep(label = "Solicitud recibida", date = request.createdAt, done = true)
                            Spacer(modifier = Modifier.height(8.dp))
                            TimelineStep(label = "En revisión médica", date = request.acknowledgedAt, done = request.acknowledgedAt != null)
                            Spacer(modifier = Modifier.height(8.dp))
                            TimelineStep(label = "Resolución", date = request.resolvedAt, done = request.resolvedAt != null)
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { /* priority contact logic */ },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Contacto prioritario")
                    }
                }
            }
        }
    }
}

@Composable
fun TimelineStep(label: String, date: String?, done: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .background(if (done) Color(0xFFD1FAE5) else Color.White)
                .border(2.dp, if (done) Color.Transparent else Color.LightGray, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            if (done) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(16.dp))
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(label, fontWeight = FontWeight.Medium, color = if (done) Color.Black else Color.Gray)
            if (date != null) {
                Text(date, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            }
        }
    }
}
