package com.autamedica.android.presentation.doctors.prescriptions

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.COMMON_CIE10_DIAGNOSES
import com.autamedica.android.domain.model.COMMON_MEDICATIONS
import com.autamedica.android.domain.model.Cie10Item
import com.autamedica.android.domain.model.Prescription
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.presentation.doctors.common.ClinicalErrorAction
import com.autamedica.android.presentation.doctors.components.EventualPatientDniSelectorCard
import com.autamedica.android.presentation.doctors.components.MemedPrescriberWebView
import com.autamedica.android.presentation.doctors.components.ShareDocumentToPatientButton
import com.autamedica.android.presentation.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatePrescriptionScreen(
    patientId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    renewFromPrescriptionId: String = "",
    onOpenCertificateSetup: () -> Unit = {},
    viewModel: DoctorPrescriptionsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()
    val diagnosisFocusRequester = remember { FocusRequester() }

    var patientSearchQuery by remember { mutableStateOf("") }
    var expandedPatientDropdown by remember { mutableStateOf(false) }
    val isBrazil = uiState.doctorEligibility?.countryCode.equals("BR", ignoreCase = true) ||
        uiState.doctorEligibility?.doctorLicense?.startsWith("CRM", ignoreCase = true) == true

    LaunchedEffect(patientId, renewFromPrescriptionId) {
        viewModel.initCreatePrescription(patientId, renewFromPrescriptionId)
    }

    LaunchedEffect(uiState.isDiagnosisValidationError) {
        if (uiState.isDiagnosisValidationError) {
            scrollState.animateScrollTo(scrollState.maxValue)
            runCatching { diagnosisFocusRequester.requestFocus() }
        }
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
                        val headerJurisdiction = com.autamedica.android.domain.model.resolveRegulatoryJurisdiction(
                            countryCode = uiState.doctorEligibility?.countryCode,
                            doctorLicense = uiState.doctorEligibility?.doctorLicense,
                        )
                        Text(
                            text = stringResource(
                                com.autamedica.android.domain.model.RegulatoryJurisdictionCopy
                                    .prescriptionCreateSubtitleRes(headerJurisdiction)
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextSecondary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.minimumInteractiveComponentSize(),
                    ) {
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
                border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    val createErrorText = when {
                        uiState.createErrorResId != null -> stringResource(
                            uiState.createErrorResId!!,
                            *uiState.createErrorArgs.toTypedArray(),
                        )
                        uiState.createError != null -> uiState.createError
                        else -> null
                    }
                    createErrorText?.let { err ->
                        PrescriptionErrorBanner(
                            message = err,
                            action = uiState.createErrorAction,
                            onActionClick = { action ->
                                when (action) {
                                    ClinicalErrorAction.ACTIVATE_CERTIFICATE -> onOpenCertificateSetup()
                                    ClinicalErrorAction.REVIEW_PATIENT -> {
                                        expandedPatientDropdown = true
                                        coroutineScope.launch { scrollState.animateScrollTo(0) }
                                    }
                                    ClinicalErrorAction.RETRY -> {
                                        if (isBrazil) viewModel.openMemedForBrazil()
                                        else viewModel.onSubmitPrescription()
                                    }
                                    ClinicalErrorAction.NONE -> Unit
                                }
                            },
                        )
                    }

                    if (isBrazil) {
                        Button(
                            onClick = { viewModel.openMemedForBrazil() },
                            modifier = Modifier
                                .fillMaxWidth()
                                .minimumInteractiveComponentSize()
                                .heightIn(min = 48.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PortalPatientsAction,
                                contentColor = Color.White,
                            ),
                            enabled = !uiState.isOpeningMemed,
                        ) {
                            if (uiState.isOpeningMemed) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.doctor_create_rx_memed_opening), fontWeight = FontWeight.Bold)
                            } else {
                                Icon(Icons.Outlined.HealthAndSafety, contentDescription = null, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.doctor_create_rx_memed_btn), fontWeight = FontWeight.Bold)
                            }
                        }
                    } else {
                        Button(
                            onClick = { viewModel.onSubmitPrescription() },
                            modifier = Modifier
                                .fillMaxWidth()
                                .minimumInteractiveComponentSize()
                                .heightIn(min = 48.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PortalPatientsAction,
                                contentColor = Color.White,
                            ),
                            enabled = !uiState.isSubmitting,
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
            DoctorRegulatoryBanner(uiState.doctorEligibility)

            // 2. Patient Selector Card (Existing patients + 3-field DNI/Sex/WhatsApp eventual lookup)
            EventualPatientDniSelectorCard(
                selectedPatient = uiState.selectedPatient,
                eligiblePatients = uiState.eligiblePatients,
                isLoadingPatients = uiState.isLoadingPatients,
                searchQuery = patientSearchQuery,
                onSearchQueryChange = { patientSearchQuery = it },
                expanded = expandedPatientDropdown,
                onExpandedChange = { expandedPatientDropdown = it },
                onSelectPatient = {
                    viewModel.onSelectPatient(it)
                    expandedPatientDropdown = false
                },
                isRegisteringDni = uiState.isRegisteringDni,
                dniLookupError = uiState.dniLookupError,
                needsManualName = uiState.needsManualName,
                onLookupByDni = { dni, gender, contact, manualName ->
                    viewModel.registerEventualPatientByDni(dni, gender, contact, manualName)
                },
            )

            if (isBrazil) {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = PrimaryContainer.copy(alpha = 0.45f)),
                    border = BorderStroke(1.dp, PrimaryDark.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.HealthAndSafety,
                                contentDescription = null,
                                tint = PrimaryDark,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                text = stringResource(R.string.doctor_create_rx_br_icp_card_title),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                        }
                        Text(
                            text = stringResource(R.string.doctor_create_rx_br_icp_card_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextSecondary,
                        )
                    }
                }
            } else {
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

                val maxMedicationItems = 1
                if (uiState.items.size < maxMedicationItems) {
                    OutlinedButton(
                        onClick = { viewModel.onAddMedicationItem() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .minimumInteractiveComponentSize()
                            .heightIn(min = 48.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, PrimaryDark),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = PrimaryDark),
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.doctor_create_rx_add_medication, uiState.items.size),
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                } else {
                    Text(
                        text = stringResource(R.string.doctor_create_rx_farmalink_single_item_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextSecondary,
                    )
                }

                // 4. Clinical Diagnosis Section (CIE-10)
                DiagnosisSelectorSection(
                    currentDiagnosis = uiState.diagnosis,
                    isError = uiState.isDiagnosisValidationError,
                    focusRequester = diagnosisFocusRequester,
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
                        focusedBorderColor = PrimaryDark,
                        unfocusedBorderColor = AuInputBorder,
                        focusedLabelColor = PrimaryDark,
                        unfocusedLabelColor = AuTextSecondary,
                        unfocusedPlaceholderColor = AuTextSecondary,
                    )
                )
            }

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
                            TextButton(onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", created.cuir ?: created.id))
                                Toast.makeText(context, context.getString(R.string.doctor_create_rx_cuir_copied_toast), Toast.LENGTH_SHORT).show()
                            }) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp), tint = PortalDoctors)
                                    Text(
                                        text = stringResource(R.string.doctor_create_rx_copy_cuir),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = PortalDoctors,
                                        maxLines = 1,
                                        softWrap = false,
                                    )
                                }
                            }
                        }
                    }

                    ShareDocumentToPatientButton(
                        patient = uiState.selectedPatient,
                        documentTitle = stringResource(R.string.doctor_create_rx_share_title),
                        cuir = created.cuir ?: created.id,
                        context = context,
                    )

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
                    colors = ButtonDefaults.buttonColors(containerColor = PortalPatientsAction, contentColor = Color.White)
                ) {
                    Text(stringResource(R.string.doctor_create_rx_success_button))
                }
            }
        )
    }

    uiState.memedSession?.let { memedSession ->
        MemedPrescriberWebView(
            exchangeUrl = memedSession.exchangeUrl,
            onRetryHandoff = viewModel::retryMemedHandoff,
            titleRes = R.string.doctor_create_rx_memed_title,
            onClose = { viewModel.onMemedClosed() },
        )
    }
}

@Composable
private fun DoctorRegulatoryBanner(eligibility: com.autamedica.android.domain.model.DoctorEligibility?) {
    val isEligible = eligibility?.isEligible ?: true
    val license = eligibility?.doctorLicense ?: stringResource(R.string.doctor_create_rx_regulatory_registered)
    val jurisdiction = com.autamedica.android.domain.model.resolveRegulatoryJurisdiction(
        countryCode = eligibility?.countryCode,
        doctorLicense = eligibility?.doctorLicense,
    )

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isEligible) SuccessContainer else ErrorContainer,
        border = BorderStroke(1.dp, if (isEligible) AuSuccessText.copy(alpha = 0.35f) else AuDangerText.copy(alpha = 0.35f)),
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
                tint = if (isEligible) AuSuccessText else AuDangerText,
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isEligible) {
                        stringResource(
                            com.autamedica.android.domain.model.RegulatoryJurisdictionCopy
                                .prescriptionEligibleTitleRes(jurisdiction)
                        )
                    } else {
                        stringResource(R.string.doctor_create_rx_regulatory_not_eligible_title)
                    },
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isEligible) AuSuccessText else AuDangerText
                )
                Text(
                    text = if (isEligible) {
                        stringResource(R.string.doctor_create_rx_regulatory_license_info, license)
                    } else {
                        eligibility?.reason ?: stringResource(
                            com.autamedica.android.domain.model.RegulatoryJurisdictionCopy
                                .prescriptionFallbackReasonRes(jurisdiction)
                        )
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary
                )
            }
        }
    }
}

@Composable
private fun PrescriptionErrorBanner(
    message: String,
    action: ClinicalErrorAction,
    onActionClick: (ClinicalErrorAction) -> Unit,
) {
    val actionLabelRes = when (action) {
        ClinicalErrorAction.ACTIVATE_CERTIFICATE -> R.string.clinical_err_action_activate_certificate
        ClinicalErrorAction.REVIEW_PATIENT -> R.string.clinical_err_action_review_patient
        ClinicalErrorAction.RETRY -> R.string.clinical_err_action_retry
        ClinicalErrorAction.NONE -> null
    }
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = ErrorContainer,
        border = BorderStroke(1.dp, AuDangerText.copy(alpha = 0.45f)),
        modifier = Modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Assertive },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = stringResource(R.string.a11y_error_banner_prefix),
                tint = AuDangerText,
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = AuDangerText,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            if (actionLabelRes != null) {
                TextButton(
                    onClick = { onActionClick(action) },
                    modifier = Modifier.minimumInteractiveComponentSize(),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Text(
                        text = stringResource(actionLabelRes),
                        style = MaterialTheme.typography.labelSmall,
                        color = PrimaryDark,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        softWrap = false,
                    )
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

@OptIn(ExperimentalLayoutApi::class)
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
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = AuSurface,
        unfocusedContainerColor = AuSurface,
        focusedBorderColor = PrimaryDark,
        unfocusedBorderColor = AuInputBorder,
        focusedLabelColor = PrimaryDark,
        unfocusedLabelColor = AuTextSecondary,
        unfocusedPlaceholderColor = AuTextSecondary,
    )

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
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
                    Icon(Icons.Outlined.Medication, contentDescription = null, tint = PrimaryDark, modifier = Modifier.size(18.dp))
                    Text(
                        text = stringResource(R.string.doctor_create_rx_medication_item_title, itemNumber),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                }
                if (canDelete) {
                    IconButton(
                        onClick = onDelete,
                        modifier = Modifier.minimumInteractiveComponentSize(),
                    ) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = stringResource(R.string.doctor_create_rx_delete_item_desc),
                            tint = AuDangerText,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }

            HorizontalDivider(color = AuInputBorder.copy(alpha = 0.25f))

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
                    colors = fieldColors,
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
                            border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.4f)),
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
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .minimumInteractiveComponentSize(),
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

            // 2. Dosage + Preset Chips (FlowRow + FilterChip with selected state)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(
                    value = itemState.dosage,
                    onValueChange = onDosageChange,
                    label = { Text(stringResource(R.string.doctor_create_rx_dosage_label)) },
                    placeholder = { Text(stringResource(R.string.doctor_create_rx_dosage_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                )
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    stringArrayResource(R.array.rx_dosage_presets).forEach { preset ->
                        SelectablePresetChip(
                            text = preset,
                            selected = itemState.dosage.trim().equals(preset, ignoreCase = true),
                            onClick = { onDosageChange(preset) },
                        )
                    }
                }
            }

            // 3. Frequency + Preset Chips (FlowRow + FilterChip with selected state)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(
                    value = itemState.frequency,
                    onValueChange = onFrequencyChange,
                    label = { Text(stringResource(R.string.doctor_create_rx_frequency_label)) },
                    placeholder = { Text(stringResource(R.string.doctor_create_rx_frequency_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                )
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    stringArrayResource(R.array.rx_frequency_presets).forEach { preset ->
                        SelectablePresetChip(
                            text = preset,
                            selected = itemState.frequency.trim().equals(preset, ignoreCase = true),
                            onClick = { onFrequencyChange(preset) },
                        )
                    }
                }
            }

            // 4. Duration + Preset Chips (FlowRow + FilterChip with selected state)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(
                    value = itemState.duration,
                    onValueChange = onDurationChange,
                    label = { Text(stringResource(R.string.doctor_create_rx_duration_label)) },
                    placeholder = { Text(stringResource(R.string.doctor_create_rx_duration_placeholder)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                )
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    stringArrayResource(R.array.rx_duration_presets).forEach { preset ->
                        SelectablePresetChip(
                            text = preset,
                            selected = itemState.duration.trim().equals(preset, ignoreCase = true),
                            onClick = { onDurationChange(preset) },
                        )
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
                colors = fieldColors,
            )
        }
    }
}

@Composable
private fun DiagnosisSelectorSection(
    currentDiagnosis: String,
    isError: Boolean = false,
    focusRequester: FocusRequester = remember { FocusRequester() },
    onDiagnosisChange: (diagnosis: String, code: String?) -> Unit,
) {
    var diagSuggestionsExpanded by remember { mutableStateOf(false) }
    val requiredDesc = stringResource(R.string.a11y_required_field)

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, if (isError) AuDangerText else AuInputBorder.copy(alpha = 0.35f)),
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
                color = AuTextPrimary,
            )

            OutlinedTextField(
                value = currentDiagnosis,
                onValueChange = {
                    onDiagnosisChange(it, null)
                    diagSuggestionsExpanded = it.isNotBlank() && it.length >= 2
                },
                label = { Text(stringResource(R.string.doctor_create_rx_diagnosis_label)) },
                placeholder = { Text(stringResource(R.string.doctor_create_rx_diagnosis_placeholder)) },
                supportingText = {
                    Text(
                        text = stringResource(R.string.doctor_create_rx_diagnosis_supporting),
                        color = if (isError) AuDangerText else AuTextSecondary,
                    )
                },
                isError = isError,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
                    .semantics { stateDescription = requiredDesc },
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuSurface,
                    unfocusedContainerColor = AuSurface,
                    focusedBorderColor = PrimaryDark,
                    unfocusedBorderColor = AuInputBorder,
                    errorBorderColor = AuDangerText,
                    errorLabelColor = AuDangerText,
                    focusedLabelColor = PrimaryDark,
                    unfocusedLabelColor = AuTextSecondary,
                    unfocusedPlaceholderColor = AuTextSecondary,
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
                        border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.4f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column {
                            suggestions.forEach { cieItem ->
                                TextButton(
                                    onClick = {
                                        onDiagnosisChange(cieItem.description, cieItem.code)
                                        diagSuggestionsExpanded = false
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .minimumInteractiveComponentSize(),
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
                                            color = PrimaryContainer,
                                        ) {
                                            Text(
                                                text = cieItem.code,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = PrimaryDark,
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
private fun SelectablePresetChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        modifier = Modifier.minimumInteractiveComponentSize(),
        leadingIcon = if (selected) {
            {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = null,
                    modifier = Modifier.size(FilterChipDefaults.IconSize),
                )
            }
        } else {
            null
        },
        label = {
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            )
        },
        shape = RoundedCornerShape(10.dp),
        colors = FilterChipDefaults.filterChipColors(
            containerColor = AuBackground,
            labelColor = AuTextPrimary,
            selectedContainerColor = PrimaryContainer,
            selectedLabelColor = PrimaryDark,
            selectedLeadingIconColor = PrimaryDark,
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = selected,
            borderColor = AuInputBorder,
            selectedBorderColor = PrimaryDark,
            borderWidth = 1.dp,
            selectedBorderWidth = 1.5.dp,
        ),
    )
}

@Preview(name = "Rx 360dp 1.5x Normal", widthDp = 360, fontScale = 1.5f, showBackground = true)
@Composable
private fun CreatePrescriptionPreviewNormal() {
    AutamedicaTheme {
        Column(
            modifier = Modifier
                .background(AuBackground)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MedicationItemFormCard(
                itemNumber = 1,
                canDelete = false,
                itemState = PrescriptionItemFormState(
                    medicationName = "Dipirona 500 mg",
                    dosage = "500 mg",
                    frequency = "1x ao dia (em jejum)",
                    duration = "Por 5 dias",
                ),
                onMedicationNameChange = {},
                onGenericNameChange = {},
                onDosageChange = {},
                onFrequencyChange = {},
                onDurationChange = {},
                onInstructionsChange = {},
                onDelete = {},
            )
        }
    }
}

@Preview(name = "Rx 360dp 1.5x Error", widthDp = 360, fontScale = 1.5f, showBackground = true)
@Composable
private fun CreatePrescriptionPreviewError() {
    AutamedicaTheme {
        Column(
            modifier = Modifier
                .background(AuBackground)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DiagnosisSelectorSection(
                currentDiagnosis = "",
                isError = true,
                onDiagnosisChange = { _, _ -> },
            )
            PrescriptionErrorBanner(
                message = stringResource(R.string.clinical_err_digital_issuer_unavailable),
                action = ClinicalErrorAction.RETRY,
                onActionClick = {},
            )
        }
    }
}
