package com.autamedica.android.presentation.health

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.Vaccines
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.domain.model.AnamnesisSummary
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.Secondary
import com.autamedica.android.presentation.theme.SuccessContainer
import com.autamedica.android.presentation.theme.Tertiary

private data class HealthFeature(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val iconColor: Color,
    val iconBgColor: Color,
    val statusLabel: String = "Pronto",
    val isEnabled: Boolean = false,
)

private val otherHealthFeatures = listOf(
    HealthFeature(
        title = "Historial Medico",
        description = "Consultas, diagnosticos y examenes anteriores",
        icon = Icons.Outlined.LocalHospital,
        iconColor = PrimaryLight,
        iconBgColor = Color(0xFF172554),
    ),
    HealthFeature(
        title = "Salud Preventiva",
        description = "Controles periodicos, vacunas y screenings",
        icon = Icons.Outlined.HealthAndSafety,
        iconColor = PortalPatients,
        iconBgColor = Color(0xFF052E16),
        statusLabel = "Nuevo",
        isEnabled = true,
    ),
    HealthFeature(
        title = "Vacunas",
        description = "Calendario de vacunacion y registros",
        icon = Icons.Outlined.Vaccines,
        iconColor = Secondary,
        iconBgColor = Color(0xFF0C4A6E),
    ),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthScreen(
    onNavigateToAnamnesisForm: () -> Unit = {},
    onNavigateToPreventiveHealth: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: HealthViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Mi Salud",
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(modifier = Modifier.padding(bottom = 8.dp)) {
                    Text(
                        text = "Tu espacio de bienestar",
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuTextSecondary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Accede a tu informacion de salud en un solo lugar",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }

            item {
                AnamnesisFeatureCard(
                    summary = uiState.anamnesisSummary,
                    isLoading = uiState.isLoading,
                    error = uiState.error,
                    onRetry = viewModel::refresh,
                    onClick = onNavigateToAnamnesisForm,
                )
            }

            items(otherHealthFeatures) { feature ->
                HealthFeatureCard(
                    feature = feature,
                    onClick = if (feature.isEnabled) onNavigateToPreventiveHealth else null,
                )
            }
        }
    }
}

@Composable
private fun HealthFeatureCard(
    feature: HealthFeature,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    if (onClick != null) {
        Surface(
            onClick = onClick,
            modifier = modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = AuSurface,
            border = BorderStroke(1.dp, AuBorder),
        ) {
            HealthFeatureCardContent(feature = feature)
        }
    } else {
        Surface(
            modifier = modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = AuSurface,
            border = BorderStroke(1.dp, AuBorder),
        ) {
            HealthFeatureCardContent(feature = feature)
        }
    }
}

@Composable
private fun HealthFeatureCardContent(feature: HealthFeature) {
    Row(
        modifier = Modifier.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier.size(48.dp),
            shape = CircleShape,
            color = feature.iconBgColor,
        ) {
            Icon(
                imageVector = feature.icon,
                contentDescription = null,
                modifier = Modifier.padding(12.dp),
                tint = feature.iconColor,
            )
        }

        Spacer(modifier = Modifier.width(16.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = feature.title,
                style = MaterialTheme.typography.titleSmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = feature.description,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
            )
        }

        Surface(
            shape = RoundedCornerShape(6.dp),
            color = if (feature.isEnabled) SuccessContainer else AuSurfaceHover,
        ) {
            Text(
                text = feature.statusLabel,
                style = MaterialTheme.typography.labelSmall,
                color = if (feature.isEnabled) AuAccent else AuTextTertiary,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun AnamnesisFeatureCard(
    summary: AnamnesisSummary?,
    isLoading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val statusText = if (isLoading) "Cargando" else anamnesisStatusLabel(summary)

    val statusColor = when {
        summary?.status.equals("approved", ignoreCase = true) -> Color(0xFF14532D)
        summary?.status.equals("under_review", ignoreCase = true) -> Color(0xFF1D4ED8)
        summary?.locked == true -> Color(0xFF7F1D1D)
        summary?.status.equals("completed", ignoreCase = true) -> Color(0xFF14532D)
        else -> AuSurfaceHover
    }

    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    modifier = Modifier.size(48.dp),
                    shape = CircleShape,
                    color = Color(0xFF2E1065),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Description,
                        contentDescription = null,
                        modifier = Modifier.padding(12.dp),
                        tint = Tertiary,
                    )
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Mi Anamnesis",
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Tu historial clinico personal y antecedentes",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = statusColor,
                ) {
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            if (summary != null) {
                val progress = summary.completionPercentage / 100f
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp),
                    color = AuAccent,
                    trackColor = AuSurfaceHover,
                )
                Text(
                    text = "${summary.completionPercentage}% completado · ${summary.completedSections}/${summary.totalSections} secciones",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            } else if (!isLoading) {
                Text(
                    text = "Todavia no hay una anamnesis cargada para este paciente.",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }

            if (error != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = error,
                        color = Color(0xFFB91C1C),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier
                            .weight(1f)
                            .widthIn(max = 220.dp),
                    )
                    TextButton(onClick = onRetry) {
                        Text("Reintentar")
                    }
                }
            }
        }
    }
}
