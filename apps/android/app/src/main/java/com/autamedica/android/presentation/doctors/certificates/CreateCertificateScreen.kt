package com.autamedica.android.presentation.doctors.certificates

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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
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
import com.autamedica.android.domain.model.CertificateType
import com.autamedica.android.domain.model.DoctorEligibility
import com.autamedica.android.domain.model.MedicalCertificate
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.presentation.prescriptions.components.QrCodeView
import com.autamedica.android.presentation.theme.*

private val COMMON_CERT_DIAGNOSES = listOf(
    "Cuadro de gastroenteritis aguda febril",
    "Infección respiratoria de vías aéreas superiores (Rinofaringitis)",
    "Lumbalgia aguda con contractura paravertebral",
    "Bronquitis aguda con compromiso ventilatorio leve",
    "Cefalea tensional / migrañosa severa",
    "Examen clínico y cardiovascular dentro de parámetros normales (Apto físico)",
    "Traumatismo articular leve con indicación de reposo",
    "Faringoamigdalitis pultácea con reposo domiciliario"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateCertificateScreen(
    patientId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorCertificatesViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    var patientSearchQuery by remember { mutableStateOf("") }
    var expandedPatientDropdown by remember { mutableStateOf(false) }

    LaunchedEffect(patientId) {
        viewModel.initCreateCertificate(patientId)
    }

    Scaffold(
        modifier = modifier,
        containerColor = AuBackground,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Emitir Atestado Médico",
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
                        onClick = { viewModel.onSubmitCertificate() },
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
                            Text("Firmando y Sellando Digitalmente...")
                        } else {
                            Icon(Icons.Outlined.HealthAndSafety, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Firmar y Emitir Certificado Oficial", fontWeight = FontWeight.Bold)
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

            // 3. Certificate Type Selector
            CertificateTypeSelectorSection(
                selectedType = uiState.certificateType,
                onSelectType = { viewModel.onSelectType(it) }
            )

            // 4. Days of Rest & Period (if applicable)
            DaysOfRestSection(
                certificateType = uiState.certificateType,
                daysOfRest = uiState.daysOfRest,
                startDate = uiState.startDate,
                endDate = uiState.endDate,
                onDaysChange = { viewModel.onDaysOfRestChange(it) },
                onStartDateChange = { viewModel.onStartDateChange(it) }
            )

            // 5. Clinical Diagnosis & Secreto Médico Toggle
            DiagnosisAndPrivacySection(
                diagnosis = uiState.diagnosis,
                hideDiagnosis = uiState.hideDiagnosis,
                onDiagnosisChange = { viewModel.onDiagnosisChange(it) },
                onToggleHide = { viewModel.onToggleHideDiagnosis(it) }
            )

            // 6. Clinical Observations
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
                        text = "Indicaciones y Observaciones Clínicas (Opcional)",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                    OutlinedTextField(
                        value = uiState.observations,
                        onValueChange = { viewModel.onObservationsChange(it) },
                        placeholder = { Text("Ej: Reposo domiciliario con hidratación continua. Presentar en RRHH.") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4,
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PortalDoctors,
                            unfocusedBorderColor = AuBorder,
                        )
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    // Success Dialog
    uiState.createdCertificate?.let { created ->
        AlertDialog(
            onDismissRequest = {
                viewModel.clearCreatedCertificate()
                onBack()
            },
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
                    text = "¡Atestado Emitido con Éxito!",
                    fontWeight = FontWeight.Bold,
                    color = AuTextPrimary,
                )
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "El certificado médico digital ha sido firmado con validez institucional.",
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
                                text = created.cuir,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = PortalDoctors
                            )
                            IconButton(onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("CUIR", created.cuir))
                                Toast.makeText(context, "CUIR copiado", Toast.LENGTH_SHORT).show()
                            }) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp), tint = PortalDoctors)
                                    Text("Copiar", style = MaterialTheme.typography.labelSmall, color = PortalDoctors)
                                }
                            }
                        }
                    }

                    // QR Preview
                    QrCodeView(
                        content = created.effectiveQrContent,
                        modifier = Modifier.size(140.dp),
                        contentDescription = "QR de Validación Institucional",
                    )

                    Text(
                        text = "Válido ante empleadores, escuelas o instituciones públicas mediante verificación online.",
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearCreatedCertificate()
                        onBack()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = PortalDoctors)
                ) {
                    Text("Volver a Mis Atestados")
                }
            }
        )
    }
}

@Composable
private fun DoctorRegulatoryBanner(eligibility: DoctorEligibility?) {
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
                imageVector = if (isEligible) Icons.Outlined.HealthAndSafety else Icons.Default.Warning,
                contentDescription = null,
                tint = if (isEligible) AuSuccess else Color(0xFFD97706),
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isEligible) "Habilitación Profesional Activa" else "Verificación Pendiente",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isEligible) AuSuccess else Color(0xFFB45309),
                )
                Text(
                    text = if (isEligible) {
                        "Matrícula: $license · Firma digital habilitada"
                    } else {
                        eligibility?.reason ?: "Requiere matricula activa en SISA para firma con validez oficial."
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
    val filtered = remember(eligiblePatients, patientSearchQuery) {
        if (patientSearchQuery.isBlank()) eligiblePatients
        else eligiblePatients.filter {
            it.fullName.contains(patientSearchQuery, ignoreCase = true) ||
                (it.dni?.contains(patientSearchQuery) == true)
        }
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(PortalDoctors.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Outlined.Person, contentDescription = null, tint = PortalDoctors, modifier = Modifier.size(18.dp))
                }
                Column {
                    Text(
                        text = "Destinatario del Atestado",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                    Text(
                        text = "Paciente registrado que recibirá el certificado",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary
                    )
                }
            }

            if (selectedPatient != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = AuSurfaceHover,
                    border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = selectedPatient.fullName,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                selectedPatient.dni?.let { dni ->
                                    Text(text = "DNI: $dni", style = MaterialTheme.typography.labelSmall, color = AuTextSecondary)
                                }
                                selectedPatient.birthDate?.let { b ->
                                    Text(text = "· $b", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary)
                                }
                            }
                        }
                        TextButton(onClick = { onExpandedChange(true) }) {
                            Text("Cambiar", color = PortalDoctors, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = onExpandedChange,
            ) {
                OutlinedTextField(
                    value = if (selectedPatient != null && !expanded) selectedPatient.fullName else patientSearchQuery,
                    onValueChange = onSearchQueryChange,
                    placeholder = { Text("Buscar paciente por nombre o DNI...") },
                    leadingIcon = { Icon(Icons.Outlined.Person, contentDescription = null, tint = AuTextTertiary) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(MenuAnchorType.PrimaryEditable, enabled = true),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PortalDoctors,
                        unfocusedBorderColor = AuBorder,
                    )
                )

                ExposedDropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { onExpandedChange(false) },
                    modifier = Modifier.background(AuSurface)
                ) {
                    if (isLoadingPatients) {
                        DropdownMenuItem(
                            text = { Text("Cargando pacientes del consultorio...") },
                            onClick = {}
                        )
                    } else if (filtered.isEmpty()) {
                        DropdownMenuItem(
                            text = { Text("No se encontraron pacientes con ese criterio") },
                            onClick = {}
                        )
                    } else {
                        filtered.forEach { p ->
                            DropdownMenuItem(
                                text = {
                                    Column {
                                        Text(p.fullName, fontWeight = FontWeight.Bold)
                                        p.dni?.let { Text("DNI: $it", style = MaterialTheme.typography.labelSmall, color = AuTextTertiary) }
                                    }
                                },
                                onClick = { onSelectPatient(p) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CertificateTypeSelectorSection(
    selectedType: CertificateType,
    onSelectType: (CertificateType) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(PortalDoctors.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Outlined.Description, contentDescription = null, tint = PortalDoctors, modifier = Modifier.size(18.dp))
                }
                Column {
                    Text(
                        text = "Tipo de Atestado / Certificación",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary
                    )
                    Text(
                        text = "Determina el alcance legal e institucional del documento",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CertificateType.entries.forEach { type ->
                    val isSelected = selectedType == type
                    FilterChip(
                        selected = isSelected,
                        onClick = { onSelectType(type) },
                        label = { Text(type.displayName, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                        leadingIcon = if (isSelected) {
                            { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                        } else null,
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PortalDoctors,
                            selectedLabelColor = Color.White,
                            selectedLeadingIconColor = Color.White,
                        )
                    )
                }
            }
        }
    }
}

@Composable
private fun DaysOfRestSection(
    certificateType: CertificateType,
    daysOfRest: Int,
    startDate: String,
    endDate: String?,
    onDaysChange: (Int) -> Unit,
    onStartDateChange: (String) -> Unit,
) {
    val presetDays = listOf(1, 2, 3, 5, 7, 14, 30)

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Duración y Período de Reposo",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary
            )

            // Quick preset chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                presetDays.forEach { days ->
                    val isSelected = daysOfRest == days
                    FilterChip(
                        selected = isSelected,
                        onClick = { onDaysChange(days) },
                        label = { Text(if (days == 1) "24 hs" else if (days == 2) "48 hs" else "$days días") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PortalDoctors,
                            selectedLabelColor = Color.White,
                        )
                    )
                }
                FilterChip(
                    selected = daysOfRest == 0,
                    onClick = { onDaysChange(0) },
                    label = { Text("Sin reposo") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = PortalDoctors,
                        selectedLabelColor = Color.White,
                    )
                )
            }

            // Summary Card
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = AuSurfaceHover,
                border = BorderStroke(1.dp, AuBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Fecha de inicio:", style = MaterialTheme.typography.bodySmall, color = AuTextSecondary)
                        Text(startDate, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = AuTextPrimary)
                    }
                    if (daysOfRest > 0 && endDate != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Reintegro previsto:", style = MaterialTheme.typography.bodySmall, color = AuTextSecondary)
                            Text(endDate, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = Color(0xFF16A34A))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosisAndPrivacySection(
    diagnosis: String,
    hideDiagnosis: Boolean,
    onDiagnosisChange: (String) -> Unit,
    onToggleHide: (Boolean) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Diagnóstico y Certificación Clínica",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = AuTextPrimary
            )

            // Common diagnoses chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                COMMON_CERT_DIAGNOSES.take(4).forEach { diag ->
                    val isSelected = diagnosis == diag
                    FilterChip(
                        selected = isSelected,
                        onClick = { onDiagnosisChange(diag) },
                        label = { Text(diag.take(24) + "...", style = MaterialTheme.typography.labelSmall) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PortalDoctors,
                            selectedLabelColor = Color.White,
                        )
                    )
                }
            }

            OutlinedTextField(
                value = diagnosis,
                onValueChange = onDiagnosisChange,
                placeholder = { Text("Describa el diagnóstico, cuadro o aptitud clínica...") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PortalDoctors,
                    unfocusedBorderColor = AuBorder,
                )
            )

            // Secreto Médico Switch Card
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (hideDiagnosis) Color(0xFFF0FDF4) else AuSurfaceHover,
                border = BorderStroke(1.dp, if (hideDiagnosis) Color(0xFF86EFAC) else AuBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Lock,
                        contentDescription = null,
                        tint = if (hideDiagnosis) Color(0xFF16A34A) else AuTextTertiary,
                        modifier = Modifier.size(24.dp)
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Ocultar diagnóstico en documento final",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = AuTextPrimary
                        )
                        Text(
                            text = "Garantía de Secreto Médico y confidencialidad ante empleadores (Ley 27.553 / CFM)",
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextSecondary
                        )
                    }
                    Switch(
                        checked = hideDiagnosis,
                        onCheckedChange = onToggleHide,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = Color(0xFF16A34A),
                        )
                    )
                }
            }
        }
    }
}
