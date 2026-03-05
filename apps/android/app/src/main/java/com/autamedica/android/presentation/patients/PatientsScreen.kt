package com.autamedica.android.presentation.patients

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalDoctors
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientsScreen(
    onNavigateToPatientDetail: (patientId: String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: PatientsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Mis Pacientes",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = {
                    Surface(
                        shape = CircleShape,
                        color = AuSurfaceHover,
                        modifier = Modifier.padding(end = 12.dp),
                    ) {
                        Icon(
                            Icons.Outlined.Search,
                            contentDescription = "Buscar",
                            tint = AuTextSecondary,
                            modifier = Modifier.padding(8.dp),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = PortalDoctors, strokeWidth = 2.dp)
                    }
                }

                uiState.error != null -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(32.dp),
                        ) {
                            Surface(
                                modifier = Modifier.size(64.dp),
                                shape = CircleShape,
                                color = ErrorContainer,
                            ) {
                                Icon(
                                    Icons.Outlined.EventBusy,
                                    contentDescription = null,
                                    modifier = Modifier.padding(16.dp),
                                    tint = AuDanger,
                                )
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = uiState.error ?: "Error",
                                color = AuDanger,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Deslizar hacia abajo para reintentar",
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextTertiary,
                            )
                        }
                    }
                }

                uiState.patients.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(32.dp),
                        ) {
                            Surface(
                                modifier = Modifier.size(80.dp),
                                shape = CircleShape,
                                color = AuSurface,
                            ) {
                                Icon(
                                    Icons.Default.Person,
                                    contentDescription = null,
                                    modifier = Modifier.padding(20.dp),
                                    tint = AuTextSecondary,
                                )
                            }
                            Spacer(modifier = Modifier.height(20.dp))
                            Text(
                                text = "Sin pacientes asignados",
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Aqui apareceran los pacientes que atiendas",
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextTertiary,
                            )
                        }
                    }
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        item {
                            Text(
                                text = "${uiState.patients.size} paciente${if (uiState.patients.size != 1) "s" else ""}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextSecondary,
                                modifier = Modifier.padding(bottom = 4.dp),
                            )
                        }

                        items(uiState.patients, key = { it.id }) { patient ->
                            PatientCard(
                                patient = patient,
                                onClick = { onNavigateToPatientDetail(patient.id) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PatientCard(
    patient: PatientSummary,
    onClick: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(48.dp),
                    shape = CircleShape,
                    color = AuSurfaceHover,
                ) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.padding(12.dp),
                        tint = AuTextSecondary,
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "${patient.firstName} ${patient.lastName}".trim().ifBlank { "Paciente Anonimo" },
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "${patient.appointmentCount} consultas en total",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }

            if (patient.lastAppointment != null || patient.nextAppointment != null) {
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    if (patient.lastAppointment != null) {
                        Column {
                            Text(
                                text = "Ultima consulta",
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = formatDate(patient.lastAppointment),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                    if (patient.nextAppointment != null) {
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "Proxima consulta",
                                style = MaterialTheme.typography.labelSmall,
                                color = PortalDoctors,
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = formatDate(patient.nextAppointment),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun formatDate(isoString: String): String {
    return try {
        val dt = OffsetDateTime.parse(isoString)
        dt.format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale("es", "AR")))
    } catch (_: Exception) {
        isoString
    }
}
