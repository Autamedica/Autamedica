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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
                            text = "Emitir Receta Digital",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = "Decreto 63/2024 · Ley 27.553",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
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
                    uiState.createError?.let { err ->
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
                        enabled = !uiState.isSubmitting,
                    ) {
                        if (uiState.isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Firmando y Generando CUIR...")
                        } else {
                            Icon(Icons.Outlined.HealthAndSafety, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Firmar y Emitir Receta Oficial", fontWeight = FontWeight.Bold)
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
                text = "Fármacos a Prescribir (Máximo 3 por receta)",
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
                    Text("Agregar otro medicamento (${uiState.items.size}/3)", fontWeight = FontWeight.SemiBold)
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
                label = { Text("Observaciones / Indicaciones a farmacia (opcional)") },
                placeholder = { Text("Ej: Apto sustitución genérica, uso prolongado...") },
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
                    text = "¡Receta Emitida con Éxito!",
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
                        text = "La receta digital ha sido firmada y registrada según normativa vigente.",
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
                                text = "CÓDIGO ÚNICO (CUIR):",
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
                                Toast.makeText(context, "CUIR copiado", Toast.LENGTH_SHORT).show()
                            }) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp), tint = PortalDoctors)
                                    Text("Copiar", style = MaterialTheme.typography.labelSmall, color = PortalDoctors)
                                }
                            }
                        }
                    }

                    Text(
                        text = "Válida en farmacias de todo el país mediante consulta online o lectura del código QR.",
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
                    Text("Ver Mis Recetas")
                }
            }
        )
    }
}

@Composable
private fun DoctorRegulatoryBanner(eligibility: com.autamedica.android.domain.model.DoctorEligibility?) {
    val isEligible = eligibility?.isEligible ?: true
    val license = eligibility?.doctorLicense ?: "Registrada"

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isEligible) AuSuccess.copy(alpha = 0.08f) else Color(0xFFFEF3C7),
        border = BorderStroke(1.dp, if (isEligible) AuSuccess.copy(alpha = 0.25f) else Color(0xFFF59E0B)),
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
                tint = if (isEligible) AuSuccess else Color(0xFFD97706),
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isEligible) "Prescriptor Habilitado · SISA REFEPS" else "Estado de Validación Profesional",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isEligible) AuSuccess else Color(0xFFB45309)
                )
                Text(
                    text = if (isEligible) {
                        "Matrícula: MN $license · Firma digital y CUIR habilitados"
                    } else {
                        eligibility?.reason ?: "Verifique su matrícula en el perfil para cumplir Decreto 63/2024"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary
                )
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
                text = "Paciente Destinatario",
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
                                    text = "DNI: $dni",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = AuTextTertiary
                                )
                            }
                        }
                        TextButton(onClick = { onExpandedChange(true) }) {
                            Text("Cambiar", color = PortalDoctors)
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
                        label = { Text("Buscar paciente por nombre o DNI...") },
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
                                text = { Text("Cargando pacientes...", color = AuTextTertiary) },
                                onClick = {}
                            )
                        } else if (filteredPatients.isEmpty()) {
                            DropdownMenuItem(
                                text = { Text("No se encontraron pacientes", color = AuTextTertiary) },
                                onClick = {}
                            )
                        } else {
                            filteredPatients.forEach { pat ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Text(pat.fullName, fontWeight = FontWeight.SemiBold, color = AuTextPrimary)
                                            pat.dni?.let { Text("DNI: $it", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary) }
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
                        text = "Medicamento #$itemNumber",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                }
                if (canDelete) {
                    IconButton(onClick = onDelete, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Delete, contentDescription = "Eliminar", tint = AuDanger, modifier = Modifier.size(18.dp))
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
                    label = { Text("Fármaco o Principio Activo *") },
                    placeholder = { Text("Ej: Amoxicilina 500 mg, Losartán 50 mg...") },
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
                    label = { Text("Dosis *") },
                    placeholder = { Text("Ej: 500 mg, 1 comprimido...") },
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
                    label = { Text("Frecuencia *") },
                    placeholder = { Text("Ej: Cada 8 horas, 1 vez al día...") },
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
                    label = { Text("Duración del tratamiento") },
                    placeholder = { Text("Ej: Por 7 días, Tratamiento crónico...") },
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
                label = { Text("Instrucciones específicas") },
                placeholder = { Text("Ej: Tomar con abundantes líquidos junto con el almuerzo...") },
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
                text = "Diagnóstico Principal (CIE-10) *",
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
                placeholder = { Text("Buscar diagnóstico (ej: Hipertensión, Faringitis, I10...)") },
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
