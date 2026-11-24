package com.autamedica.android.presentation.doctors.onboarding

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.R
import com.autamedica.android.data.repository.BRAZIL_UFS
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSuccess
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.SuccessContainer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorOnboardingScreen(
    onBack: () -> Unit,
    onOnboardingSubmitted: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DoctorOnboardingViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var ufDropdownExpanded by remember { mutableStateOf(false) }

    val textFieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = PortalDoctors,
        unfocusedBorderColor = AuBorder,
        focusedLabelColor = PortalDoctors,
        unfocusedLabelColor = AuTextTertiary,
        focusedTextColor = AuTextPrimary,
        unfocusedTextColor = AuTextPrimary,
        focusedContainerColor = AuSurface,
        unfocusedContainerColor = AuSurface,
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.doctor_onboarding_title),
                            style = MaterialTheme.typography.titleLarge,
                            color = AuTextPrimary,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = stringResource(R.string.doctor_onboarding_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = AuTextTertiary,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.doctor_onboarding_back),
                            tint = AuTextPrimary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AuBackground),
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
                    CircularProgressIndicator(color = PortalDoctors)
                }
            }

            uiState.submittedSuccess -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = AuSurface,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = SuccessContainer,
                                modifier = Modifier.size(64.dp),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Filled.CheckCircle,
                                        contentDescription = null,
                                        tint = AuSuccess,
                                        modifier = Modifier.size(36.dp),
                                    )
                                }
                            }
                            Text(
                                text = stringResource(R.string.doctor_onboarding_success_title),
                                style = MaterialTheme.typography.titleLarge,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                            )
                            Text(
                                text = stringResource(R.string.doctor_onboarding_success_body),
                                style = MaterialTheme.typography.bodyMedium,
                                color = AuTextSecondary,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Button(
                                onClick = onOnboardingSubmitted,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PortalDoctors,
                                    contentColor = Color.White,
                                ),
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(50.dp),
                            ) {
                                Text(
                                    text = stringResource(R.string.doctor_onboarding_success_cta),
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = PortalDoctors.copy(alpha = 0.08f),
                        border = BorderStroke(1.dp, PortalDoctors.copy(alpha = 0.25f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.VerifiedUser,
                                contentDescription = null,
                                tint = PortalDoctors,
                                modifier = Modifier.size(22.dp),
                            )
                            Text(
                                text = stringResource(R.string.doctor_onboarding_review_notice),
                                style = MaterialTheme.typography.bodySmall,
                                color = AuTextSecondary,
                            )
                        }
                    }

                    // Country selection
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = AuSurface,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.doctor_onboarding_country_label),
                                style = MaterialTheme.typography.titleSmall,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                FilterChip(
                                    selected = uiState.careCountry == "AR",
                                    onClick = { viewModel.onCountryChange("AR") },
                                    label = { Text(stringResource(R.string.doctor_onboarding_country_ar)) },
                                    enabled = !uiState.isSubmitting,
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = PortalDoctors.copy(alpha = 0.14f),
                                        selectedLabelColor = PortalDoctors,
                                    ),
                                )
                                FilterChip(
                                    selected = uiState.careCountry == "BR",
                                    onClick = { viewModel.onCountryChange("BR") },
                                    label = { Text(stringResource(R.string.doctor_onboarding_country_br)) },
                                    enabled = !uiState.isSubmitting,
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = PortalDoctors.copy(alpha = 0.14f),
                                        selectedLabelColor = PortalDoctors,
                                    ),
                                )
                            }
                        }
                    }

                    // Personal data
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = AuSurface,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.doctor_onboarding_personal_section),
                                style = MaterialTheme.typography.titleSmall,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                            )
                            OutlinedTextField(
                                value = uiState.firstName,
                                onValueChange = viewModel::onFirstNameChange,
                                label = { Text(stringResource(R.string.doctor_onboarding_first_name)) },
                                singleLine = true,
                                enabled = !uiState.isSubmitting,
                                shape = RoundedCornerShape(14.dp),
                                colors = textFieldColors,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = uiState.lastName,
                                onValueChange = viewModel::onLastNameChange,
                                label = { Text(stringResource(R.string.doctor_onboarding_last_name)) },
                                singleLine = true,
                                enabled = !uiState.isSubmitting,
                                shape = RoundedCornerShape(14.dp),
                                colors = textFieldColors,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = uiState.phone,
                                onValueChange = viewModel::onPhoneChange,
                                label = { Text(stringResource(R.string.doctor_onboarding_phone)) },
                                singleLine = true,
                                enabled = !uiState.isSubmitting,
                                shape = RoundedCornerShape(14.dp),
                                colors = textFieldColors,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }

                    // Professional credentials
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = AuSurface,
                        border = BorderStroke(1.dp, AuBorder),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.doctor_onboarding_credentials_section),
                                style = MaterialTheme.typography.titleSmall,
                                color = AuTextPrimary,
                                fontWeight = FontWeight.SemiBold,
                            )

                            if (uiState.careCountry == "AR") {
                                Text(
                                    text = stringResource(R.string.doctor_onboarding_license_type_label),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = AuTextSecondary,
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    FilterChip(
                                        selected = uiState.licenseType == "MN",
                                        onClick = { viewModel.onLicenseTypeChange("MN") },
                                        label = { Text(stringResource(R.string.doctor_onboarding_license_mn)) },
                                        enabled = !uiState.isSubmitting,
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = PortalDoctors.copy(alpha = 0.14f),
                                            selectedLabelColor = PortalDoctors,
                                        ),
                                    )
                                    FilterChip(
                                        selected = uiState.licenseType == "MP",
                                        onClick = { viewModel.onLicenseTypeChange("MP") },
                                        label = { Text(stringResource(R.string.doctor_onboarding_license_mp)) },
                                        enabled = !uiState.isSubmitting,
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = PortalDoctors.copy(alpha = 0.14f),
                                            selectedLabelColor = PortalDoctors,
                                        ),
                                    )
                                }

                                OutlinedTextField(
                                    value = uiState.licenseNumber,
                                    onValueChange = viewModel::onLicenseNumberChange,
                                    label = { Text(stringResource(R.string.doctor_onboarding_license_number_ar)) },
                                    singleLine = true,
                                    enabled = !uiState.isSubmitting,
                                    shape = RoundedCornerShape(14.dp),
                                    colors = textFieldColors,
                                    modifier = Modifier.fillMaxWidth(),
                                )

                                OutlinedTextField(
                                    value = uiState.enrollmentJurisdiction,
                                    onValueChange = viewModel::onJurisdictionChange,
                                    label = { Text(stringResource(R.string.doctor_onboarding_jurisdiction)) },
                                    singleLine = true,
                                    enabled = !uiState.isSubmitting,
                                    shape = RoundedCornerShape(14.dp),
                                    colors = textFieldColors,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            } else {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = PortalDoctors.copy(alpha = 0.12f),
                                ) {
                                    Text(
                                        text = stringResource(R.string.doctor_onboarding_license_crm_badge),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = PortalDoctors,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                    )
                                }

                                OutlinedTextField(
                                    value = uiState.licenseNumber,
                                    onValueChange = viewModel::onLicenseNumberChange,
                                    label = { Text(stringResource(R.string.doctor_onboarding_license_number_br)) },
                                    singleLine = true,
                                    enabled = !uiState.isSubmitting,
                                    shape = RoundedCornerShape(14.dp),
                                    colors = textFieldColors,
                                    modifier = Modifier.fillMaxWidth(),
                                )

                                Box(modifier = Modifier.fillMaxWidth()) {
                                    OutlinedTextField(
                                        value = uiState.ufBrazil,
                                        onValueChange = {},
                                        readOnly = true,
                                        label = { Text(stringResource(R.string.doctor_onboarding_uf_label)) },
                                        trailingIcon = {
                                            Icon(
                                                imageVector = Icons.Filled.ArrowDropDown,
                                                contentDescription = null,
                                            )
                                        },
                                        singleLine = true,
                                        enabled = !uiState.isSubmitting,
                                        shape = RoundedCornerShape(14.dp),
                                        colors = textFieldColors,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable(enabled = !uiState.isSubmitting) {
                                                ufDropdownExpanded = true
                                            },
                                    )
                                    Box(
                                        modifier = Modifier
                                            .matchParentSize()
                                            .clickable(enabled = !uiState.isSubmitting) {
                                                ufDropdownExpanded = true
                                            },
                                    )
                                    DropdownMenu(
                                        expanded = ufDropdownExpanded,
                                        onDismissRequest = { ufDropdownExpanded = false },
                                        modifier = Modifier.heightIn(max = 280.dp),
                                    ) {
                                        BRAZIL_UFS.forEach { uf ->
                                            DropdownMenuItem(
                                                text = { Text(uf) },
                                                onClick = {
                                                    viewModel.onUfBrazilChange(uf)
                                                    ufDropdownExpanded = false
                                                },
                                            )
                                        }
                                    }
                                }

                                OutlinedTextField(
                                    value = uiState.cpf,
                                    onValueChange = viewModel::onCpfChange,
                                    label = { Text(stringResource(R.string.doctor_onboarding_cpf_optional)) },
                                    singleLine = true,
                                    enabled = !uiState.isSubmitting,
                                    shape = RoundedCornerShape(14.dp),
                                    colors = textFieldColors,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }

                            OutlinedTextField(
                                value = uiState.specialty,
                                onValueChange = viewModel::onSpecialtyChange,
                                label = { Text(stringResource(R.string.doctor_onboarding_specialty)) },
                                singleLine = true,
                                enabled = !uiState.isSubmitting,
                                shape = RoundedCornerShape(14.dp),
                                colors = textFieldColors,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }

                    uiState.error?.let { err ->
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = AuDanger.copy(alpha = 0.10f),
                            border = BorderStroke(1.dp, AuDanger.copy(alpha = 0.35f)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = err,
                                style = MaterialTheme.typography.bodySmall,
                                color = AuDanger,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }

                    Button(
                        onClick = viewModel::submit,
                        enabled = !uiState.isSubmitting,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PortalDoctors,
                            contentColor = Color.White,
                        ),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                    ) {
                        if (uiState.isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = Color.White,
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(
                                text = stringResource(R.string.doctor_onboarding_submitting),
                                fontWeight = FontWeight.SemiBold,
                            )
                        } else {
                            Text(
                                text = stringResource(R.string.doctor_onboarding_submit),
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
        }
    }
}
