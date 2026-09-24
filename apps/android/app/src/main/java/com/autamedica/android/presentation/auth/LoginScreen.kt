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
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
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
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.BuildConfig
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
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: (UserRole) -> Unit,
    onNavigateToForgotPassword: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val coroutineScope = rememberCoroutineScope()
    var passwordVisible by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.loggedInUser) {
        if (uiState.loggedInUser != null) {
            onLoginSuccess()
        }
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

    if (uiState.isCheckingSession) {
        WelcomeLoadingState(modifier = modifier)
        return
    }

    val scrollState = rememberScrollState()
    val activeColor = when (uiState.selectedRole) {
        UserRole.PATIENT -> PortalPatients
        UserRole.DOCTOR -> PortalDoctors
        UserRole.PHARMACIST -> PortalPharmacists
        else -> PortalCompanies
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
            // ── AutaMedica Branding ──
            AutamedicaHeader()

            // ── Role Segmented Selector (Matching Web Tabs) ──
            RoleSegmentedPicker(
                selectedRole = uiState.selectedRole,
                onRoleSelected = viewModel::onRoleChange,
            )

            // ── Role Heading ──
            RoleHeading(
                selectedRole = uiState.selectedRole,
            )

            // ── Main Login Form Card ──
            LoginFormCard(
                uiState = uiState,
                activeColor = activeColor,
                passwordVisible = passwordVisible,
                onPasswordVisibilityToggle = { passwordVisible = !passwordVisible },
                onGoogleSignIn = launchGoogleSignIn,
                onEmailChange = viewModel::onEmailChange,
                onPasswordChange = viewModel::onPasswordChange,
                onForgotPasswordClick = {
                    onNavigateToForgotPassword()
                },
                onSubmit = {
                    focusManager.clearFocus()
                    viewModel.onLogin()
                },
            )

            // ── Register Link (Matching Web Footer) ──
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
            ) {
                Text(
                    text = stringResource(R.string.auth_no_account) + " ",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextSecondary,
                )
                Text(
                    text = stringResource(R.string.auth_register_now),
                    style = MaterialTheme.typography.bodySmall,
                    color = activeColor,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable {
                        onNavigateToRegister(uiState.selectedRole)
                    },
                )
            }

            // ── Security & Privacy Legend ──
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

/**
 * Encabezado con el isotipo oficial de AutaMedica:
 * Contenedor squircle (96x96dp) color obsidiana (#09090B), esquinas de 30dp (rounded-[2rem]),
 * anillo translúcido (border-white/10) y sombra de vidrio ahumado profunda.
 */
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
                contentDescription = "AutaMedica",
                modifier = Modifier
                    .size(76.dp)
                    .clip(RoundedCornerShape(16.dp)),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

/**
 * Título minimalista según el rol seleccionado
 */
@Composable
private fun RoleHeading(
    selectedRole: UserRole,
) {
    val title = when (selectedRole) {
        UserRole.PATIENT -> stringResource(R.string.login_title)
        UserRole.DOCTOR -> stringResource(R.string.auth_role_doctor_access)
        UserRole.PHARMACIST -> stringResource(R.string.auth_role_pharmacy_access)
        else -> stringResource(R.string.auth_role_company_access)
    }

    Text(
        text = title,
        style = MaterialTheme.typography.headlineMedium,
        color = AuTextPrimary,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        letterSpacing = (-0.5).sp,
    )
}

/**
 * Selector segmentado de 4 portales (Paciente, Médico, Farmacia, Empresa)
 * idéntico a las pestañas de selección de rol de la web de AutaMedica.
 */
@Composable
private fun RoleSegmentedPicker(
    selectedRole: UserRole,
    onRoleSelected: (UserRole) -> Unit,
) {
    val roles = listOf(
        Triple(UserRole.PATIENT, stringResource(R.string.auth_role_patient), com.autamedica.android.presentation.theme.PortalPatients to com.autamedica.android.presentation.theme.PortalPatientsSoft),
        Triple(UserRole.DOCTOR, stringResource(R.string.auth_role_doctor), com.autamedica.android.presentation.theme.PortalDoctors to com.autamedica.android.presentation.theme.PortalDoctorsSoft),
        Triple(UserRole.PHARMACIST, stringResource(R.string.auth_role_pharmacy), com.autamedica.android.presentation.theme.PortalPharmacists to com.autamedica.android.presentation.theme.PortalPharmacistsSoft),
        Triple(UserRole.COMPANY, stringResource(R.string.auth_role_company), com.autamedica.android.presentation.theme.PortalCompanies to com.autamedica.android.presentation.theme.PortalCompaniesSoft),
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

/**
 * Tarjeta contenedora de autenticación con Google Sign-In, divisor,
 * campos de email/password, recuperación de clave y botón de acceso por rol.
 */
@Composable
private fun LoginFormCard(
    uiState: LoginUiState,
    activeColor: Color,
    passwordVisible: Boolean,
    onPasswordVisibilityToggle: () -> Unit,
    onGoogleSignIn: () -> Unit,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onForgotPasswordClick: () -> Unit,
    onSubmit: () -> Unit,
) {
    val focusManager = LocalFocusManager.current
    val buttonLabel = when (uiState.selectedRole) {
        UserRole.PATIENT, UserRole.DOCTOR -> stringResource(R.string.auth_login_action)
        else -> stringResource(R.string.auth_go_to_web)
    }

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
            // Google Sign-In
            OutlinedButton(
                onClick = onGoogleSignIn,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                enabled = !uiState.isLoading && !uiState.isGoogleLoading,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, AuBorder),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = AuBackground,
                    contentColor = AuTextPrimary,
                    disabledContainerColor = AuBackground,
                    disabledContentColor = AuTextTertiary,
                ),
            ) {
                if (uiState.isGoogleLoading) {
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
                        text = stringResource(R.string.auth_login_with_google),
                        fontWeight = FontWeight.Medium,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            // Divider
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HorizontalDivider(modifier = Modifier.weight(1f), color = AuBorder)
                Text(
                    text = stringResource(R.string.auth_or_with_email),
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

            // Email field
            OutlinedTextField(
                value = uiState.email,
                onValueChange = onEmailChange,
                label = { Text(stringResource(R.string.login_email_label)) },
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
                enabled = !uiState.isLoading && !uiState.isGoogleLoading,
                shape = RoundedCornerShape(14.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth(),
            )

            // Password section with top label row matching web layout
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.login_password_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = AuTextSecondary,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        text = stringResource(R.string.auth_forgot_password),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuTextTertiary,
                        modifier = Modifier.clickable(onClick = onForgotPasswordClick),
                    )
                }

                OutlinedTextField(
                    value = uiState.password,
                    onValueChange = onPasswordChange,
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
                                contentDescription = if (passwordVisible) stringResource(R.string.auth_hide_password) else stringResource(R.string.auth_show_password),
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
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            focusManager.clearFocus()
                            onSubmit()
                        },
                    ),
                    singleLine = true,
                    enabled = !uiState.isLoading && !uiState.isGoogleLoading,
                    shape = RoundedCornerShape(14.dp),
                    colors = textFieldColors,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Error banner
            AnimatedVisibility(
                visible = uiState.error != null,
                enter = fadeIn() + slideInVertically(),
            ) {
                uiState.error?.let { error ->
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
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = AuDanger,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = error,
                            color = AuDanger,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            // Submit Button
            Button(
                onClick = {
                    focusManager.clearFocus()
                    onSubmit()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                enabled = !uiState.isLoading && !uiState.isGoogleLoading,
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = activeColor,
                    contentColor = Color.White,
                    disabledContainerColor = AuSurfaceHover,
                    disabledContentColor = AuTextTertiary,
                ),
            ) {
                if (uiState.isLoading) {
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

/**
 * Estado de carga inicial con el logo biocerámico de AutaMedica
 */
@Composable
private fun WelcomeLoadingState(
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(AuBackground)
            .safeDrawingPadding(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(
                modifier = Modifier.size(96.dp),
                shape = RoundedCornerShape(32.dp),
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
                        contentDescription = "AutaMedica",
                        modifier = Modifier
                            .size(80.dp)
                            .clip(RoundedCornerShape(16.dp)),
                        contentScale = ContentScale.Fit,
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "AutaMedica",
                style = MaterialTheme.typography.headlineLarge,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.8).sp,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.auth_logging_in),
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextSecondary,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(24.dp))

            CircularProgressIndicator(
                color = PortalPatients,
                strokeWidth = 2.dp,
            )
        }
    }
}
