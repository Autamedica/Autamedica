package com.autamedica.android.presentation.profile

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Cake
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.domain.model.PatientProfileSnapshot
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.SuccessContainer
import java.time.LocalDate
import java.time.Period
import java.time.format.DateTimeFormatter
import java.util.Locale

private val profileLocale = Locale("es", "AR")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    var showDeleteDialog by remember { mutableStateOf(false) }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val user = uiState.user
    val accentColor = remember(user?.role) { roleAccent(user?.role) }
    val completion = remember(
        uiState.firstName,
        uiState.lastName,
        uiState.phone,
        user?.email,
        uiState.patientSnapshot,
        user?.role,
    ) {
        calculateProfileCompletion(
            user = user,
            firstName = uiState.firstName,
            lastName = uiState.lastName,
            phone = uiState.phone,
            patientSnapshot = uiState.patientSnapshot,
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.profile_title),
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = {
                    IconButton(onClick = onLogout) {
                        Icon(
                            Icons.AutoMirrored.Filled.ExitToApp,
                            contentDescription = "Cerrar sesion",
                            tint = AuDanger,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AuBackground,
                ),
            )
        },
        containerColor = AuBackground,
        modifier = modifier,
    ) { innerPadding ->
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = AuAccent, strokeWidth = 2.dp)
                }
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 18.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    user?.let {
                        ProfileHeroCard(
                            user = it,
                            uiState = uiState,
                            accentColor = accentColor,
                            completion = completion,
                        )
                    }

                    ProfileEditCard(
                        uiState = uiState,
                        onFirstNameChange = viewModel::onFirstNameChange,
                        onLastNameChange = viewModel::onLastNameChange,
                        onPhoneChange = viewModel::onPhoneChange,
                        onSave = viewModel::saveProfile,
                    )

                    user?.let {
                        ContactSection(
                            email = it.email,
                            phone = uiState.phone,
                        )
                    }

                    uiState.patientSnapshot?.let { snapshot ->
                        PersonalSummarySection(snapshot = snapshot)
                        MedicalSummarySection(snapshot = snapshot)
                        EmergencyContactSection(snapshot = snapshot)
                    }

                    SessionSection(onLogout = onLogout)
                    
                    SecurityZoneSection(onDeleteRequest = { showDeleteDialog = true })
                }
            }
        }
        
        if (showDeleteDialog) {
            AlertDialog(
                onDismissRequest = { showDeleteDialog = false },
                title = { Text("Eliminar cuenta") },
                text = { Text("¿Estás seguro de que deseas eliminar tu cuenta? Esta acción no se puede deshacer.") },
                confirmButton = {
                    TextButton(onClick = {
                        showDeleteDialog = false
                        onLogout()
                    }) {
                        Text("Eliminar", color = AuDanger)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDeleteDialog = false }) {
                        Text("Cancelar")
                    }
                }
            )
        }
    }
}

@Composable
private fun ProfileHeroCard(
    user: User,
    uiState: ProfileUiState,
    accentColor: Color,
    completion: Int,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        modifier = Modifier.size(74.dp),
                        shape = CircleShape,
                        color = AuSurfaceHover,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            modifier = Modifier.padding(18.dp),
                            tint = accentColor,
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = displayName(user, uiState.firstName, uiState.lastName),
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = accentColor.copy(alpha = 0.14f),
                        ) {
                            Text(
                                text = roleLabel(user.role),
                                style = MaterialTheme.typography.labelSmall,
                                color = accentColor,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            )
                        }
                        Text(
                            text = user.email,
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Completitud del perfil",
                        style = MaterialTheme.typography.titleSmall,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "$completion%",
                        style = MaterialTheme.typography.titleSmall,
                        color = accentColor,
                        fontWeight = FontWeight.Bold,
                    )
                }
                LinearProgressIndicator(
                    progress = { completion / 100f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = accentColor,
                    trackColor = AuSurfaceHover,
                )
                Text(
                    text = if (completion < 100) {
                        "Completá tus datos de contacto para tus turnos y recetas."
                    } else {
                        "Tu perfil está completo."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
            }
        }
    }
}

@Composable
private fun ProfileEditCard(
    uiState: ProfileUiState,
    onFirstNameChange: (String) -> Unit,
    onLastNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    val textFieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = AuTextPrimary,
        unfocusedTextColor = AuTextPrimary,
        focusedContainerColor = AuSurface,
        unfocusedContainerColor = AuSurface,
        focusedBorderColor = PrimaryLight,
        unfocusedBorderColor = AuBorder,
        focusedLabelColor = PrimaryLight,
        unfocusedLabelColor = AuTextTertiary,
        cursorColor = AuAccent,
    )

    SectionCard(
        title = "Informacion personal",
        subtitle = "Actualizá tu nombre y teléfono de contacto.",
        icon = Icons.Default.Person,
    ) {
        OutlinedTextField(
            value = uiState.firstName,
            onValueChange = onFirstNameChange,
            label = { Text(stringResource(R.string.profile_name_label)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = textFieldColors,
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = uiState.lastName,
            onValueChange = onLastNameChange,
            label = { Text(stringResource(R.string.profile_last_name_label)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = textFieldColors,
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = uiState.phone,
            onValueChange = onPhoneChange,
            label = { Text(stringResource(R.string.profile_phone_label)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = textFieldColors,
        )

        AnimatedVisibility(visible = uiState.error != null) {
            Text(
                text = uiState.error ?: "",
                color = AuDanger,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(top = 12.dp),
            )
        }

        AnimatedVisibility(
            visible = uiState.saveSuccess,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                shape = RoundedCornerShape(12.dp),
                color = SuccessContainer,
            ) {
                Text(
                    text = "Perfil actualizado correctamente",
                    color = AuSuccess,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(12.dp),
                    textAlign = TextAlign.Center,
                )
            }
        }

        Spacer(modifier = Modifier.height(18.dp))

        Button(
            onClick = onSave,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            enabled = !uiState.isSaving && uiState.firstName.isNotBlank(),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = AuAccent,
                contentColor = AuBackground,
                disabledContainerColor = AuBorder,
                disabledContentColor = AuTextTertiary,
            ),
        ) {
            if (uiState.isSaving) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = AuBackground,
                )
            } else {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    "Guardar cambios",
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun ContactSection(
    email: String,
    phone: String,
) {
    SectionCard(
        title = "Contacto",
        subtitle = "Canales de comunicación para avisos y turnos.",
        icon = Icons.Outlined.Email,
    ) {
        InfoRow(
            icon = Icons.Outlined.Email,
            label = "Email",
            value = email,
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.Phone,
            label = "Telefono",
            value = phone.ifBlank { "—" },
        )
    }
}

@Composable
private fun PersonalSummarySection(
    snapshot: PatientProfileSnapshot,
) {
    val age = remember(snapshot.birthDate) { computeAge(snapshot.birthDate) }

    SectionCard(
        title = "Resumen personal",
        subtitle = "Datos registrados en tu cuenta.",
        icon = Icons.Outlined.Cake,
    ) {
        InfoRow(
            icon = Icons.Outlined.CalendarMonth,
            label = "Fecha de nacimiento",
            value = formatDate(snapshot.birthDate),
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.Cake,
            label = "Edad",
            value = age?.let { "$it anos" } ?: "—",
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.Info,
            label = "Genero",
            value = genderLabel(snapshot.gender),
        )
    }
}

@Composable
private fun MedicalSummarySection(
    snapshot: PatientProfileSnapshot,
) {
    val bmi = remember(snapshot.heightCm, snapshot.weightKg) {
        computeBmi(snapshot.heightCm, snapshot.weightKg)
    }

    SectionCard(
        title = "Datos medicos",
        subtitle = "Información clínica básica.",
        icon = Icons.Outlined.MedicalServices,
    ) {
        InfoRow(
            icon = Icons.Outlined.HealthAndSafety,
            label = "Tipo de sangre",
            value = snapshot.bloodType ?: "—",
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.MedicalServices,
            label = "Altura",
            value = snapshot.heightCm?.let { formatMetric(it, "cm") } ?: "—",
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.MedicalServices,
            label = "Peso",
            value = snapshot.weightKg?.let { formatMetric(it, "kg") } ?: "—",
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.CheckCircle,
            label = "IMC",
            value = bmi?.toString() ?: "—",
        )
    }
}

@Composable
private fun EmergencyContactSection(
    snapshot: PatientProfileSnapshot,
) {
    SectionCard(
        title = "Contacto de emergencia",
        subtitle = "Contacto para casos de urgencia médica.",
        icon = Icons.Outlined.Phone,
    ) {
        InfoRow(
            icon = Icons.Default.Person,
            label = "Nombre",
            value = snapshot.emergencyContactName ?: "—",
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.Info,
            label = "Relacion",
            value = snapshot.emergencyContactRelationship ?: "—",
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.Phone,
            label = "Telefono",
            value = snapshot.emergencyContactPhone ?: "—",
        )
        Spacer(modifier = Modifier.height(14.dp))
        InfoRow(
            icon = Icons.Outlined.Email,
            label = "Email",
            value = snapshot.emergencyContactEmail ?: "—",
        )
    }
}

@Composable
private fun SessionSection(
    onLogout: () -> Unit,
) {
    SectionCard(
        title = "Sesion",
        subtitle = "Administra el acceso al dispositivo actual.",
        icon = Icons.AutoMirrored.Filled.ExitToApp,
    ) {
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.5f)),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = AuDanger,
            ),
        ) {
            Icon(
                Icons.AutoMirrored.Filled.ExitToApp,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                "Cerrar sesion",
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    modifier = Modifier.size(40.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = AuSurfaceHover,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.padding(9.dp),
                        tint = AuTextSecondary,
                    )
                }
                Column {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = AuTextTertiary,
                    )
                }
            }

            Spacer(modifier = Modifier.height(18.dp))
            content()
        }
    }
}

@Composable
private fun InfoRow(
    icon: ImageVector,
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier.size(34.dp),
            shape = CircleShape,
            color = AuBackground,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.padding(8.dp),
                tint = AuTextSecondary,
            )
        }
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = AuTextTertiary,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextPrimary,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

private fun displayName(user: User, firstName: String, lastName: String): String {
    return listOf(firstName, lastName)
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .ifBlank { user.displayName }
}

private fun roleLabel(role: UserRole): String = when (role) {
    UserRole.PATIENT -> "Paciente"
    UserRole.DOCTOR -> "Medico"
    UserRole.COMPANY -> "Empresa"
    UserRole.PHARMACIST -> "Farmacia"
    UserRole.COMPANY_ADMIN -> "Admin empresa"
    UserRole.ORGANIZATION_ADMIN -> "Admin organizacion"
    UserRole.ADMIN -> "Admin"
    UserRole.PLATFORM_ADMIN -> "Admin plataforma"
}

private fun roleAccent(role: UserRole?): Color = when (role) {
    UserRole.DOCTOR -> PortalDoctors
    UserRole.PATIENT -> PortalPatients
    else -> AuAccent
}

private fun calculateProfileCompletion(
    user: User?,
    firstName: String,
    lastName: String,
    phone: String,
    patientSnapshot: PatientProfileSnapshot?,
): Int {
    if (user == null) return 0

    val checks = mutableListOf(
        firstName.isNotBlank(),
        lastName.isNotBlank(),
        user.email.isNotBlank(),
        phone.isNotBlank(),
    )

    if (user.role == UserRole.PATIENT) {
        checks += listOf(
            !patientSnapshot?.birthDate.isNullOrBlank(),
            !patientSnapshot?.gender.isNullOrBlank(),
            !patientSnapshot?.bloodType.isNullOrBlank(),
            !patientSnapshot?.emergencyContactPhone.isNullOrBlank(),
        )
    }

    val completed = checks.count { it }
    return ((completed.toFloat() / checks.size.toFloat()) * 100f).toInt()
}

private fun computeAge(birthDate: String?): Int? {
    if (birthDate.isNullOrBlank()) return null
    return runCatching {
        val parsed = LocalDate.parse(birthDate)
        Period.between(parsed, LocalDate.now()).years
    }.getOrNull()
}

private fun computeBmi(heightCm: Double?, weightKg: Double?): Double? {
    if (heightCm == null || weightKg == null || heightCm <= 0.0) return null
    val heightMeters = heightCm / 100.0
    val bmi = weightKg / (heightMeters * heightMeters)
    return if (bmi.isFinite()) {
        String.format(Locale.US, "%.1f", bmi).toDouble()
    } else {
        null
    }
}

private fun formatMetric(value: Double, suffix: String): String {
    val display = if (value % 1.0 == 0.0) {
        value.toInt().toString()
    } else {
        String.format(Locale.US, "%.1f", value)
    }
    return "$display $suffix"
}

private fun formatDate(value: String?): String {
    if (value.isNullOrBlank()) return "—"
    return runCatching {
        LocalDate.parse(value).format(DateTimeFormatter.ofPattern("d 'de' MMMM, yyyy", profileLocale))
    }.getOrElse { value }
}

private fun genderLabel(value: String?): String {
    return when (value?.lowercase()) {
        "male" -> "Masculino"
        "female" -> "Femenino"
        "other" -> "Otro"
        "prefer_not_to_say" -> "Prefiero no decirlo"
        null, "" -> "—"
        else -> value.replaceFirstChar { it.uppercase() }
    }
}

@Composable
private fun SecurityZoneSection(
    onDeleteRequest: () -> Unit,
) {
    SectionCard(
        title = "Zona de seguridad",
        subtitle = "Gestión de cuenta y privacidad de datos.",
        icon = Icons.Default.Person,
    ) {
        OutlinedButton(
            onClick = onDeleteRequest,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.5f)),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = AuDanger,
            ),
        ) {
            Text(
                "Eliminar mi cuenta",
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
