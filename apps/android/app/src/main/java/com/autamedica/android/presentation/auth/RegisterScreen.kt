package com.autamedica.android.presentation.auth

import android.app.Activity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.autamedica.android.BuildConfig
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.R
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuBorderHover
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.LogoObsidianBg
import com.autamedica.android.presentation.theme.LogoRingBorder
import com.autamedica.android.presentation.theme.PortalCompanies
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.PortalPharmacists
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun RegisterScreen(
    initialRoleName: String = "patient",
    onNavigateToLogin: () -> Unit,
    onRegisterSuccess: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: RegisterViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val coroutineScope = rememberCoroutineScope()

    var passwordVisible by remember { mutableStateOf(false) }
    var confirmPasswordVisible by remember { mutableStateOf(false) }

    LaunchedEffect(initialRoleName) {
        val role = UserRole.entries.find { it.wireName == initialRoleName } ?: UserRole.PATIENT
        viewModel.onRoleChange(role)
    }

    LaunchedEffect(uiState.isRegistered, uiState.loggedInUser) {
        if (uiState.isRegistered && uiState.loggedInUser != null) {
            onRegisterSuccess()
        }
    }

    val scrollState = rememberScrollState()
    val activeColor = when (uiState.selectedRole) {
        UserRole.PATIENT -> PortalPatients
        UserRole.DOCTOR -> PortalDoctors
        UserRole.PHARMACIST -> PortalPharmacists
        else -> PortalCompanies
    }

    val launchGoogleSignIn: () -> Unit = remember(context) {
        {
            coroutineScope.launch {
                try {
                    val credentialManager = CredentialManager.create(context)
                    val googleIdOption = GetGoogleIdOption.Builder()
                        .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                        .setFilterByAuthorizedAccounts(false)
                        .build()
                    val request = GetCredentialRequest.Builder()
                        .addCredentialOption(googleIdOption)
                        .build()
                    val result = credentialManager.getCredential(
                        request = request,
                        context = context as Activity,
                    )
                    val googleIdTokenCredential = GoogleIdTokenCredential
                        .createFrom(result.credential.data)
                    viewModel.onGoogleSignIn(googleIdTokenCredential.idToken)
                } catch (e: GetCredentialCancellationException) {
                    viewModel.onGoogleSignInError(e)
                } catch (e: Exception) {
                    viewModel.onGoogleSignInError(e)
                }
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(AuBackground)
            .safeDrawingPadding()
            .imePadding(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 20.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            AutamedicaHeader()

            RoleSegmentedPicker(
                selectedRole = uiState.selectedRole,
                onRoleSelected = { viewModel.onRoleChange(it) },
            )

            RoleHeading(
                selectedRole = uiState.selectedRole,
            )

            RegisterFormCard(
                email = uiState.email,
                onEmailChange = { viewModel.onEmailChange(it) },
                password = uiState.password,
                onPasswordChange = { viewModel.onPasswordChange(it) },
                confirmPassword = uiState.confirmPassword,
                onConfirmPasswordChange = { viewModel.onConfirmPasswordChange(it) },
                passwordVisible = passwordVisible,
                onPasswordVisibilityToggle = { passwordVisible = !passwordVisible },
                confirmPasswordVisible = confirmPasswordVisible,
                onConfirmPasswordVisibilityToggle = { confirmPasswordVisible = !confirmPasswordVisible },
                acceptedTerms = uiState.acceptedTerms,
                onAcceptedTermsChange = { viewModel.onTermsToggle(it) },
                activeColor = activeColor,
                isLoading = uiState.isLoading,
                isGoogleLoading = uiState.isGoogleLoading,
                error = uiState.error,
                message = uiState.successMessage,
                onGoogleSignIn = launchGoogleSignIn,
                onSubmit = {
                    focusManager.clearFocus()
                    viewModel.onRegister()
                },
                onTermsClick = { uriHandler.openUri("https://www.autamedica.com/terms") },
                onPrivacyClick = { uriHandler.openUri("https://www.autamedica.com/privacidad") }
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
            ) {
                Text(
                    text = stringResource(R.string.register_already_have_account),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
                Text(
                    text = stringResource(R.string.register_login_link),
                    style = MaterialTheme.typography.bodySmall,
                    color = activeColor,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { onNavigateToLogin() },
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp, bottom = 12.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.Lock,
                    contentDescription = null,
                    tint = AuTextTertiary,
                    modifier = Modifier.size(13.dp),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = stringResource(R.string.auth_encrypted_connection),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun AutamedicaHeader() {
    Surface(
        modifier = Modifier.size(96.dp),
        shape = RoundedCornerShape(30.dp),
        color = LogoObsidianBg,
        border = BorderStroke(1.dp, LogoRingBorder),
        shadowElevation = 16.dp,
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.fillMaxSize(),
        ) {
            Image(
                painter = painterResource(id = R.drawable.logo_autamedica),
                contentDescription = stringResource(R.string.app_name),
                modifier = Modifier
                    .size(76.dp)
                    .clip(RoundedCornerShape(16.dp)),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

@Composable
private fun RoleHeading(
    selectedRole: UserRole,
) {
    val title = when (selectedRole) {
        UserRole.PATIENT -> stringResource(R.string.register_title_patient)
        UserRole.DOCTOR -> stringResource(R.string.register_title_doctor)
        UserRole.PHARMACIST -> stringResource(R.string.register_title_pharmacist)
        else -> stringResource(R.string.register_title_company)
    }

    val subtitle = when (selectedRole) {
        UserRole.PATIENT -> stringResource(R.string.register_subtitle_patient)
        UserRole.DOCTOR -> stringResource(R.string.register_subtitle_doctor)
        UserRole.PHARMACIST -> stringResource(R.string.register_subtitle_pharmacist)
        else -> stringResource(R.string.register_subtitle_company)
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = AuTextPrimary,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            letterSpacing = (-0.5).sp,
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = AuTextSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun RoleSegmentedPicker(
    selectedRole: UserRole,
    onRoleSelected: (UserRole) -> Unit,
) {
    val roles = listOf(
        Triple(UserRole.PATIENT, stringResource(R.string.register_role_patient), com.autamedica.android.presentation.theme.PortalPatients to com.autamedica.android.presentation.theme.PortalPatientsSoft),
        Triple(UserRole.DOCTOR, stringResource(R.string.register_role_doctor), com.autamedica.android.presentation.theme.PortalDoctors to com.autamedica.android.presentation.theme.PortalDoctorsSoft),
        Triple(UserRole.PHARMACIST, stringResource(R.string.register_role_pharmacist), com.autamedica.android.presentation.theme.PortalPharmacists to com.autamedica.android.presentation.theme.PortalPharmacistsSoft),
        Triple(UserRole.COMPANY, stringResource(R.string.register_role_company), com.autamedica.android.presentation.theme.PortalCompanies to com.autamedica.android.presentation.theme.PortalCompaniesSoft),
    )

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            roles.forEach { (role, label, colorPair) ->
                val (roleColor, roleSoft) = colorPair
                val isSelected = selectedRole == role

                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (isSelected) roleSoft else Color.Transparent)
                        .border(
                            width = 1.dp,
                            color = if (isSelected) roleColor.copy(alpha = 0.5f) else Color.Transparent,
                            shape = RoundedCornerShape(14.dp),
                        )
                        .clickable { onRoleSelected(role) }
                        .padding(vertical = 10.dp),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        when (role) {
                            UserRole.PATIENT -> Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = if (isSelected) roleColor else AuTextTertiary,
                                modifier = Modifier.size(18.dp),
                            )
                            UserRole.DOCTOR -> Icon(
                                imageVector = Icons.Outlined.MedicalServices,
                                contentDescription = null,
                                tint = if (isSelected) roleColor else AuTextTertiary,
                                modifier = Modifier.size(18.dp),
                            )
                            UserRole.PHARMACIST -> Icon(
                                painter = painterResource(id = R.drawable.ic_medical_cross_outline),
                                contentDescription = null,
                                tint = if (isSelected) roleColor else AuTextTertiary,
                                modifier = Modifier.size(18.dp),
                            )
                            else -> Icon(
                                painter = painterResource(id = R.drawable.ic_profile_outline),
                                contentDescription = null,
                                tint = if (isSelected) roleColor else AuTextTertiary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                        Text(
                            text = label,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            color = if (isSelected) AuTextPrimary else AuTextTertiary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RegisterFormCard(
    email: String,
    onEmailChange: (String) -> Unit,
    password: String,
    onPasswordChange: (String) -> Unit,
    confirmPassword: String,
    onConfirmPasswordChange: (String) -> Unit,
    passwordVisible: Boolean,
    onPasswordVisibilityToggle: () -> Unit,
    confirmPasswordVisible: Boolean,
    onConfirmPasswordVisibilityToggle: () -> Unit,
    acceptedTerms: Boolean,
    onAcceptedTermsChange: (Boolean) -> Unit,
    activeColor: Color,
    isLoading: Boolean,
    isGoogleLoading: Boolean,
    error: String?,
    message: String?,
    onGoogleSignIn: () -> Unit,
    onSubmit: () -> Unit,
    onTermsClick: () -> Unit,
    onPrivacyClick: () -> Unit,
) {
    val focusManager = LocalFocusManager.current
    val buttonLabel = stringResource(R.string.register_button_submit)

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            OutlinedButton(
                onClick = onGoogleSignIn,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                enabled = !isLoading && !isGoogleLoading,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, AuBorder),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = AuBackground,
                    contentColor = AuTextPrimary,
                    disabledContainerColor = AuBackground,
                    disabledContentColor = AuTextTertiary,
                ),
            ) {
                if (isGoogleLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = AuTextSecondary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_google),
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = Color.Unspecified,
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = stringResource(R.string.register_continue_google),
                        fontWeight = FontWeight.Medium,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HorizontalDivider(modifier = Modifier.weight(1f), color = AuBorder)
                Text(
                    text = stringResource(R.string.register_or_email),
                    modifier = Modifier.padding(horizontal = 12.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = AuTextTertiary,
                )
                HorizontalDivider(modifier = Modifier.weight(1f), color = AuBorder)
            }

            val textFieldColors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = AuTextPrimary,
                unfocusedTextColor = AuTextPrimary,
                focusedContainerColor = AuBackground,
                unfocusedContainerColor = AuBackground,
                focusedBorderColor = activeColor,
                unfocusedBorderColor = AuBorder,
                focusedLabelColor = activeColor,
                unfocusedLabelColor = AuTextTertiary,
                cursorColor = activeColor,
            )

            OutlinedTextField(
                value = email,
                onValueChange = onEmailChange,
                label = { Text(stringResource(R.string.register_email_label)) },
                leadingIcon = {
                    Icon(
                        Icons.Default.Email,
                        contentDescription = null,
                        tint = AuTextTertiary,
                    )
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                singleLine = true,
                enabled = !isLoading && !isGoogleLoading,
                shape = RoundedCornerShape(14.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = password,
                onValueChange = onPasswordChange,
                label = { Text(stringResource(R.string.register_password_label)) },
                leadingIcon = {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        tint = AuTextTertiary,
                    )
                },
                trailingIcon = {
                    IconButton(onClick = onPasswordVisibilityToggle) {
                        Icon(
                            if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = if (passwordVisible) stringResource(R.string.common_hide) else stringResource(R.string.common_show),
                            tint = AuTextTertiary,
                        )
                    }
                },
                visualTransformation = if (passwordVisible) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Next,
                ),
                singleLine = true,
                enabled = !isLoading && !isGoogleLoading,
                shape = RoundedCornerShape(14.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = confirmPassword,
                onValueChange = onConfirmPasswordChange,
                label = { Text(stringResource(R.string.register_confirm_password_label)) },
                leadingIcon = {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        tint = AuTextTertiary,
                    )
                },
                trailingIcon = {
                    IconButton(onClick = onConfirmPasswordVisibilityToggle) {
                        Icon(
                            if (confirmPasswordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = if (confirmPasswordVisible) stringResource(R.string.common_hide) else stringResource(R.string.common_show),
                            tint = AuTextTertiary,
                        )
                    }
                },
                visualTransformation = if (confirmPasswordVisible) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(
                    onDone = {
                        focusManager.clearFocus()
                        onSubmit()
                    },
                ),
                singleLine = true,
                enabled = !isLoading && !isGoogleLoading,
                shape = RoundedCornerShape(14.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(
                    checked = acceptedTerms,
                    onCheckedChange = onAcceptedTermsChange,
                    colors = CheckboxDefaults.colors(checkedColor = activeColor)
                )
                Text(
                    text = stringResource(R.string.register_accept_terms_prefix),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary
                )
                Text(
                    text = stringResource(R.string.register_terms_link),
                    style = MaterialTheme.typography.bodySmall,
                    color = activeColor,
                    modifier = Modifier.clickable { onTermsClick() }
                )
                Text(
                    text = stringResource(R.string.register_terms_and),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary
                )
                Text(
                    text = stringResource(R.string.register_privacy_link),
                    style = MaterialTheme.typography.bodySmall,
                    color = activeColor,
                    modifier = Modifier.clickable { onPrivacyClick() }
                )
            }

            AnimatedVisibility(
                visible = error != null,
                enter = fadeIn() + slideInVertically(),
            ) {
                error?.let { err ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(ErrorContainer)
                            .border(1.dp, AuDanger.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = AuDanger,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = err,
                            color = AuDanger,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
            
            AnimatedVisibility(
                visible = message != null,
                enter = fadeIn() + slideInVertically(),
            ) {
                message?.let { msg ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFFE8F5E9))
                            .border(1.dp, Color(0xFF4CAF50).copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF4CAF50),
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = msg,
                            color = Color(0xFF4CAF50),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            Button(
                onClick = {
                    focusManager.clearFocus()
                    onSubmit()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                enabled = email.isNotBlank()
                    && password.isNotBlank()
                    && confirmPassword.isNotBlank()
                    && acceptedTerms
                    && !isLoading
                    && !isGoogleLoading,
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = activeColor,
                    contentColor = Color.White,
                    disabledContainerColor = AuSurfaceHover,
                    disabledContentColor = AuTextTertiary,
                ),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text(
                        text = buttonLabel,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }
        }
    }
}
