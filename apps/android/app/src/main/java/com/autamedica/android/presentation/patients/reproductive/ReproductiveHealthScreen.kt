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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.viewmodel.compose.viewModel
import com.autamedica.android.R

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
                title = { Text(stringResource(R.string.reproductive_screen_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.reproductive_back_cd)
                        )
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
                    val tabLabel = when (tab) {
                        ReproductiveTab.OVERVIEW -> stringResource(R.string.reproductive_tab_overview)
                        ReproductiveTab.RIGHTS -> stringResource(R.string.reproductive_tab_rights)
                        ReproductiveTab.PROCEDURES -> stringResource(R.string.reproductive_tab_procedures)
                        ReproductiveTab.DOCTORS -> stringResource(R.string.reproductive_tab_doctors)
                        ReproductiveTab.SUPPORT -> stringResource(R.string.reproductive_tab_support)
                    }
                    Tab(
                        selected = state.activeTab == tab,
                        onClick = { viewModel.setTab(tab) },
                        text = { Text(tabLabel) }
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
                stringResource(R.string.reproductive_header_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                stringResource(R.string.reproductive_header_desc),
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onRequestConsultation, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.reproductive_header_action_btn))
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
                    stringResource(R.string.reproductive_urgent_title),
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                Text(
                    stringResource(R.string.reproductive_urgent_desc),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
            TextButton(onClick = onRequestConsultation) {
                Text(
                    stringResource(R.string.reproductive_urgent_contact_btn),
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }
    }
}

@Composable
private fun TabContent(activeTab: ReproductiveTab) {
    Box(modifier = Modifier.padding(16.dp)) {
        val contentText = when (activeTab) {
            ReproductiveTab.OVERVIEW -> stringResource(R.string.reproductive_tab_overview_content)
            ReproductiveTab.RIGHTS -> stringResource(R.string.reproductive_tab_rights_content)
            ReproductiveTab.PROCEDURES -> stringResource(R.string.reproductive_tab_procedures_content)
            ReproductiveTab.DOCTORS -> stringResource(R.string.reproductive_tab_doctors_content)
            ReproductiveTab.SUPPORT -> stringResource(R.string.reproductive_tab_support_content)
        }
        Text(contentText)
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
                Text(
                    stringResource(R.string.reproductive_dialog_connecting),
                    style = MaterialTheme.typography.titleLarge
                )
                Spacer(modifier = Modifier.height(16.dp))
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    stringResource(R.string.reproductive_dialog_connecting_desc),
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(24.dp))
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.reproductive_dialog_cancel_btn))
                }
            }
        }
    }
}
