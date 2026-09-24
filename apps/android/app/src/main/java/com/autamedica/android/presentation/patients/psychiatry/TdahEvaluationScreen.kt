package com.autamedica.android.presentation.patients.psychiatry

import androidx.compose.foundation.clickable
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
fun TdahEvaluationScreen(
    onNavigateBack: () -> Unit,
    viewModel: TdahEvaluationViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()
    val options = listOf(
        stringResource(R.string.tdah_option_never),
        stringResource(R.string.tdah_option_rarely),
        stringResource(R.string.tdah_option_sometimes),
        stringResource(R.string.tdah_option_often),
        stringResource(R.string.tdah_option_very_often),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.tdah_screen_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.tdah_back_cd),
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
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.tdah_card_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            stringResource(R.string.tdah_card_subtitle),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }

            items(state.questions) { q ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        val questionText = when (q.id) {
                            1 -> stringResource(R.string.tdah_question_1)
                            2 -> stringResource(R.string.tdah_question_2)
                            3 -> stringResource(R.string.tdah_question_3)
                            4 -> stringResource(R.string.tdah_question_4)
                            5 -> stringResource(R.string.tdah_question_5)
                            6 -> stringResource(R.string.tdah_question_6)
                            else -> q.text
                        }
                        Text(
                            "${q.id}. $questionText",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        options.forEachIndexed { index, label ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { viewModel.updateScore(q.id, index) }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(
                                    selected = (q.score == index),
                                    onClick = { viewModel.updateScore(q.id, index) }
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(label, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }

            item {
                Button(
                    onClick = { viewModel.submitEvaluation() },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.isLoading && !state.isCompleted
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp))
                    } else {
                        Text(stringResource(R.string.tdah_submit_button))
                    }
                }
            }

            if (state.isCompleted && state.diagnosticResult != null) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                stringResource(R.string.tdah_result_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            val diagnosticText = when {
                                state.totalScore >= 14 -> stringResource(R.string.tdah_result_high, state.totalScore)
                                state.totalScore >= 9 -> stringResource(R.string.tdah_result_moderate, state.totalScore)
                                else -> stringResource(R.string.tdah_result_low, state.totalScore)
                            }
                            Text(
                                diagnosticText,
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }
            }
        }
    }
}
