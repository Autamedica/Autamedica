package com.autamedica.android.presentation.doctors.medicalorders

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import com.autamedica.android.domain.model.PracticeItem
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.domain.model.StudyType
import com.autamedica.android.presentation.theme.*

private val COMMON_PRACTICE_SUGGESTIONS = mapOf(
    StudyType.LABORATORY to listOf(
        "Hemograma completo",
        "Glucemia en ayunas",
        "Perfil lipídico completo",
        "Hepatograma",
        "Uremia y Creatinina",
        "Orina completa",
        "TSH y T4 libre",
        "Ionograma plasmático",
    ),
    StudyType.IMAGING to listOf(
        "Ecografía abdominal completa",
        "Radiografía de tórax (Frente y Perfil)",
        "Ecografía renal y vesical",
        "Resonancia magnética de columna lumbar",
        "Tomografía computada de tórax sin contraste",
        "Mamografía bilateral",
    ),
    StudyType.CARDIOLOGY to listOf(
        "Electrocardiograma (ECG) de 12 derivaciones",
        "Ecocardiograma Doppler color",
        "Ergometría de 12 derivaciones",
        "Holter cardíaco de 24 hs",
        "Presurometría (MAPA 24 hs)",
    ),
    StudyType.OTHER to listOf(
        "Espirometría computarizada",
        "Endoscopía digestiva alta",
        "Colonoscopía",
        "Audiometría tonal",
        "Polisomnografía nocturna",
    ),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateMedicalOrderScreen(
    patientId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorMedicalOrdersViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    var expandedPatientDropdown by remember { mutableStateOf(false) }
    var patientSearchQuery by remember { mutableStateOf("") }

    LaunchedEffect(patientId) {
        if (patientId.isNotBlank()) {
            viewModel.selectPatientById(patientId)
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
                            color = AuTextTertiary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
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
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val errorMessageText = when {
                        uiState.errorMessageResId != null -> stringResource(uiState.errorMessageResId!!)
                        uiState.errorMessage != null -> uiState.errorMessage
                        else -> null
                    }
                    errorMessageText?.let { err ->
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
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                        }
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
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors),
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
            // 1. Selector de Paciente Elegible
            PatientSelectorCard(
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
                Icon(Icons.Outlined.MedicalServices, contentDescription = null, tint = PortalDoctors)
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
                        StudyType.LABORATORY -> Icons.Outlined.Science to PortalPatients
                        StudyType.IMAGING -> Icons.Outlined.Visibility to Color(0xFF8B5CF6)
                        StudyType.CARDIOLOGY -> Icons.Outlined.Favorite to Color(0xFFE11D48)
                        StudyType.OTHER -> Icons.Outlined.Description to PortalDoctors
                    }
                    val typeName = when (type) {
                        StudyType.LABORATORY -> stringResource(R.string.doctor_create_order_type_lab_name)
                        StudyType.IMAGING -> stringResource(R.string.doctor_create_order_type_imaging_name)
                        StudyType.CARDIOLOGY -> stringResource(R.string.doctor_create_order_type_cardiology_name)
                        StudyType.OTHER -> stringResource(R.string.doctor_create_order_type_other_name)
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (isSelected) color.copy(alpha = 0.08f) else AuBackground,
                        border = BorderStroke(
                            1.dp,
                            if (isSelected) color else AuBorder,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelectStudyType(type) },
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
                                    .background(color.copy(alpha = 0.12f)),
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
                                    color = AuTextTertiary,
                                )
                            }

                            RadioButton(
                                selected = isSelected,
                                onClick = { onSelectStudyType(type) },
                                colors = RadioButtonDefaults.colors(selectedColor = color),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DynamicPracticesCard(
    studyType: StudyType,
    practices: List<String>,
    onUpdatePractice: (Int, String) -> Unit,
    onAddPractice: (String) -> Unit,
    onRemovePractice: (Int) -> Unit,
) {
    val suggestions = COMMON_PRACTICE_SUGGESTIONS[studyType] ?: emptyList()

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
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Outlined.Description, contentDescription = null, tint = PortalDoctors)
                    Text(
                        text = stringResource(R.string.doctor_create_order_practices_title),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                }

                TextButton(onClick = { onAddPractice("") }) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp), tint = PortalDoctors)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(stringResource(R.string.doctor_create_order_add_practice), color = PortalDoctors, fontWeight = FontWeight.Bold)
                }
            }

            // Quick suggestions chips
            if (suggestions.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.doctor_create_order_suggestions_title),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    suggestions.forEach { suggestion ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = AuBackground,
                            border = BorderStroke(1.dp, AuBorder),
                            modifier = Modifier.clickable {
                                val emptyIndex = practices.indexOfFirst { it.isBlank() }
                                if (emptyIndex != -1) {
                                    onUpdatePractice(emptyIndex, suggestion)
                                } else {
                                    onAddPractice(suggestion)
                                }
                            },
                        ) {
                            Text(
                                text = "+ $suggestion",
                                style = MaterialTheme.typography.labelSmall,
                                color = PortalDoctors,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
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
                            focusedBorderColor = PortalDoctors,
                            unfocusedBorderColor = AuBorder,
                        )
                    )

                    if (practices.size > 1) {
                        IconButton(onClick = { onRemovePractice(index) }) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = stringResource(R.string.doctor_create_order_delete_practice_desc),
                                tint = AuDanger.copy(alpha = 0.8f),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosisCard(
    diagnosis: String,
    onDiagnosisChange: (String) -> Unit,
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = AuSurface),
        border = BorderStroke(1.dp, AuBorder),
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
                color = AuTextTertiary,
            )
            OutlinedTextField(
                value = diagnosis,
                onValueChange = onDiagnosisChange,
                placeholder = { Text(stringResource(R.string.doctor_create_order_diagnosis_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
                minLines = 2,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuBackground,
                    unfocusedContainerColor = AuBackground,
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = AuBorder,
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
        border = BorderStroke(1.dp, AuBorder),
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
                color = AuTextTertiary,
            )
            OutlinedTextField(
                value = notes,
                onValueChange = onNotesChange,
                placeholder = { Text(stringResource(R.string.doctor_create_order_notes_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
                minLines = 2,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = AuBackground,
                    unfocusedContainerColor = AuBackground,
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = AuBorder,
                )
            )
        }
    }
}
