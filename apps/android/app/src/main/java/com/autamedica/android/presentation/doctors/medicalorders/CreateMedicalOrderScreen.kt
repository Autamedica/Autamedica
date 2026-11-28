package com.autamedica.android.presentation.doctors.medicalorders

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
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
import com.autamedica.android.domain.model.PracticeItem
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.model.StudyType
import com.autamedica.android.presentation.doctors.common.ClinicalErrorAction
import com.autamedica.android.presentation.doctors.components.EventualPatientDniSelectorCard
import com.autamedica.android.presentation.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateMedicalOrderScreen(
    patientId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenCertificateSetup: () -> Unit = {},
    viewModel: DoctorMedicalOrdersViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()
    val diagnosisFocusRequester = remember { FocusRequester() }

    var expandedPatientDropdown by remember { mutableStateOf(false) }
    var patientSearchQuery by remember { mutableStateOf("") }

    LaunchedEffect(patientId) {
        viewModel.initCreateOrder(patientId)
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
                            text = stringResource(R.string.doctor_create_order_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.doctor_create_order_subtitle),
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
                            contentDescription = stringResource(R.string.doctor_create_order_action_back),
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
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    val errorMessageText = when {
                        uiState.errorMessageResId != null -> stringResource(
                            uiState.errorMessageResId!!,
                            *uiState.errorMessageArgs.toTypedArray(),
                        )
                        uiState.errorMessage != null -> uiState.errorMessage
                        else -> null
                    }
                    errorMessageText?.let { err ->
                        OrderErrorBanner(
                            message = err,
                            action = uiState.errorAction,
                            onActionClick = { action ->
                                when (action) {
                                    ClinicalErrorAction.ACTIVATE_CERTIFICATE -> onOpenCertificateSetup()
                                    ClinicalErrorAction.REVIEW_PATIENT -> {
                                        expandedPatientDropdown = true
                                        coroutineScope.launch { scrollState.animateScrollTo(0) }
                                    }
                                    ClinicalErrorAction.RETRY -> {
                                        viewModel.createOrder(
                                            onSuccess = {
                                                Toast.makeText(
                                                    context,
                                                    context.getString(R.string.doctor_create_order_success_toast),
                                                    Toast.LENGTH_SHORT,
                                                ).show()
                                                onBack()
                                            },
                                        )
                                    }
                                    ClinicalErrorAction.NONE -> Unit
                                }
                            },
                        )
                    }

                    Button(
                        onClick = {
                            viewModel.createOrder(
                                onSuccess = {
                                    Toast.makeText(context, context.getString(R.string.doctor_create_order_success_toast), Toast.LENGTH_SHORT).show()
                                    onBack()
                                }
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .minimumInteractiveComponentSize()
                            .heightIn(min = 48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PortalPatientsAction, contentColor = Color.White),
                        enabled = !uiState.isSubmitting,
                    ) {
                        if (uiState.isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp,
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.doctor_create_order_submitting))
                        } else {
                            Icon(Icons.Outlined.HealthAndSafety, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.doctor_create_order_submit_button), fontWeight = FontWeight.Bold)
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
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 1. Selector de Paciente Elegible + Emisión rápida por DNI / Sexo / WhatsApp
            EventualPatientDniSelectorCard(
                selectedPatient = uiState.selectedPatient,
                eligiblePatients = uiState.eligiblePatients,
                isLoadingPatients = uiState.isLoadingPatients,
                searchQuery = patientSearchQuery,
                onSearchQueryChange = { patientSearchQuery = it },
                expanded = expandedPatientDropdown,
                onExpandedChange = { expandedPatientDropdown = it },
                onSelectPatient = {
                    viewModel.selectPatient(it)
                    expandedPatientDropdown = false
                },
                isRegisteringDni = uiState.isRegisteringDni,
                dniLookupError = uiState.dniLookupError,
                needsManualName = uiState.needsManualName,
                onLookupByDni = { dni, gender, contact, manualName ->
                    viewModel.registerEventualPatientByDni(dni, gender, contact, manualName)
                },
            )

            // 2. Selector de Tipo de Estudio
            StudyTypeSelectorCard(
                selectedStudyType = uiState.studyType,
                onSelectStudyType = { viewModel.onStudyTypeChange(it) },
            )

            // 3. Lista Dinámica de Prácticas
            DynamicPracticesCard(
                studyType = uiState.studyType,
                practices = uiState.practices,
                onUpdatePractice = { index, text -> viewModel.updatePractice(index, text) },
                onAddPractice = { viewModel.addPractice(it) },
                onRemovePractice = { viewModel.removePractice(it) },
            )

            // 4. Diagnóstico Presuntivo / CIE-10
            DiagnosisCard(
                diagnosis = uiState.diagnosis,
                isError = uiState.isDiagnosisValidationError,
                focusRequester = diagnosisFocusRequester,
                onDiagnosisChange = { viewModel.onDiagnosisChange(it) },
            )

            // 5. Preparación e Indicaciones Clínicas
            PreparationNotesCard(
                notes = uiState.notes,
                onNotesChange = { viewModel.onNotesChange(it) },
            )

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun PatientSelectorCard(
    selectedPatient: PrescriptionPatientItem?,
    eligiblePatients: List<PrescriptionPatientItem>,
    isLoadingPatients: Boolean,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSelectPatient: (PrescriptionPatientItem) -> Unit,
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = AuSurface),
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Outlined.Person, contentDescription = null, tint = PortalDoctors)
                Text(
                    text = stringResource(R.string.doctor_create_order_patient_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )
            }

            Surface(
                shape = RoundedCornerShape(12.dp),
                color = AuBackground,
                border = BorderStroke(1.dp, if (selectedPatient != null) PortalDoctors else AuBorder),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onExpandedChange(!expanded) },
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    if (selectedPatient != null) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = selectedPatient.fullName,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                            val noDni = stringResource(R.string.doctor_create_order_patient_no_dni)
                            Text(
                                text = stringResource(
                                    R.string.doctor_create_order_patient_id_format,
                                    selectedPatient.dni ?: noDni,
                                    selectedPatient.patientId.take(8)
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextTertiary,
                            )
                        }
                        Icon(Icons.Default.Check, contentDescription = null, tint = PortalDoctors)
                    } else {
                        Text(
                            text = if (isLoadingPatients) {
                                stringResource(R.string.doctor_create_order_patient_loading)
                            } else {
                                stringResource(R.string.doctor_create_order_patient_unselected)
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = AuTextTertiary,
                        )
                        Icon(Icons.Default.ArrowDropDown, contentDescription = null, tint = AuTextTertiary)
                    }
                }
            }

            if (expanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(AuBackground, RoundedCornerShape(12.dp))
                        .padding(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = onSearchQueryChange,
                        placeholder = { Text(stringResource(R.string.doctor_create_order_patient_search_placeholder)) },
                        leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null, tint = AuTextTertiary) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp),
                    )

                    val filteredList = eligiblePatients.filter {
                        val q = searchQuery.trim()
                        q.isEmpty() || it.fullName.contains(q, ignoreCase = true) || (it.dni?.contains(q) == true)
                    }

                    if (filteredList.isEmpty()) {
                        Text(
                            text = stringResource(R.string.doctor_create_order_patient_empty),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                            modifier = Modifier.padding(8.dp),
                        )
                    } else {
                        filteredList.take(5).forEach { patient ->
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (selectedPatient?.patientId == patient.patientId) PortalDoctorsSoft else Color.Transparent,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelectPatient(patient) },
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column {
                                        Text(
                                            text = patient.fullName,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                            color = AuTextPrimary,
                                        )
                                        val sdText = stringResource(R.string.doctor_create_order_patient_no_dni_short)
                                        Text(
                                            text = stringResource(
                                                R.string.doctor_create_order_patient_dni_short,
                                                patient.dni ?: sdText
                                            ),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = AuTextTertiary,
                                        )
                                    }
                                    if (selectedPatient?.patientId == patient.patientId) {
                                        Icon(Icons.Default.Check, contentDescription = null, tint = PortalDoctors, modifier = Modifier.size(18.dp))
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
private fun StudyTypeSelectorCard(
    selectedStudyType: StudyType,
    onSelectStudyType: (StudyType) -> Unit,
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = AuSurface),
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Outlined.MedicalServices, contentDescription = null, tint = PrimaryDark)
                Text(
                    text = stringResource(R.string.doctor_create_order_study_type_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StudyType.entries.forEach { type ->
                    val isSelected = selectedStudyType == type
                    val (icon, color) = when (type) {
                        StudyType.LABORATORY -> Icons.Outlined.Science to PrimaryDark
                        StudyType.IMAGING -> Icons.Outlined.Visibility to PrimaryDark
                        StudyType.CARDIOLOGY -> Icons.Outlined.Favorite to SecondaryDark
                        StudyType.OTHER -> Icons.Outlined.Description to PrimaryDark
                    }
                    val typeName = when (type) {
                        StudyType.LABORATORY -> stringResource(R.string.doctor_create_order_type_lab_name)
                        StudyType.IMAGING -> stringResource(R.string.doctor_create_order_type_imaging_name)
                        StudyType.CARDIOLOGY -> stringResource(R.string.doctor_create_order_type_cardiology_name)
                        StudyType.OTHER -> stringResource(R.string.doctor_create_order_type_other_name)
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (isSelected) PrimaryContainer.copy(alpha = 0.55f) else AuBackground,
                        border = BorderStroke(
                            if (isSelected) 1.5.dp else 1.dp,
                            if (isSelected) color else AuInputBorder.copy(alpha = 0.45f),
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .minimumInteractiveComponentSize()
                            .selectable(
                                selected = isSelected,
                                role = Role.RadioButton,
                                onClick = { onSelectStudyType(type) },
                            ),
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(PrimaryContainer),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = typeName,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isSelected) color else AuTextPrimary,
                                )
                                Text(
                                    text = when (type) {
                                        StudyType.LABORATORY -> stringResource(R.string.doctor_create_order_type_lab_desc)
                                        StudyType.IMAGING -> stringResource(R.string.doctor_create_order_type_imaging_desc)
                                        StudyType.CARDIOLOGY -> stringResource(R.string.doctor_create_order_type_cardiology_desc)
                                        StudyType.OTHER -> stringResource(R.string.doctor_create_order_type_other_desc)
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = AuTextSecondary,
                                )
                            }

                            RadioButton(
                                selected = isSelected,
                                onClick = null,
                                colors = RadioButtonDefaults.colors(selectedColor = color),
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DynamicPracticesCard(
    studyType: StudyType,
    practices: List<String>,
    onUpdatePractice: (Int, String) -> Unit,
    onAddPractice: (String) -> Unit,
    onRemovePractice: (Int) -> Unit,
) {
    val suggestions = when (studyType) {
        StudyType.LABORATORY -> stringArrayResource(R.array.order_suggestions_lab)
        StudyType.IMAGING -> stringArrayResource(R.array.order_suggestions_imaging)
        StudyType.CARDIOLOGY -> stringArrayResource(R.array.order_suggestions_cardiology)
        StudyType.OTHER -> stringArrayResource(R.array.order_suggestions_other)
    }

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = AuSurface),
        border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Outlined.Description, contentDescription = null, tint = PrimaryDark)
                Text(
                    text = stringResource(R.string.doctor_create_order_practices_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )
            }

            // Quick suggestions chips with FlowRow and real selected state
            if (suggestions.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.doctor_create_order_suggestions_title),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                )
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    suggestions.forEach { suggestion ->
                        val isSelected = practices.any { it.trim().equals(suggestion, ignoreCase = true) }
                        FilterChip(
                            selected = isSelected,
                            onClick = {
                                val existingIdx = practices.indexOfFirst { it.trim().equals(suggestion, ignoreCase = true) }
                                if (existingIdx != -1) {
                                    onRemovePractice(existingIdx)
                                } else {
                                    val emptyIndex = practices.indexOfFirst { it.isBlank() }
                                    if (emptyIndex != -1) {
                                        onUpdatePractice(emptyIndex, suggestion)
                                    } else {
                                        onAddPractice(suggestion)
                                    }
                                }
                            },
                            modifier = Modifier.minimumInteractiveComponentSize(),
                            leadingIcon = {
                                Icon(
                                    imageVector = if (isSelected) Icons.Default.Check else Icons.Default.Add,
                                    contentDescription = null,
                                    modifier = Modifier.size(FilterChipDefaults.IconSize),
                                )
                            },
                            label = {
                                Text(
                                    text = suggestion,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                                )
                            },
                            shape = RoundedCornerShape(10.dp),
                            colors = FilterChipDefaults.filterChipColors(
                                containerColor = AuBackground,
                                labelColor = AuTextPrimary,
                                iconColor = PrimaryDark,
                                selectedContainerColor = PrimaryContainer,
                                selectedLabelColor = PrimaryDark,
                                selectedLeadingIconColor = PrimaryDark,
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = isSelected,
                                borderColor = AuInputBorder,
                                selectedBorderColor = PrimaryDark,
                                borderWidth = 1.dp,
                                selectedBorderWidth = 1.5.dp,
                            ),
                        )
                    }
                }
            }

            // Dynamic Inputs
            practices.forEachIndexed { index, practiceText ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = practiceText,
                        onValueChange = { onUpdatePractice(index, it) },
                        label = { Text(stringResource(R.string.doctor_create_order_practice_label, index + 1)) },
                        placeholder = { Text(stringResource(R.string.doctor_create_order_practice_placeholder)) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = AuBackground,
                            unfocusedContainerColor = AuBackground,
                            focusedBorderColor = PrimaryDark,
                            unfocusedBorderColor = AuInputBorder,
                            focusedLabelColor = PrimaryDark,
                            unfocusedLabelColor = AuTextSecondary,
                            unfocusedPlaceholderColor = AuTextSecondary,
                        )
                    )

                    if (practices.size > 1) {
                        IconButton(
                            onClick = { onRemovePractice(index) },
                            modifier = Modifier.minimumInteractiveComponentSize(),
                        ) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = stringResource(R.string.doctor_create_order_delete_practice_desc),
                                tint = AuDangerText,
                            )
                        }
                    }
                }
            }

            OutlinedButton(
                onClick = { onAddPractice("") },
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
                    text = stringResource(R.string.doctor_create_order_add_practice),
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun DiagnosisCard(
    diagnosis: String,
    isError: Boolean = false,
    focusRequester: FocusRequester = remember { FocusRequester() },
    onDiagnosisChange: (String) -> Unit,
) {
    val requiredDesc = stringResource(R.string.a11y_required_field)
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = AuSurface),
        border = BorderStroke(1.dp, if (isError) AuDangerText else AuInputBorder.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(R.string.doctor_create_order_diagnosis_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
            Text(
                text = stringResource(R.string.doctor_create_order_diagnosis_desc),
                style = MaterialTheme.typography.labelSmall,
                color = AuTextSecondary,
            )
            OutlinedTextField(
                value = diagnosis,
                onValueChange = onDiagnosisChange,
                label = { Text(stringResource(R.string.doctor_create_order_diagnosis_label)) },
                placeholder = { Text(stringResource(R.string.doctor_create_order_diagnosis_placeholder)) },
                supportingText = {
                    Text(
                        text = stringResource(R.string.doctor_create_order_diagnosis_supporting),
                        color = if (isError) AuDangerText else AuTextSecondary,
                    )
                },
                isError = isError,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
                    .semantics { stateDescription = requiredDesc },
                singleLine = false,
                minLines = 2,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuBackground,
                    unfocusedContainerColor = AuBackground,
                    focusedBorderColor = PrimaryDark,
                    unfocusedBorderColor = AuInputBorder,
                    errorBorderColor = AuDangerText,
                    errorLabelColor = AuDangerText,
                    focusedLabelColor = PrimaryDark,
                    unfocusedLabelColor = AuTextSecondary,
                    unfocusedPlaceholderColor = AuTextSecondary,
                )
            )
        }
    }
}

@Composable
private fun PreparationNotesCard(
    notes: String,
    onNotesChange: (String) -> Unit,
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = AuSurface),
        border = BorderStroke(1.dp, AuInputBorder.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(R.string.doctor_create_order_notes_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary,
            )
            Text(
                text = stringResource(R.string.doctor_create_order_notes_desc),
                style = MaterialTheme.typography.labelSmall,
                color = AuTextSecondary,
            )
            OutlinedTextField(
                value = notes,
                onValueChange = onNotesChange,
                label = { Text(stringResource(R.string.doctor_create_order_notes_label)) },
                placeholder = { Text(stringResource(R.string.doctor_create_order_notes_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
                minLines = 2,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuBackground,
                    unfocusedContainerColor = AuBackground,
                    focusedBorderColor = PrimaryDark,
                    unfocusedBorderColor = AuInputBorder,
                    focusedLabelColor = PrimaryDark,
                    unfocusedLabelColor = AuTextSecondary,
                    unfocusedPlaceholderColor = AuTextSecondary,
                )
            )
        }
    }
}

@Composable
private fun OrderErrorBanner(
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

@Preview(name = "Order 360dp 1.5x Normal", widthDp = 360, fontScale = 1.5f, showBackground = true)
@Composable
private fun CreateMedicalOrderPreviewNormal() {
    AutamedicaTheme {
        Column(
            modifier = Modifier
                .background(AuBackground)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DynamicPracticesCard(
                studyType = StudyType.IMAGING,
                practices = listOf("Radiografia de tórax (PA e Perfil)"),
                onUpdatePractice = { _, _ -> },
                onAddPractice = {},
                onRemovePractice = {},
            )
            DiagnosisCard(
                diagnosis = "R05 - Tosse",
                isError = false,
                onDiagnosisChange = {},
            )
        }
    }
}

@Preview(name = "Order 360dp 1.5x Error", widthDp = 360, fontScale = 1.5f, showBackground = true)
@Composable
private fun CreateMedicalOrderPreviewError() {
    AutamedicaTheme {
        Column(
            modifier = Modifier
                .background(AuBackground)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DiagnosisCard(
                diagnosis = "",
                isError = true,
                onDiagnosisChange = {},
            )
            OrderErrorBanner(
                message = stringResource(R.string.clinical_err_order_issue_failed),
                action = ClinicalErrorAction.RETRY,
                onActionClick = {},
            )
        }
    }
}
