package com.autamedica.android.presentation.doctors.accounting

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.autamedica.android.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorAccountingScreen(
    onNavigateBack: () -> Unit,
    viewModel: DoctorAccountingViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.accounting_title)) },
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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            stringResource(R.string.accounting_balance_available_title),
                            style = MaterialTheme.typography.labelMedium
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            "$" + String.format("%,.2f", state.balanceAvailable),
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.requestWithdrawal() },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.isLoading && state.balanceAvailable > 0
                        ) {
                            if (state.isLoading) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp))
                            } else {
                                Text(stringResource(R.string.accounting_request_withdrawal_button))
                            }
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Card(modifier = Modifier.weight(1f)) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                stringResource(R.string.accounting_monthly_consultations_label),
                                style = MaterialTheme.typography.labelSmall
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("" + state.totalConsultationsMonth, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        }
                    }
                    Card(modifier = Modifier.weight(1f)) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                stringResource(R.string.accounting_pending_settlement_label),
                                style = MaterialTheme.typography.labelSmall
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("$" + String.format("%,.0f", state.pendingSettlement), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            if (state.messageRes != null || state.message != null) {
                item {
                    Text(
                        text = state.messageRes?.let { stringResource(it) } ?: state.message.orEmpty(),
                        color = Color(0xFF00C853),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            item {
                Text(
                    stringResource(R.string.accounting_recent_settled_consultations),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }

            items(state.transactions) { tx ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(tx.patientName, fontWeight = FontWeight.Medium)
                            Text(tx.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("+$" + String.format("%,.2f", tx.amount), fontWeight = FontWeight.Bold, color = Color(0xFF00C853))
                            val statusLabel = when {
                                tx.statusRes != null -> stringResource(tx.statusRes)
                                tx.status.equals("Acreditado", ignoreCase = true) -> stringResource(R.string.accounting_status_credited)
                                tx.status.equals("En proceso", ignoreCase = true) -> stringResource(R.string.accounting_status_in_process)
                                else -> tx.status
                            }
                            Text(statusLabel, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
