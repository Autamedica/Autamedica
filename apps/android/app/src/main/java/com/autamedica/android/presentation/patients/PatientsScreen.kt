package com.autamedica.android.presentation.patients

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.PatientSummary
import com.autamedica.android.presentation.health.healthText
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
    var showSearchBar by remember { mutableStateOf(false) }
    var showAddExternalDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.patients_screen_title),
                        style = MaterialTheme.typography.titleLarge,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = {
                    IconButton(
                        onClick = {
                            if (showSearchBar && uiState.searchQuery.isNotEmpty()) {
                                viewModel.onSearchQueryChange("")
                            }
                            showSearchBar = !showSearchBar
                        },
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = AuSurfaceHover,
                        ) {
                            Icon(
                                if (showSearchBar) Icons.Default.Close else Icons.Outlined.Search,
                                contentDescription = stringResource(R.string.patients_search_cd),
                                tint = AuTextSecondary,
                                modifier = Modifier.padding(8.dp),
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    viewModel.clearCreateExternalError()
                    showAddExternalDialog = true
                },
                containerColor = PortalDoctors,
                contentColor = Color.White,
                icon = { Icon(Icons.Default.PersonAdd, contentDescription = null) },
                text = { Text(stringResource(R.string.patients_add_external_fab)) },
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
                                text = uiState.error ?: stringResource(R.string.patients_error_generic),
                                color = AuDanger,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.patients_pull_to_refresh_hint),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextTertiary,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = viewModel::refresh,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PortalDoctors,
                                    contentColor = Color.White,
                                ),
                            ) {
                                Text(stringResource(R.string.patients_retry))
                            }
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
                                text = stringResource(R.string.patients_empty_title),
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.patients_empty_subtitle),
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextTertiary,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = viewModel::refresh,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PortalDoctors,
                                    contentColor = Color.White,
                                ),
                            ) {
                                Text(stringResource(R.string.patients_retry))
                            }
                        }
                    }
                }

                else -> {
                    val displayedPatients = uiState.groups.allItems
                    LazyColumn(
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (showSearchBar) {
                            item {
                                OutlinedTextField(
                                    value = uiState.searchQuery,
                                    onValueChange = viewModel::onSearchQueryChange,
                                    singleLine = true,
                                    placeholder = { Text(stringResource(R.string.patients_search_placeholder)) },
                                    leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(14.dp),
                                )
                            }
                        }

                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                val filterEntries = listOf(
                                    PatientFilter.ALL to stringResource(R.string.patients_filter_all, uiState.totalCount),
                                    PatientFilter.UPCOMING to stringResource(R.string.patients_filter_upcoming, uiState.upcomingCount),
                                    PatientFilter.RECENT to stringResource(R.string.patients_filter_recent, uiState.recentCount),
                                    PatientFilter.EXTERNAL to stringResource(R.string.patients_filter_external, uiState.externalCount),
                                )
                                filterEntries.forEach { (filterKey, label) ->
                                    FilterChip(
                                        selected = uiState.filter == filterKey,
                                        onClick = { viewModel.onFilterSelected(filterKey) },
                                        label = { Text(label) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = PortalDoctors,
                                            selectedLabelColor = Color.White,
                                        ),
                                    )
                                }
                            }
                        }

                        item {
                            val countText = if (displayedPatients.size == 1) {
                                stringResource(R.string.patients_count_single, displayedPatients.size)
                            } else {
                                stringResource(R.string.patients_count_plural, displayedPatients.size)
                            }
                            Text(
                                text = countText,
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextSecondary,
                                modifier = Modifier.padding(bottom = 2.dp),
                            )
                        }

                        items(displayedPatients, key = { it.id }) { patient ->
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

    if (showAddExternalDialog) {
        AddExternalPatientDialog(
            isSaving = uiState.isCreatingExternal,
            errorMessage = uiState.createExternalError,
            isBrazil = uiState.doctorCountryCode == "BR",
            onDismiss = { if (!uiState.isCreatingExternal) showAddExternalDialog = false },
            onConfirm = { fullName, doc, gender, birthDate, contact ->
                viewModel.registerExternalPatient(
                    fullName = fullName,
                    documentNumber = doc,
                    gender = gender,
                    birthDate = birthDate,
                    contact = contact,
                ) { newPatientId ->
                    showAddExternalDialog = false
                    onNavigateToPatientDetail(newPatientId)
                }
            },
        )
    }
}

@Composable
private fun AddExternalPatientDialog(
    isSaving: Boolean,
    errorMessage: String?,
    isBrazil: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (fullName: String, doc: String, gender: String, birthDate: String?, contact: String?) -> Unit,
) {
    var fullName by remember { mutableStateOf("") }
    var docNumber by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("female") }
    var contact by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.patients_add_external_title), fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = stringResource(R.string.patients_add_external_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
                OutlinedTextField(
                    value = fullName,
                    onValueChange = { fullName = it },
                    label = { Text(stringResource(R.string.patients_add_external_name)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = docNumber,
                    onValueChange = { raw ->
                        docNumber = raw.filter(Char::isDigit).take(if (isBrazil) 11 else 8)
                    },
                    label = {
                        Text(
                            if (isBrazil) healthText("CPF (11 dígitos)", "CPF (11 dígitos)")
                            else healthText("DNI (7-8 dígitos)", "DNI (7-8 dígitos)"),
                        )
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = gender == "female",
                        onClick = { gender = "female" },
                        label = { Text(healthText("Femenino", "Feminino")) },
                    )
                    FilterChip(
                        selected = gender == "male",
                        onClick = { gender = "male" },
                        label = { Text("Masculino") },
                    )
                }
                OutlinedTextField(
                    value = contact,
                    onValueChange = { contact = it },
                    label = { Text(stringResource(R.string.patients_add_external_contact)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (!errorMessage.isNullOrBlank()) {
                    Text(
                        text = errorMessage,
                        color = AuDanger,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(
                        fullName,
                        docNumber,
                        gender,
                        null,
                        contact.takeIf { it.isNotBlank() },
                    )
                },
                enabled = !isSaving && fullName.trim().length >= 3 && docNumber.length >= 7,
                colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors, contentColor = Color.White),
            ) {
                Text(
                    if (isSaving) stringResource(R.string.patients_add_external_saving)
                    else stringResource(R.string.patients_add_external_submit),
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text(stringResource(R.string.common_cancel))
            }
        },
    )
}

@Composable
private fun PatientCard(
    patient: PatientSummary,
    onClick: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
        ) {
            val patientName = "${patient.firstName} ${patient.lastName}".trim()
            val patientInitials = listOf(patient.firstName, patient.lastName)
                .map(String::trim)
                .filter(String::isNotBlank)
                .joinToString("") { it.take(1).uppercase(Locale.getDefault()) }
                .take(2)

            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(48.dp),
                    shape = CircleShape,
                    color = AuSurfaceHover,
                ) {
                    if (patientInitials.isNotBlank()) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = patientInitials,
                                color = PortalDoctors,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleSmall,
                            )
                        }
                    } else {
                        Icon(
                            Icons.Default.Person,
                            contentDescription = null,
                            modifier = Modifier.padding(12.dp),
                            tint = AuTextSecondary,
                        )
                    }
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (patientName.isBlank()) {
                            Text(
                                text = stringResource(R.string.patients_name_not_registered),
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextTertiary,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                        } else {
                            Text(
                                text = patientName,
                                style = MaterialTheme.typography.titleMedium,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                        }
                        if (patient.isExternal) {
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = Color(0xFFE0F2FE),
                            ) {
                                Text(
                                    text = stringResource(R.string.patients_external_badge),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = PortalDoctors,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                    if (patientName.isBlank()) {
                        Text(
                            text = stringResource(
                                R.string.patients_record_reference,
                                patientReferenceSuffix(patient.id),
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = PortalDoctors,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (!patient.documentNumber.isNullOrBlank()) {
                        Text(
                            text = "Doc: ${patient.documentNumber}",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextSecondary,
                        )
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                    val consultationsText = if (patient.appointmentCount == 1) {
                        stringResource(R.string.patients_consultations_total_single, patient.appointmentCount)
                    } else {
                        stringResource(R.string.patients_consultations_total_plural, patient.appointmentCount)
                    }
                    Text(
                        text = consultationsText,
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
                                text = stringResource(R.string.patients_last_consultation),
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
                                text = stringResource(R.string.patients_next_consultation),
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
        dt.format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault()))
    } catch (_: Exception) {
        isoString
    }
}
