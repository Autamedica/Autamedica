package com.autamedica.android.presentation.doctors.prescriptions

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.COMMON_CIE10_DIAGNOSES
import com.autamedica.android.domain.model.COMMON_DOSAGE_PRESETS
import com.autamedica.android.domain.model.COMMON_DURATION_PRESETS
import com.autamedica.android.domain.model.COMMON_FREQUENCY_PRESETS
import com.autamedica.android.domain.model.COMMON_MEDICATIONS
import com.autamedica.android.domain.model.Cie10Item
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.presentation.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatePrescriptionScreen(
    patientId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorPrescriptionsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    var patientSearchQuery by remember { mutableStateOf("") }
    var expandedPatientDropdown by remember { mutableStateOf(false) }

    LaunchedEffect(patientId) {
        viewModel.initCreatePrescription(patientId)
    }

    Scaffold(
        modifier = modifier,
        containerColor = AuBackground,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.doctor_create_rx_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.doctor_create_rx_subtitle),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.doctor_create_rx_action_back),
                            tint = AuTextPrimary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuSurface),
            )
        },
        bottomBar = {
            Surface(
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val createErrorText = when {
                        uiState.createErrorResId != null -> stringResource(uiState.createErrorResId!!)
                        uiState.createError != null -> uiState.createError
                        else -> null
                    }
                    createErrorText?.let { err ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = AuDanger.copy(alpha = 0.10f),
                            border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.3f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = AuDanger, modifier = Modifier.size(16.dp))
                                Text(
                                    text = err,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuDanger,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }

                    Button(
                        onClick = { viewModel.onSubmitPrescription() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors),
                        enabled = !uiState.isSubmitting && !uiState.isLoadingEligibility && uiState.doctorEligibility?.isEligible == true,
                    ) {
                        if (uiState.isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.doctor_create_rx_submitting))
                        } else {
                            Icon(Icons.Outlined.HealthAndSafety, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.doctor_create_rx_submit_button), fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. SISA / REFEPS Regulatory Verification Status Banner
            DoctorRegulatoryBanner(uiState.doctorEligibility, uiState.isLoadingEligibility, viewModel::loadEligibility)

            // 2. Patient Selector Card
            PatientSelectorSection(
                selectedPatient = uiState.selectedPatient,
                eligiblePatients = uiState.eligiblePatients,
                isLoadingPatients = uiState.isLoadingPatients,
                patientSearchQuery = patientSearchQuery,
                onSearchQueryChange = { patientSearchQuery = it },
                expanded = expandedPatientDropdown,
                onExpandedChange = { expandedPatientDropdown = it },
                onSelectPatient = {
                    viewModel.onSelectPatient(it)
                    expandedPatientDropdown = false
                },
            )

            // 3. Medications Multi-Item Section
            Text(
                text = stringResource(R.string.doctor_create_rx_items_section_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary
            )

            uiState.items.forEachIndexed { index, itemState ->
                MedicationItemFormCard(
                    itemNumber = index + 1,
                    canDelete = uiState.items.size > 1,
                    itemState = itemState,
                    onMedicationNameChange = { viewModel.onMedicationNameChanged(index, it) },
                    onGenericNameChange = { viewModel.onGenericNameChanged(index, it) },
                    onDosageChange = { viewModel.onDosageChanged(index, it) },
                    onFrequencyChange = { viewModel.onFrequencyChanged(index, it) },
                    onDurationChange = { viewModel.onDurationChanged(index, it) },
                    onInstructionsChange = { viewModel.onInstructionsChanged(index, it) },
                    onDelete = { viewModel.onRemoveMedicationItem(index) },
                )
            }

            if (uiState.items.size < 3) {
                OutlinedButton(
                    onClick = { viewModel.onAddMedicationItem() },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.5f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = PortalDoctors),
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        stringResource(R.string.doctor_create_rx_add_medication, uiState.items.size),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            // 4. Clinical Diagnosis Section (CIE-10)
            DiagnosisSelectorSection(
                currentDiagnosis = uiState.diagnosis,
                onDiagnosisChange = { diag, code -> viewModel.onDiagnosisChanged(diag, code) }
            )

            // 5. Notes / Observations
            OutlinedTextField(
                value = uiState.notes,
                onValueChange = viewModel::onNotesChanged,
                label = { Text(stringResource(R.string.doctor_create_rx_notes_label)) },
                placeholder = { Text(stringResource(R.string.doctor_create_rx_notes_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuSurface,
                    unfocusedContainerColor = AuSurface,
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = AuBorder,
                )
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    // Success Modal Dialog
    uiState.createdPrescription?.let { created ->
        AlertDialog(
            onDismissRequest = { /* Require explicit action */ },
            icon = {
                Icon(
                    imageVector = Icons.Outlined.CheckCircle,
                    contentDescription = null,
                    tint = AuSuccess,
                    modifier = Modifier.size(48.dp)
                )
            },
            title = {
                Text(
                    text = stringResource(R.string.doctor_create_rx_success_title),
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = stringResource(R.string.doctor_create_rx_success_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary
                    )

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = AuSurfaceHover,
                        border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.3f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.doctor_create_rx_cuir_label),
                                style = MaterialTheme.typography.labelSmall,
                                color = AuTextTertiary,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = created.cuir ?: created.id,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = PortalDoctors
                            )
                            IconButton(onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", created.cuir ?: created.id))
                                Toast.makeText(context, context.getString(R.string.doctor_create_rx_cuir_copied_toast), Toast.LENGTH_SHORT).show()
                            }) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp), tint = PortalDoctors)
                                    Text(stringResource(R.string.doctor_create_rx_copy_cuir), style = MaterialTheme.typography.labelSmall, color = PortalDoctors)
                                }
                            }
                        }
                    }

                    Text(
                        text = stringResource(R.string.doctor_create_rx_success_validity),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearCreatedPrescription()
                        onBack()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors)
                ) {
                    Text(stringResource(R.string.doctor_create_rx_success_button))
                }
            }
        )
    }
}

@Composable
private fun DoctorRegulatoryBanner(eligibility: com.autamedica.android.domain.model.DoctorEligibility?, isLoading: Boolean, onRetry: () -> Unit) {
    val isEligible = eligibility?.isEligible == true
    val license = eligibility?.doctorLicense ?: stringResource(R.string.doctor_create_rx_regulatory_registered)

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isEligible) AuSuccess.copy(alpha = 0.08f) else AuCrimson.copy(alpha = 0.08f),
        border = BorderStroke(1.dp, if (isEligible) AuSuccess.copy(alpha = 0.25f) else AuCrimson.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = if (isEligible) Icons.Outlined.CheckCircle else Icons.Default.Warning,
                contentDescription = null,
                tint = if (isEligible) AuSuccess else AuCrimson,
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isEligible) stringResource(R.string.doctor_create_rx_regulatory_eligible_title) else stringResource(R.string.doctor_create_rx_regulatory_not_eligible_title),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isEligible) AuSuccess else Color(0xFFB45309)
                )
                Text(
                    text = if (isEligible) {
                        stringResource(R.string.doctor_create_rx_regulatory_license_info, license)
                    } else {
                        eligibility?.reason ?: stringResource(R.string.doctor_create_rx_regulatory_fallback_reason)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary
                )
                if (!isEligible) {
                    TextButton(onClick = onRetry, enabled = !isLoading) {
                        Text(stringResource(R.string.clinical_ops_refresh))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PatientSelectorSection(
    selectedPatient: PrescriptionPatientItem?,
    eligiblePatients: List<PrescriptionPatientItem>,
    isLoadingPatients: Boolean,
    patientSearchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSelectPatient: (PrescriptionPatientItem) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = stringResource(R.string.doctor_create_rx_patient_section_title),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = AuTextSecondary
            )

            if (selectedPatient != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = AuSurfaceHover,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = PortalPatients.copy(alpha = 0.15f),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Outlined.Person, contentDescription = null, tint = PortalPatients, modifier = Modifier.size(20.dp))
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = selectedPatient.fullName,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary
                            )
                            selectedPatient.dni?.let { dni ->
                                Text(
                                    text = stringResource(R.string.doctor_create_rx_patient_dni_prefix, dni),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = AuTextTertiary
                                )
                            }
                        }
                        TextButton(onClick = { onExpandedChange(true) }) {
                            Text(stringResource(R.string.doctor_create_rx_patient_change), color = PortalDoctors)
                        }
                    }
                }
            } else {
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = onExpandedChange,
                ) {
                    OutlinedTextField(
                        value = patientSearchQuery,
                        onValueChange = {
                            onSearchQueryChange(it)
                            onExpandedChange(true)
                        },
                        label = { Text(stringResource(R.string.doctor_create_rx_patient_search_label)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = AuSurface,
                            unfocusedContainerColor = AuSurface,
                            focusedBorderColor = PortalDoctors,
                            unfocusedBorderColor = AuBorder,
                        )
                    )

                    val filteredPatients = remember(eligiblePatients, patientSearchQuery) {
                        if (patientSearchQuery.isBlank()) eligiblePatients
                        else {
                            val q = patientSearchQuery.lowercase()
                            eligiblePatients.filter {
                                it.fullName.lowercase().contains(q) ||
                                (it.dni?.lowercase()?.contains(q) == true)
                            }
                        }
                    }

                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { onExpandedChange(false) },
                        modifier = Modifier.background(AuSurface)
                    ) {
                        if (isLoadingPatients) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.doctor_create_rx_patient_loading), color = AuTextTertiary) },
                                onClick = {}
                            )
                        } else if (filteredPatients.isEmpty()) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.doctor_create_rx_patient_empty), color = AuTextTertiary) },
                                onClick = {}
                            )
                        } else {
                            filteredPatients.forEach { pat ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Text(pat.fullName, fontWeight = FontWeight.SemiBold, color = AuTextPrimary)
                                            pat.dni?.let {
                                                Text(
                                                    stringResource(R.string.doctor_create_rx_patient_dni_prefix, it),
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = AuTextTertiary
                                                )
                                            }
                                        }
                                    },
                                    onClick = { onSelectPatient(pat) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MedicationItemFormCard(
    itemNumber: Int,
    canDelete: Boolean,
    itemState: PrescriptionItemFormState,
    onMedicationNameChange: (String) -> Unit,
    onGenericNameChange: (String) -> Unit,
    onDosageChange: (String) -> Unit,
    onFrequencyChange: (String) -> Unit,
    onDurationChange: (String) -> Unit,
    onInstructionsChange: (String) -> Unit,
    onDelete: () -> Unit,
) {
    var medicationSuggestionsExpanded by remember { mutableStateOf(false) }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Outlined.Medication, contentDescription = null, tint = PortalDoctors, modifier = Modifier.size(18.dp))
                    Text(
                        text = stringResource(R.string.doctor_create_rx_medication_item_title, itemNumber),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                }
                if (canDelete) {
                    IconButton(onClick = onDelete, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Delete, contentDescription = stringResource(R.string.doctor_create_rx_delete_item_desc), tint = AuDanger, modifier = Modifier.size(18.dp))
                    }
                }
            }

            HorizontalDivider(color = AuBorder.copy(alpha = 0.5f))

            // 1. Medication Name with autocomplete suggestions
            Column {
                OutlinedTextField(
                    value = itemState.medicationName,
                    onValueChange = {
                        onMedicationNameChange(it)
                        medicationSuggestionsExpanded = it.isNotBlank() && it.length >= 2
                    },
                    label = { Text(stringResource(R.string.doctor_create_rx_med_name_label)) },
                    placeholder = { Text(stringResource(R.string.doctor_create_rx_med_name_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = AuSurface,
                        unfocusedContainerColor = AuSurface,
                        focusedBorderColor = PortalDoctors,
                        unfocusedBorderColor = AuBorder,
                    )
                )

                if (medicationSuggestionsExpanded) {
                    val suggestions = remember(itemState.medicationName) {
                        val q = itemState.medicationName.lowercase()
                        COMMON_MEDICATIONS.filter { it.lowercase().contains(q) }.take(4)
                    }
                    if (suggestions.isNotEmpty()) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = AuSurfaceHover,
                            border = BorderStroke(1.dp, AuBorder),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp)
                        ) {
                            Column {
                                suggestions.forEach { suggestion ->
                                    TextButton(
                                        onClick = {
                                            onMedicationNameChange(suggestion)
                                            medicationSuggestionsExpanded = false
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Text(
                                            text = suggestion,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AuTextPrimary,
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2. Dosage + Preset Chips
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedTextField(
                    value = itemState.dosage,
                    onValueChange = onDosageChange,
                    label = { Text(stringResource(R.string.doctor_create_rx_dosage_label)) },
                    placeholder = { Text(stringResource(R.string.doctor_create_rx_dosage_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = AuSurface,
                        unfocusedContainerColor = AuSurface,
                        focusedBorderColor = PortalDoctors,
                        unfocusedBorderColor = AuBorder,
                    )
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    COMMON_DOSAGE_PRESETS.take(6).forEach { preset ->
                        PresetChip(text = preset, onClick = { onDosageChange(preset) })
                    }
                }
            }

            // 3. Frequency + Preset Chips
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedTextField(
                    value = itemState.frequency,
                    onValueChange = onFrequencyChange,
                    label = { Text(stringResource(R.string.doctor_create_rx_frequency_label)) },
                    placeholder = { Text(stringResource(R.string.doctor_create_rx_frequency_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = AuSurface,
                        unfocusedContainerColor = AuSurface,
                        focusedBorderColor = PortalDoctors,
                        unfocusedBorderColor = AuBorder,
                    )
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    COMMON_FREQUENCY_PRESETS.take(5).forEach { preset ->
                        PresetChip(text = preset, onClick = { onFrequencyChange(preset) })
                    }
                }
            }

            // 4. Duration + Preset Chips
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedTextField(
                    value = itemState.duration,
                    onValueChange = onDurationChange,
                    label = { Text(stringResource(R.string.doctor_create_rx_duration_label)) },
                    placeholder = { Text(stringResource(R.string.doctor_create_rx_duration_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = AuSurface,
                        unfocusedContainerColor = AuSurface,
                        focusedBorderColor = PortalDoctors,
                        unfocusedBorderColor = AuBorder,
                    )
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    COMMON_DURATION_PRESETS.take(5).forEach { preset ->
                        PresetChip(text = preset, onClick = { onDurationChange(preset) })
                    }
                }
            }

            // 5. Instructions / Posología
            OutlinedTextField(
                value = itemState.instructions,
                onValueChange = onInstructionsChange,
                label = { Text(stringResource(R.string.doctor_create_rx_instructions_label)) },
                placeholder = { Text(stringResource(R.string.doctor_create_rx_instructions_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuSurface,
                    unfocusedContainerColor = AuSurface,
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = AuBorder,
                )
            )
        }
    }
}

@Composable
private fun DiagnosisSelectorSection(
    currentDiagnosis: String,
    onDiagnosisChange: (diagnosis: String, code: String?) -> Unit,
) {
    var diagSuggestionsExpanded by remember { mutableStateOf(false) }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = stringResource(R.string.doctor_create_rx_diagnosis_title),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = AuTextSecondary
            )

            OutlinedTextField(
                value = currentDiagnosis,
                onValueChange = {
                    onDiagnosisChange(it, null)
                    diagSuggestionsExpanded = it.isNotBlank() && it.length >= 2
                },
                placeholder = { Text(stringResource(R.string.doctor_create_rx_diagnosis_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuSurface,
                    unfocusedContainerColor = AuSurface,
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = AuBorder,
                )
            )

            if (diagSuggestionsExpanded) {
                val suggestions = remember(currentDiagnosis) {
                    val q = currentDiagnosis.lowercase()
                    COMMON_CIE10_DIAGNOSES.filter {
                        it.description.lowercase().contains(q) || it.code.lowercase().contains(q)
                    }.take(4)
                }

                if (suggestions.isNotEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = AuSurfaceHover,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column {
                            suggestions.forEach { cieItem ->
                                TextButton(
                                    onClick = {
                                        onDiagnosisChange(cieItem.description, cieItem.code)
                                        diagSuggestionsExpanded = false
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = cieItem.description,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AuTextPrimary,
                                            modifier = Modifier.weight(1f),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(4.dp),
                                            color = PortalDoctors.copy(alpha = 0.15f)
                                        ) {
                                            Text(
                                                text = cieItem.code,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = PortalDoctors,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PresetChip(text: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = AuSurfaceHover,
        border = BorderStroke(1.dp, AuBorder.copy(alpha = 0.8f))
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = AuTextSecondary,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}
