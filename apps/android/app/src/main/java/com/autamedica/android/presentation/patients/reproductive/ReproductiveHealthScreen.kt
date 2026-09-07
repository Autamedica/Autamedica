package com.autamedica.android.presentation.patients.reproductive

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.viewmodel.compose.viewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReproductiveHealthScreen(
    onBack: () -> Unit,
    viewModel: ReproductiveHealthViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Salud Reproductiva (IVE)") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Atrás")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
        ) {
            HeaderSection(
                onRequestConsultation = { viewModel.setShowUrgentContact(true) }
            )
            
            UrgentAlertSection(
                onRequestConsultation = { viewModel.setShowUrgentContact(true) }
            )
            
            TabRow(selectedTabIndex = state.activeTab.ordinal) {
                ReproductiveTab.entries.forEachIndexed { index, tab ->
                    Tab(
                        selected = state.activeTab == tab,
                        onClick = { viewModel.setTab(tab) },
                        text = { Text(tab.label) }
                    )
                }
            }
            
            TabContent(activeTab = state.activeTab)
        }
    }

    if (state.showUrgentContact) {
        UrgentContactDialog(
            onDismiss = { viewModel.setShowUrgentContact(false) }
        )
    }
}

@Composable
private fun HeaderSection(onRequestConsultation: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Interrupción Voluntaria del Embarazo",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Acceso a información confiable y atención médica profesional para la interrupción del embarazo.",
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onRequestConsultation, modifier = Modifier.fillMaxWidth()) {
                Text("Consulta Médica Ahora")
            }
        }
    }
}

@Composable
private fun UrgentAlertSection(onRequestConsultation: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer)
            Spacer(modifier = Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "¿Necesitas atención urgente?",
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                Text(
                    "Sangrado abundante, dolor intenso o fiebre alta.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
            TextButton(onClick = onRequestConsultation) {
                Text("Contactar", color = MaterialTheme.colorScheme.onErrorContainer)
            }
        }
    }
}

@Composable
private fun TabContent(activeTab: ReproductiveTab) {
    Box(modifier = Modifier.padding(16.dp)) {
        when (activeTab) {
            ReproductiveTab.OVERVIEW -> Text("Información sobre métodos disponibles y acompañamiento psicológico gratuito. Es tu derecho según la Ley 27.610 (Argentina).")
            ReproductiveTab.RIGHTS -> Text("Conocé tus derechos legales en Argentina para acceder a la interrupción voluntaria del embarazo de manera gratuita.")
            ReproductiveTab.PROCEDURES -> Text("Métodos medicamentosos y procedimientos médicos disponibles.")
            ReproductiveTab.DOCTORS -> Text("Encontrá médicos especializados y capacitados para brindarte atención de calidad.")
            ReproductiveTab.SUPPORT -> Text("Acompañamiento emocional y recursos psicológicos para ayudarte en todo el proceso.")
        }
    }
}

@Composable
private fun UrgentContactDialog(onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Conectando con médico...", style = MaterialTheme.typography.titleLarge)
                Spacer(modifier = Modifier.height(16.dp))
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    "Estamos conectándote con un profesional de la salud de forma confidencial.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(24.dp))
                TextButton(onClick = onDismiss) {
                    Text("Cancelar")
                }
            }
        }
    }
}
