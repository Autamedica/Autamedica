package com.autamedica.android.presentation.auth

import android.app.Activity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
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
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.ErrorContainer
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
                } catch (e: GetCredentialCancellationException) {
                    // User cancelled, no error needed
                } catch (e: Exception) {
                    viewModel.onGoogleSignInError(e)
                }
            }
        }
    }

    // Splash / session checking
    if (uiState.isCheckingSession) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(AuBackground),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "AutaMedica",
                    style = MaterialTheme.typography.headlineLarge,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 32.sp,
                )
                Spacer(modifier = Modifier.height(24.dp))
                CircularProgressIndicator(
                    color = AuAccent,
                    strokeWidth = 2.dp,
                )
            }
        }
        return
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(AuBackground),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(48.dp))

            // Brand
            Text(
                text = "AutaMedica",
                style = MaterialTheme.typography.headlineLarge,
                color = AuTextPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 36.sp,
                letterSpacing = (-1).sp,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Tu salud, conectada",
                style = MaterialTheme.typography.bodyMedium,
                color = AuTextTertiary,
            )

            Spacer(modifier = Modifier.height(40.dp))

            // Login card (dark surface)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(AuSurface)
                    .border(1.dp, AuBorder, RoundedCornerShape(16.dp))
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = stringResource(R.string.login_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = AuTextPrimary,
                )

                Spacer(modifier = Modifier.height(24.dp))

                // Google Sign-In button
                OutlinedButton(
                    onClick = launchGoogleSignIn,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    enabled = !uiState.isLoading && !uiState.isGoogleLoading,
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, AuBorder),
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
                            tint = androidx.compose.ui.graphics.Color.Unspecified,
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            "Continuar con Google",
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Divider
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

                Spacer(modifier = Modifier.height(20.dp))

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
                    onValueChange = viewModel::onEmailChange,
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
                    shape = RoundedCornerShape(12.dp),
                    colors = textFieldColors,
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = uiState.password,
                    onValueChange = viewModel::onPasswordChange,
                    label = { Text(stringResource(R.string.login_password_label)) },
                    leadingIcon = {
                        Icon(
                            Icons.Default.Lock,
                            contentDescription = null,
                            tint = AuTextTertiary,
                        )
                    },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                if (passwordVisible) Icons.Default.VisibilityOff
                                else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "Ocultar" else "Mostrar",
                                tint = AuTextTertiary,
                            )
                        }
                    },
                    visualTransformation = if (passwordVisible) VisualTransformation.None
                    else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            focusManager.clearFocus()
                            viewModel.onLogin()
                        },
                    ),
                    singleLine = true,
                    enabled = !uiState.isLoading && !uiState.isGoogleLoading,
                    shape = RoundedCornerShape(12.dp),
                    colors = textFieldColors,
                    modifier = Modifier.fillMaxWidth(),
                )

                // Error
                AnimatedVisibility(
                    visible = uiState.error != null,
                    enter = fadeIn() + slideInVertically(),
                ) {
                    uiState.error?.let { error ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 12.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(ErrorContainer)
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = error,
                                color = AuDanger,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = {
                        focusManager.clearFocus()
                        viewModel.onLogin()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    enabled = uiState.email.isNotBlank()
                        && uiState.password.isNotBlank()
                        && !uiState.isLoading
                        && !uiState.isGoogleLoading,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AuAccent,
                        contentColor = AuBackground,
                        disabledContainerColor = AuBorder,
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

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "Plataforma de telemedicina",
                style = MaterialTheme.typography.bodySmall,
                color = AuTextTertiary,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(48.dp))
        }
    }
}
