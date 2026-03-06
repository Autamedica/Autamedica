package com.autamedica.android.presentation.auth

import android.app.Activity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
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
import androidx.compose.ui.zIndex
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autamedica.android.BuildConfig
import com.autamedica.android.R
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBackground
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuDanger
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
import com.autamedica.android.presentation.theme.PortalDoctors
import com.autamedica.android.presentation.theme.PortalPatients
import com.autamedica.android.presentation.theme.PrimaryLight
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    var passwordVisible by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

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
                } catch (_: GetCredentialCancellationException) {
                    // User cancelled, no error needed.
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

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(AuBackground)
            .safeDrawingPadding()
            .imePadding(),
    ) {
        WelcomeBackdrop()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            WelcomeHeroCard()

            LoginFormCard(
                uiState = uiState,
                passwordVisible = passwordVisible,
                onPasswordVisibilityToggle = { passwordVisible = !passwordVisible },
                onGoogleSignIn = launchGoogleSignIn,
                onEmailChange = viewModel::onEmailChange,
                onPasswordChange = viewModel::onPasswordChange,
                onSubmit = {
                    focusManager.clearFocus()
                    viewModel.onLogin()
                },
            )

            Text(
                text = "Tus recordatorios, turnos y videoconsultas quedan sincronizados en una sola experiencia.",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
            )
        }
    }
}

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
        WelcomeBackdrop()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(
                modifier = Modifier.size(92.dp),
                shape = RoundedCornerShape(28.dp),
                color = AuSurface,
                border = BorderStroke(1.dp, AuBorder),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    androidx.compose.foundation.Image(
                        painter = painterResource(id = R.drawable.ic_launcher_foreground),
                        contentDescription = null,
                        modifier = Modifier.size(58.dp),
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
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Preparando tu acceso a la clinica digital.",
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextSecondary,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(26.dp))

            CircularProgressIndicator(
                color = AuAccent,
                strokeWidth = 2.dp,
            )
        }
    }
}

@Composable
private fun WelcomeBackdrop() {
    Box(modifier = Modifier.fillMaxSize()) {
        Surface(
            modifier = Modifier
                .size(220.dp)
                .offset(x = 118.dp, y = (-42).dp)
                .align(Alignment.TopEnd),
            shape = CircleShape,
            color = PortalDoctors.copy(alpha = 0.14f),
        ) {}

        Surface(
            modifier = Modifier
                .size(170.dp)
                .offset(x = (-72).dp, y = 96.dp)
                .align(Alignment.TopStart),
            shape = CircleShape,
            color = PortalPatients.copy(alpha = 0.1f),
        ) {}

        Surface(
            modifier = Modifier
                .size(240.dp)
                .offset(x = (-110).dp, y = 160.dp)
                .align(Alignment.BottomStart),
            shape = CircleShape,
            color = PrimaryLight.copy(alpha = 0.08f),
        ) {}
    }
}

@Composable
private fun WelcomeHeroCard() {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .zIndex(1f),
        shape = RoundedCornerShape(28.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Surface(
                    modifier = Modifier.size(54.dp),
                    shape = RoundedCornerShape(18.dp),
                    color = AuBackground,
                    border = BorderStroke(1.dp, AuBorder),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        androidx.compose.foundation.Image(
                            painter = painterResource(id = R.drawable.ic_launcher_foreground),
                            contentDescription = null,
                            modifier = Modifier.size(34.dp),
                        )
                    }
                }

                Column {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = PortalPatients.copy(alpha = 0.14f),
                    ) {
                        Text(
                            text = "Telemedicina activa",
                            color = PortalPatients,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Bienvenido a AutaMedica",
                        style = MaterialTheme.typography.headlineMedium,
                        color = AuTextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            Text(
                text = "Un solo lugar para ingresar a tu consulta, gestionar turnos y mantener el seguimiento clinico sin friccion.",
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextSecondary,
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                WelcomeTagChip(label = "Turnos inteligentes")
                WelcomeTagChip(label = "Videollamada segura")
                WelcomeTagChip(label = "Historial conectado")
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                WelcomeFeatureRow(
                    icon = Icons.Outlined.CalendarMonth,
                    iconTint = PortalDoctors,
                    title = "Agenda clara",
                    description = "Revisa disponibilidad, recordatorios y proximos pasos sin salir del flujo.",
                )
                WelcomeFeatureRow(
                    icon = Icons.Default.Videocam,
                    iconTint = PortalPatients,
                    title = "Consulta inmediata",
                    description = "Entra a tu videoconsulta apenas la sala este habilitada desde tu turno.",
                )
                WelcomeFeatureRow(
                    icon = Icons.Outlined.MedicalServices,
                    iconTint = AuAccent,
                    title = "Seguimiento continuo",
                    description = "Perfil, salud preventiva y mensajes en una experiencia pensada para mobile.",
                )
            }
        }
    }
}

@Composable
private fun WelcomeTagChip(label: String) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = AuBackground,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = AuTextSecondary,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
        )
    }
}

@Composable
private fun WelcomeFeatureRow(
    icon: ImageVector,
    iconTint: Color,
    title: String,
    description: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(AuBackground)
            .border(1.dp, AuBorder, RoundedCornerShape(18.dp))
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Surface(
            modifier = Modifier.size(40.dp),
            shape = RoundedCornerShape(14.dp),
            color = iconTint.copy(alpha = 0.14f),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.padding(9.dp),
                tint = iconTint,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = AuTextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
            )
        }
    }
}

@Composable
private fun LoginFormCard(
    uiState: LoginUiState,
    passwordVisible: Boolean,
    onPasswordVisibilityToggle: () -> Unit,
    onGoogleSignIn: () -> Unit,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val focusManager = LocalFocusManager.current

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp),
        color = AuSurface,
        border = BorderStroke(1.dp, AuBorder),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "Continua con tu cuenta",
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "Ingresa para acceder a turnos, telemedicina y seguimiento personalizado.",
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                )
            }

            OutlinedButton(
                onClick = onGoogleSignIn,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                enabled = !uiState.isLoading && !uiState.isGoogleLoading,
                shape = RoundedCornerShape(16.dp),
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
                        modifier = Modifier.size(20.dp),
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
                        text = "Continuar con Google",
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HorizontalDivider(
                    modifier = Modifier.weight(1f),
                    color = AuBorder,
                )
                Text(
                    text = "o",
                    modifier = Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = AuTextTertiary,
                )
                HorizontalDivider(
                    modifier = Modifier.weight(1f),
                    color = AuBorder,
                )
            }

            val textFieldColors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = AuTextPrimary,
                unfocusedTextColor = AuTextPrimary,
                focusedContainerColor = AuBackground,
                unfocusedContainerColor = AuBackground,
                focusedBorderColor = PrimaryLight,
                unfocusedBorderColor = AuBorder,
                focusedLabelColor = PrimaryLight,
                unfocusedLabelColor = AuTextTertiary,
                cursorColor = AuAccent,
            )

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
                shape = RoundedCornerShape(16.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = uiState.password,
                onValueChange = onPasswordChange,
                label = { Text(stringResource(R.string.login_password_label)) },
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
                            contentDescription = if (passwordVisible) "Ocultar" else "Mostrar",
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
                shape = RoundedCornerShape(16.dp),
                colors = textFieldColors,
                modifier = Modifier.fillMaxWidth(),
            )

            AnimatedVisibility(
                visible = uiState.error != null,
                enter = fadeIn() + slideInVertically(),
            ) {
                uiState.error?.let { error ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(ErrorContainer)
                            .padding(horizontal = 14.dp, vertical = 12.dp),
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
                            text = error,
                            color = AuDanger,
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
                enabled = uiState.email.isNotBlank()
                    && uiState.password.isNotBlank()
                    && !uiState.isLoading
                    && !uiState.isGoogleLoading,
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AuAccent,
                    contentColor = AuBackground,
                    disabledContainerColor = AuSurfaceHover,
                    disabledContentColor = AuTextTertiary,
                ),
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = AuBackground,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text(
                        text = stringResource(R.string.login_button),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}
