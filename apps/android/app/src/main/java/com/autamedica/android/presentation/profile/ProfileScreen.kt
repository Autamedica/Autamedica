package com.autamedica.android.presentation.profile

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.autamedica.android.R
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
import com.autamedica.android.presentation.theme.PrimaryLight
import com.autamedica.android.presentation.theme.SuccessContainer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.profile_title),
                        color = AuTextPrimary,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
                            tint = AuTextSecondary,
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
                        .verticalScroll(rememberScrollState()),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Profile header
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(AuSurface)
                            .padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Surface(
                                modifier = Modifier.size(80.dp),
                                shape = CircleShape,
                                color = AuSurfaceHover,
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Person,
                                    contentDescription = null,
                                    modifier = Modifier.padding(20.dp),
                                    tint = AuTextSecondary,
                                )
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            uiState.user?.let { user ->
                                Text(
                                    text = if (uiState.firstName.isNotBlank())
                                        "${uiState.firstName} ${uiState.lastName}".trim()
                                    else user.email,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = AuTextPrimary,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = AuSurfaceHover,
                                ) {
                                    Text(
                                        text = user.role.name.lowercase()
                                            .replaceFirstChar { it.uppercase() },
                                        style = MaterialTheme.typography.labelMedium,
                                        color = AuTextSecondary,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(
                                            horizontal = 12.dp,
                                            vertical = 4.dp,
                                        ),
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = user.email,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AuTextTertiary,
                                )
                            }
                        }
                    }

                    // Form section
                    Column(modifier = Modifier.padding(24.dp)) {
                        Text(
                            text = "Informacion personal",
                            style = MaterialTheme.typography.titleSmall,
                            color = AuTextTertiary,
                            fontWeight = FontWeight.SemiBold,
                        )

                        Spacer(modifier = Modifier.height(16.dp))

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

                        OutlinedTextField(
                            value = uiState.firstName,
                            onValueChange = viewModel::onFirstNameChange,
                            label = { Text("Nombre") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = textFieldColors,
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = uiState.lastName,
                            onValueChange = viewModel::onLastNameChange,
                            label = { Text("Apellido") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
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
                                shape = RoundedCornerShape(8.dp),
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

                        Spacer(modifier = Modifier.height(24.dp))

                        Button(
                            onClick = viewModel::saveProfile,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            enabled = !uiState.isSaving && uiState.firstName.isNotBlank(),
                            shape = RoundedCornerShape(12.dp),
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
                                Spacer(modifier = Modifier.padding(4.dp))
                                Text(
                                    "Guardar cambios",
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
