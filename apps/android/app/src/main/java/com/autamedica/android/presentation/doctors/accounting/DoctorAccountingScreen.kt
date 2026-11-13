package com.autamedica.android.presentation.doctors.accounting

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

private fun formatMoney(cents: Long, currency: String?): String {
    if (currency.isNullOrBlank()) return "Sin liquidaciones"
    val locale = if (currency == "BRL") Locale.forLanguageTag("pt-BR") else Locale.forLanguageTag("es-AR")
    return runCatching {
        NumberFormat.getCurrencyInstance(locale).apply {
            this.currency = Currency.getInstance(currency)
        }.format(cents / 100.0)
    }.getOrDefault("Importe no disponible")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorAccountingScreen(
    onNavigateBack: () -> Unit,
    viewModel: DoctorAccountingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.accounting_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.clinical_ops_back),
                        )
                    }
                },
                actions = {
                    TextButton(onClick = viewModel::refresh, enabled = !state.isLoading) {
                        Text("Actualizar")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (state.isLoading) {
                item { CircularProgressIndicator() }
            } else if (state.error != null) {
                item {
                    Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                }
            } else {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                        ),
                    ) {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text("Honorarios pagados registrados", style = MaterialTheme.typography.labelMedium)
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                formatMoney(state.paidAmountCents, state.currency),
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                "Los pagos y retiros se gestionan fuera de esta pantalla.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }

                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Card(modifier = Modifier.weight(1f)) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text(
                                    stringResource(R.string.accounting_monthly_consultations_label),
                                    style = MaterialTheme.typography.labelSmall,
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    state.totalConsultationsMonth.toString(),
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                        Card(modifier = Modifier.weight(1f)) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text("Honorarios pendientes registrados", style = MaterialTheme.typography.labelSmall)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    formatMoney(state.pendingSettlementCents, state.currency),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }

                item {
                    Text(
                        "Liquidaciones registradas",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                if (state.transactions.isEmpty()) {
                    item {
                        Text(
                            "No se registran honorarios en la cuenta del médico.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFF64748B),
                        )
                    }
                } else {
                    items(state.transactions, key = { it.id }) { tx ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column {
                                    Text("Honorarios de consulta", fontWeight = FontWeight.Medium)
                                    Text(tx.date, style = MaterialTheme.typography.bodySmall)
                                }
                                Column {
                                    Text(formatMoney(tx.amountCents, tx.currency), fontWeight = FontWeight.Bold)
                                    Text(tx.status, style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
