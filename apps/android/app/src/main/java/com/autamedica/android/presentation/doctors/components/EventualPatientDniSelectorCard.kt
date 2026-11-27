package com.autamedica.android.presentation.doctors.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.autamedica.android.R
import com.autamedica.android.domain.model.PrescriptionPatientItem
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuEmerald
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatientsAction
import com.autamedica.android.presentation.theme.PrimaryContainer

@Composable
fun EventualPatientDniSelectorCard(
    selectedPatient: PrescriptionPatientItem?,
    eligiblePatients: List<PrescriptionPatientItem>,
    isLoadingPatients: Boolean,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSelectPatient: (PrescriptionPatientItem) -> Unit,
    isRegisteringDni: Boolean,
    dniLookupError: String?,
    needsManualName: Boolean,
    onLookupByDni: (dni: String, gender: String, contact: String, manualName: String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showDniQuickForm by remember { mutableStateOf(false) }
    var dniInput by remember { mutableStateOf("") }
    var genderInput by remember { mutableStateOf("F") }
    var contactInput by remember { mutableStateOf("") }
    var manualNameInput by remember { mutableStateOf("") }

    Surface(
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(PrimaryContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Person,
                            contentDescription = null,
                            tint = PortalPatientsAction,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Column {
                        Text(
                            text = stringResource(R.string.doctor_dni_selector_title),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.ExtraBold,
                            color = AuTextPrimary,
                        )
                        Text(
                            text = stringResource(R.string.doctor_dni_selector_subtitle),
                            style = MaterialTheme.typography.labelSmall,
                            color = AuTextTertiary,
                        )
                    }
                }

                if (!showDniQuickForm) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = PrimaryContainer,
                        border = BorderStroke(1.dp, PortalPatientsAction.copy(alpha = 0.25f)),
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .clickable {
                                showDniQuickForm = true
                                onExpandedChange(false)
                            },
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = null,
                                tint = PortalPatientsAction,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = stringResource(R.string.doctor_dni_quick_add_btn),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.ExtraBold,
                                color = PortalPatientsAction,
                            )
                        }
                    }
                }
            }

            // Selected patient card with small circular photo avatar + WhatsApp/Email badge
            if (selectedPatient != null && !showDniQuickForm) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = AuSurfaceHover,
                    border = BorderStroke(1.5.dp, PortalPatientsAction.copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        PatientSmallAvatar(
                            fullName = selectedPatient.fullName,
                            avatarUrl = selectedPatient.avatarUrl,
                            size = 46.dp,
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = selectedPatient.fullName,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.ExtraBold,
                                color = AuTextPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                selectedPatient.dni?.takeIf { it.isNotBlank() }?.let { dni ->
                                    Text(
                                        text = "DNI/CPF: $dni",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = AuTextSecondary,
                                    )
                                }
                                selectedPatient.coverageName?.takeIf { it.isNotBlank() }?.let { cov ->
                                    Text(
                                        text = "· $cov",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = PortalPatientsAction,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            selectedPatient.contact?.takeIf { it.isNotBlank() }?.let { contact ->
                                Spacer(modifier = Modifier.height(4.dp))
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color(0xFFECFDF5),
                                ) {
                                    Text(
                                        text = stringResource(R.string.doctor_dni_delivery_badge, contact),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontSize = 10.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF065F46),
                                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                        TextButton(onClick = { onExpandedChange(!expanded) }) {
                            Text(
                                text = stringResource(R.string.clinical_ops_change),
                                color = PortalPatientsAction,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }

            // Expandable 3-Field DNI + Sex + WhatsApp/Email panel for non-registered people
            AnimatedVisibility(visible = showDniQuickForm) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, PortalPatientsAction.copy(alpha = 0.30f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                PatientSmallAvatar(
                                    fullName = manualNameInput.ifBlank { "DNI" },
                                    avatarUrl = selectedPatient?.takeIf { it.dni == dniInput.filter(Char::isDigit) }?.avatarUrl,
                                    size = 40.dp,
                                )
                                Column {
                                    Text(
                                        text = stringResource(R.string.doctor_dni_panel_title),
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = PortalPatientsAction,
                                    )
                                    Text(
                                        text = stringResource(R.string.doctor_dni_panel_subtitle),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = AuTextSecondary,
                                    )
                                }
                            }
                            IconButton(
                                onClick = { showDniQuickForm = false },
                                modifier = Modifier.size(28.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = null,
                                    tint = AuTextSecondary,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }

                        // Field 1: DNI / CPF
                        OutlinedTextField(
                            value = dniInput,
                            onValueChange = { dniInput = it.filter { ch -> ch.isDigit() || ch == '.' || ch == '-' } },
                            label = { Text(stringResource(R.string.doctor_dni_field_document)) },
                            placeholder = { Text("Ej: 32456789") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PortalPatientsAction,
                                unfocusedBorderColor = AuBorder,
                                focusedContainerColor = Color.White,
                                unfocusedContainerColor = Color.White,
                            ),
                        )

                        // Field 2: Sexo en el DNI (F · M · X)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = stringResource(R.string.doctor_dni_field_sex),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = AuTextSecondary,
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                listOf(
                                    "F" to stringResource(R.string.doctor_dni_sex_f),
                                    "M" to stringResource(R.string.doctor_dni_sex_m),
                                    "X" to stringResource(R.string.doctor_dni_sex_x),
                                ).forEach { (code, label) ->
                                    val selected = genderInput == code
                                    FilterChip(
                                        selected = selected,
                                        onClick = { genderInput = code },
                                        label = {
                                            Text(
                                                text = label,
                                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                            )
                                        },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = PortalPatientsAction,
                                            selectedLabelColor = Color.White,
                                            containerColor = Color.White,
                                            labelColor = AuTextPrimary,
                                        ),
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }

                        // Field 3: WhatsApp o Correo electrónico
                        OutlinedTextField(
                            value = contactInput,
                            onValueChange = { contactInput = it },
                            label = { Text(stringResource(R.string.doctor_dni_field_contact)) },
                            placeholder = { Text("+54 9 11 ... o correo@ejemplo.com") },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Outlined.Email,
                                    contentDescription = null,
                                    tint = PortalPatientsAction,
                                    modifier = Modifier.size(18.dp),
                                )
                            },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PortalPatientsAction,
                                unfocusedBorderColor = AuBorder,
                                focusedContainerColor = Color.White,
                                unfocusedContainerColor = Color.White,
                            ),
                        )

                        // Optional / Fallback manual full name if RENAPER doesn't return a match
                        if (needsManualName) {
                            OutlinedTextField(
                                value = manualNameInput,
                                onValueChange = { manualNameInput = it },
                                label = { Text(stringResource(R.string.doctor_dni_field_manual_name)) },
                                placeholder = { Text("Nombre y Apellido completos") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = PortalPatientsAction,
                                    unfocusedBorderColor = AuBorder,
                                    focusedContainerColor = Color.White,
                                    unfocusedContainerColor = Color.White,
                                ),
                            )
                        }

                        dniLookupError?.takeIf { it.isNotBlank() }?.let { err ->
                            Text(
                                text = err,
                                style = MaterialTheme.typography.bodySmall,
                                color = AuDanger,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }

                        Button(
                            onClick = {
                                onLookupByDni(
                                    dniInput,
                                    genderInput,
                                    contactInput,
                                    manualNameInput.takeIf { it.isNotBlank() },
                                )
                            },
                            enabled = !isRegisteringDni && dniInput.filter(Char::isDigit).length >= 7 && contactInput.isNotBlank(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(46.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PortalPatientsAction,
                                contentColor = Color.White,
                            ),
                        ) {
                            if (isRegisteringDni) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.doctor_dni_searching_btn), fontWeight = FontWeight.Bold)
                            } else {
                                Icon(Icons.Outlined.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(stringResource(R.string.doctor_dni_submit_btn), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Existing patient selector dropdown when no patient is selected or doctor clicked Cambiar
            if (!showDniQuickForm && (selectedPatient == null || expanded)) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = AuBackground,
                    border = BorderStroke(1.dp, AuBorder),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onExpandedChange(!expanded) },
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
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

                if (expanded) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(AuBackground, RoundedCornerShape(12.dp))
                            .padding(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
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
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    text = stringResource(R.string.doctor_create_order_patient_empty),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuTextTertiary,
                                )
                                OutlinedButton(
                                    onClick = {
                                        if (searchQuery.all { it.isDigit() } && searchQuery.length >= 7) {
                                            dniInput = searchQuery
                                        }
                                        showDniQuickForm = true
                                        onExpandedChange(false)
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp),
                                    border = BorderStroke(1.dp, PortalPatientsAction),
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = null, tint = PortalPatientsAction, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = stringResource(R.string.doctor_dni_quick_add_btn),
                                        color = PortalPatientsAction,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        } else {
                            filteredList.take(8).forEach { patient ->
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = if (selectedPatient?.patientId == patient.patientId) PrimaryContainer else Color.White,
                                    border = BorderStroke(0.5.dp, AuBorder),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onSelectPatient(patient) },
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        PatientSmallAvatar(
                                            fullName = patient.fullName,
                                            avatarUrl = patient.avatarUrl,
                                            size = 36.dp,
                                        )
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = patient.fullName,
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = AuTextPrimary,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                            val dniLabel = patient.dni?.takeIf { it.isNotBlank() }?.let { "DNI/CPF: $it" } ?: ""
                                            val contactLabel = patient.contact?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""
                                            if (dniLabel.isNotBlank() || contactLabel.isNotBlank()) {
                                                Text(
                                                    text = dniLabel + contactLabel,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = AuTextTertiary,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                            }
                                        }
                                        if (selectedPatient?.patientId == patient.patientId) {
                                            Icon(Icons.Default.Check, contentDescription = null, tint = PortalPatientsAction, modifier = Modifier.size(18.dp))
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
fun PatientSmallAvatar(
    fullName: String,
    avatarUrl: String?,
    size: Dp = 42.dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(PrimaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        if (!avatarUrl.isNullOrBlank()) {
            AsyncImage(
                model = avatarUrl,
                contentDescription = fullName,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
        } else {
            val initials = fullName
                .trim()
                .split(Regex("\\s+"))
                .filter { it.isNotBlank() }
                .take(2)
                .joinToString("") { it.take(1).uppercase() }
                .ifBlank { "P" }
            Text(
                text = initials,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.ExtraBold,
                color = PortalPatientsAction,
            )
        }
    }
}

@Composable
fun ShareDocumentToPatientButton(
    patient: PrescriptionPatientItem?,
    documentTitle: String,
    cuir: String,
    context: Context,
    modifier: Modifier = Modifier,
) {
    val contact = patient?.contact?.trim().orEmpty()
    val verifyUrl = "https://www.autamedica.com/verify/$cuir"
    val fallbackName = stringResource(R.string.doctor_dni_share_patient_fallback)
    val patientName = patient?.fullName?.takeIf { it.isNotBlank() } ?: fallbackName
    val shareMessage = stringResource(R.string.doctor_dni_share_message_fmt, patientName, documentTitle, cuir, verifyUrl)

    OutlinedButton(
        onClick = {
            runCatching {
                val digits = contact.filter(Char::isDigit)
                if (digits.length >= 8 && !contact.contains("@")) {
                    val waUri = Uri.parse("https://wa.me/$digits?text=" + Uri.encode(shareMessage))
                    context.startActivity(Intent(Intent.ACTION_VIEW, waUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } else if (contact.contains("@")) {
                    val mailIntent = Intent(Intent.ACTION_SENDTO).apply {
                        data = Uri.parse("mailto:$contact")
                        putExtra(Intent.EXTRA_SUBJECT, "$documentTitle AutaMedica - $cuir")
                        putExtra(Intent.EXTRA_TEXT, shareMessage)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(mailIntent)
                } else {
                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, shareMessage)
                    }
                    context.startActivity(Intent.createChooser(sendIntent, documentTitle).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
        },
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.5.dp, AuEmerald),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF065F46)),
    ) {
        Icon(Icons.Outlined.Share, contentDescription = null, tint = AuEmerald, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = if (contact.isNotBlank()) {
                stringResource(R.string.doctor_dni_share_direct_btn, contact)
            } else {
                stringResource(R.string.doctor_dni_share_generic_btn)
            },
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
